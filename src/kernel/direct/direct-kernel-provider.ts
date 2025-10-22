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
  IKernelProvider,
  KernelConnectionInfo,
  KernelProvideOptions,
} from "../../types/kernel";
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
  private kernelProcesses: Map<string, any> = new Map(); // kernelId -> process info
  private connectionFiles: Map<string, string> = new Map(); // kernelId -> connection file path

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
   * @returns Kernel connection info
   */
  private async generateConnectionInfo(
    kernelId: string,
    filePath: string,
  ): Promise<KernelConnectionInfo> {
    // Allocate 5 consecutive ports for kernel channels
    const portsNeeded = 5;
    const basePort = await findConsecutiveAvailablePorts(portsNeeded);

    const connectionInfo: KernelConnectionInfo = {
      kernel_id: kernelId,
      kernel_name: "protium-python",
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
      if (kernelConnection.connectionStatus === "connected") {
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, CONNECTION_POLL_INTERVAL_MS),
      );
      attempts++;
    }

    throw new Error(`Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`);
  }

  /**
   * Provide a kernel connection by starting a new local Python process
   * @param options Kernel provision options
   * @returns Kernel connection
   */
  async provide(
    options: KernelProvideOptions,
  ): Promise<Kernel.IKernelConnection> {
    const pythonPath = options.pythonPath;
    if (!pythonPath) {
      throw new Error("Python interpreter path is not specified");
    }

    // Ensure ipykernel is installed
    const ipykernelReady = await this.ensureIpykernelInstalled(pythonPath);
    if (!ipykernelReady) {
      throw new Error("ipykernel is not available");
    }

    // Generate kernel ID and connection info
    const kernelId = uuidv4();
    const filePath = path.join(this.tempDir, `kernel-${kernelId}.json`);
    const connectionInfo = await this.generateConnectionInfo(
      kernelId,
      filePath,
    );

    this.connectionFiles.set(kernelId, filePath);

    // Launch kernel process
    const processInfo = launchIpykernel(pythonPath, filePath, {
      onError: (error) => {
        vscode.window.showErrorMessage(
          `Kernel process failed: ${error.message}`,
        );
      },
      onExit: () => {
        // Cleanup on exit
        this.kernelProcesses.delete(kernelId);
        this.cleanupConnectionFile(kernelId);
      },
      onStdout: () => {},
      onStderr: () => {},
    });

    // Store process info
    this.kernelProcesses.set(kernelId, processInfo);

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
   * Dispose a kernel and cleanup resources
   * @param kernelId Kernel ID to dispose
   */
  async dispose(kernelId: string): Promise<void> {
    // Get process info
    const processInfo = this.kernelProcesses.get(kernelId);
    if (processInfo) {
      // Kill the process
      try {
        processInfo.kill();
      } catch {
        // Ignore kill errors
      }

      this.kernelProcesses.delete(kernelId);
    }

    // Cleanup connection file
    this.cleanupConnectionFile(kernelId);
  }

  /**
   * Cleanup connection file for a kernel
   * @param kernelId Kernel ID
   */
  private cleanupConnectionFile(kernelId: string): void {
    const connectionFile = this.connectionFiles.get(kernelId);
    if (connectionFile && fs.existsSync(connectionFile)) {
      try {
        fs.unlinkSync(connectionFile);
      } catch {
        // Ignore cleanup errors
      }
    }
    this.connectionFiles.delete(kernelId);
  }

  /**
   * Cleanup all resources
   */
  disposeAll(): void {
    // Kill all kernel processes
    for (const [kernelId] of this.kernelProcesses) {
      this.dispose(kernelId).catch(() => {});
    }

    // Cleanup temp directory
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
