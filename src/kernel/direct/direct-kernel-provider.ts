import { Kernel } from "@jupyterlab/services";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import {
  checkIpykernel,
  installIpykernel,
  launchIpykernel,
} from "../../interpreter";
import {
  DirectKernelMetadata,
  IKernelProvider,
  KernelConnectionInfo,
} from "../../types/kernel";
import { PythonEnvironment } from "../../types/interpreter";
import { logDebug, logError, logInfo, logWarn } from "../../utils";
import { findConsecutiveAvailablePorts } from "../../utils/port-finder";
import { DirectKernelConnection } from "./direct-kernel-connection";

// Constants
const CONNECTION_TIMEOUT_MS = 5000;
const CONNECTION_POLL_INTERVAL_MS = 100;
const USERNAME = "protium";

/**
 * DirectKernelProvider starts local Python kernels without Jupyter server
 */
export class DirectKernelProvider implements IKernelProvider {
  private tempDir: string;
  private kernelMetadata: Map<string, DirectKernelMetadata> = new Map();

  constructor() {
    this.tempDir = path.join(os.tmpdir(), "protium-kernels");
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Ensure ipykernel is installed, prompt user to install if not available
   * @param pythonPath Path to Python interpreter
   * @returns True if ipykernel is available
   */
  private async ensureIpykernelInstalled(pythonPath: string): Promise<boolean> {
    const checkResult = await checkIpykernel(pythonPath);
    if (checkResult.available) {
      return true;
    }

    if (!checkResult.canInstall) {
      vscode.window.showErrorMessage(
        `Cannot install ipykernel automatically. ${
          checkResult.error || ""
        }\nPlease install manually: pip install ipykernel`,
      );
      return false;
    }

    const userChoice = await vscode.window.showWarningMessage(
      "Protium requires ipykernel to execute Python code. Would you like to install it?",
      "Install",
      "Cancel",
    );

    if (userChoice !== "Install") {
      vscode.window.showInformationMessage(
        "Kernel start cancelled. To install ipykernel manually, run: pip install ipykernel",
      );
      return false;
    }

    const installed = await installIpykernel(pythonPath);
    if (!installed) {
      vscode.window.showErrorMessage(
        "Failed to install ipykernel. Please install manually: pip install ipykernel",
      );
      return false;
    }

    // Verify installation
    const verifyResult = await checkIpykernel(pythonPath);
    if (!verifyResult.available) {
      vscode.window.showErrorMessage(
        "ipykernel installation verification failed. Please install manually: pip install ipykernel",
      );
      return false;
    }

    return true;
  }

  /**
   * Generate Jupyter connection file
   * @param kernelId Kernel ID
   * @param filePath Path to write connection file
   * @param pythonEnv Python environment info for kernel name
   * @returns Kernel connection info
   */
  private async generateConnectionInfo(
    kernelId: string,
    filePath: string,
    pythonEnv?: PythonEnvironment,
  ): Promise<KernelConnectionInfo> {
    // Allocate 5 consecutive ports for kernel channels
    const portsNeeded = 5;
    const basePort = await findConsecutiveAvailablePorts(portsNeeded);

    // Use display name from environment info, or fallback to default
    const kernelName = pythonEnv?.displayName || "Python";

    const connectionInfo: KernelConnectionInfo = {
      kernel_id: kernelId,
      kernel_name: kernelName,
      transport: "tcp",
      shell_port: basePort,
      iopub_port: basePort + 1,
      control_port: basePort + 2,
      stdin_port: basePort + 3,
      hb_port: basePort + 4,
      ip: "127.0.0.1",
      key: uuidv4().replace(/-/g, ""),
      signature_scheme: "hmac-sha256",
    };

    fs.writeFileSync(filePath, JSON.stringify(connectionInfo, null, 2));
    logInfo(`Generated connection file at ${filePath}`);

    return connectionInfo;
  }

  /**
   * Wait for kernel connection to be established
   * @param kernelConnection Kernel connection to wait for
   */
  private async waitForConnection(
    kernelConnection: DirectKernelConnection,
  ): Promise<void> {
    const maxAttempts = Math.ceil(
      CONNECTION_TIMEOUT_MS / CONNECTION_POLL_INTERVAL_MS,
    );
    let attempts = 0;

    while (attempts < maxAttempts) {
      logDebug(`Waiting for kernel connection... Attempt ${attempts + 1}`);

      if (kernelConnection.connectionStatus === "connected") {
        logInfo(`Kernel connection established after ${attempts + 1} attempts`);
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, CONNECTION_POLL_INTERVAL_MS),
      );
      attempts++;
    }

    logError(
      `Connection timeout after ${maxAttempts} attempts (${CONNECTION_TIMEOUT_MS}ms)`,
    );
    throw new Error(`Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`);
  }

  /**
   * Launch kernel process and create connection
   * @param kernelId Kernel ID
   * @param pythonEnv Python environment info
   * @param connectionFilePath Connection file path
   * @param connectionInfo Kernel connection info
   * @returns Kernel connection
   */
  private async launchKernelAndConnect(
    kernelId: string,
    pythonEnv: PythonEnvironment,
    connectionFilePath: string,
    connectionInfo: KernelConnectionInfo,
  ): Promise<Kernel.IKernelConnection> {
    // Ensure ipykernel is installed
    const ipykernelReady = await this.ensureIpykernelInstalled(pythonEnv.path);
    if (!ipykernelReady) {
      throw new Error("ipykernel is not available");
    }

    // Launch kernel process
    logInfo(`Launching kernel process for kernel: ${kernelId}`);
    const process = launchIpykernel(pythonEnv.path, connectionFilePath, {
      onError: (error) => {
        vscode.window.showErrorMessage(
          `Kernel process failed: ${error.message}`,
        );
      },
      onExit: () => {
        // Cleanup on exit
        this.dispose(kernelId).catch((error) => {
          logError(`Error during kernel disposal on exit: ${error}`, error);
        });
      },
      onStdout: () => {},
      onStderr: () => {},
    });

    // Store kernel metadata
    this.kernelMetadata.set(kernelId, {
      process,
      connectionFilePath,
      pythonEnv,
    });

    // Create kernel connection
    const kernelModel: Kernel.IModel = {
      id: connectionInfo.kernel_id,
      name: connectionInfo.kernel_name,
    };

    const kernelConnection = new DirectKernelConnection({
      model: kernelModel,
      connectionInfo: connectionInfo,
      username: USERNAME,
      clientId: uuidv4(),
    });

    // Wait for connection to be ready
    await this.waitForConnection(kernelConnection);

    return kernelConnection as Kernel.IKernelConnection;
  }

  /**
   * Provide a kernel connection by starting a new local Python process
   * @param pythonEnv Python environment to use for kernel
   * @returns Kernel connection
   */
  async provide(pythonEnv: PythonEnvironment): Promise<Kernel.IKernelConnection> {
    // Generate kernel ID and connection info
    const kernelId = uuidv4();
    const filePath = path.join(this.tempDir, `kernel-${kernelId}.json`);
    const connectionInfo = await this.generateConnectionInfo(
      kernelId,
      filePath,
      pythonEnv,
    );

    return this.launchKernelAndConnect(
      kernelId,
      pythonEnv,
      filePath,
      connectionInfo,
    );
  }

  /**
   * Restart kernel with same kernel ID
   * @param kernelId Kernel ID to restart
   * @returns New kernel connection with same ID
   */
  async restart(kernelId: string): Promise<Kernel.IKernelConnection> {
    // Get stored kernel metadata before disposal
    const metadata = this.kernelMetadata.get(kernelId);
    if (!metadata) {
      throw new Error(`Kernel metadata for ${kernelId} not found`);
    }

    const pythonEnv = metadata.pythonEnv;

    // Dispose old kernel resources
    await this.dispose(kernelId);

    // Generate new connection file with same kernel ID
    const filePath = path.join(this.tempDir, `kernel-${kernelId}.json`);
    const connectionInfo = await this.generateConnectionInfo(
      kernelId,
      filePath,
      pythonEnv,
    );

    return this.launchKernelAndConnect(
      kernelId,
      pythonEnv,
      filePath,
      connectionInfo,
    );
  }

  /**
   * Dispose a kernel and cleanup resources
   * @param kernelId Kernel ID to dispose
   */
  async dispose(kernelId: string): Promise<void> {
    const metadata = this.kernelMetadata.get(kernelId);
    if (!metadata) {
      return;
    }

    // Kill the process
    try {
      metadata.process.kill();
      logInfo(`Kernel process ${kernelId} terminated`);
    } catch (error) {
      logWarn(`Failed to kill kernel process ${kernelId}`, error);
    }

    // Cleanup connection file
    if (fs.existsSync(metadata.connectionFilePath)) {
      try {
        fs.unlinkSync(metadata.connectionFilePath);
      } catch (error) {
        logError(`Failed to delete connection file: ${error}`, error);
      }
    }

    // Remove metadata
    this.kernelMetadata.delete(kernelId);
    logInfo(`Disposed kernel process ${kernelId}`);
  }
}
