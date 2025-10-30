import { Kernel } from "@jupyterlab/services";
import * as vscode from "vscode";
import { getPythonInterpreter } from "../interpreter";
import { ExecutionResult } from "../types";
import { logError, logInfo } from "../utils";
import { DirectKernelProvider } from "./direct";

/**
 * KernelManager manages kernel instances and their connections
 */
export class KernelManager {
  private provider: DirectKernelProvider;
  private kernels: Map<string, Kernel.IKernelConnection> = new Map();
  private onStatusChangeCallback?: () => void;

  constructor() {
    this.provider = new DirectKernelProvider();
  }

  /**
   * Set callback for status changes
   */
  public setOnStatusChange(callback: () => void): void {
    this.onStatusChangeCallback = callback;
  }

  /**
   * Get all active kernels
   * @returns Array of kernel info objects
   */
  public getActiveKernels(): Array<{
    id: string;
    name: string;
    status: Kernel.Status;
    execCount: number;
  }> {
    const kernelList: Array<{
      id: string;
      name: string;
      status: Kernel.Status;
      execCount: number;
    }> = [];
    for (const [id, kernel] of this.kernels.entries()) {
      kernelList.push({
        id,
        name: kernel.name || `Kernel ${id.substring(0, 8)}`,
        status: kernel.status,
        execCount: (kernel as any).executionCount || 0,
      });
    }
    return kernelList;
  }

  /**
   * Get a kernel by ID
   * @param kernelId The kernel ID
   * @returns Kernel connection or undefined
   */
  public getKernel(kernelId: string): Kernel.IKernelConnection | undefined {
    return this.kernels.get(kernelId);
  }

  /**
   * Start a new direct kernel instance
   * @returns Kernel connection or undefined
   */
  async startDirectKernel(): Promise<Kernel.IKernelConnection | undefined> {
    const pythonPath = await getPythonInterpreter();
    if (!pythonPath) {
      vscode.window.showErrorMessage("No Python interpreter found");
      return undefined;
    }

    logInfo(`Starting direct kernel with Python: ${pythonPath}`);

    // Use provider to provide kernel connection
    const kernel = await this.provider.provide({ pythonPath });

    // Cache the kernel
    this.kernels.set(kernel.id, kernel);

    // Listen to status changes
    kernel.statusChanged.connect(() => {
      logInfo(`Kernel ${kernel.id} status changed to: ${kernel.status}`);
      this.onStatusChangeCallback?.();
    });

    return kernel;
  }

  /**
   * Request code execution on kernel (non-blocking)
   * @param kernelId The kernel ID to execute on
   * @param code The code to execute
   * @param onComplete Callback invoked when execution completes (any status)
   * @param storeHistory Whether to store in kernel history and update execution count (default: true)
   * @param onStream Callback for streaming updates during execution (optional)
   */
  requestExecution(
    kernelId: string,
    code: string,
    onComplete: (result: ExecutionResult) => void,
    storeHistory: boolean = true,
    onStream?: (result: ExecutionResult) => void,
  ): void {
    const kernel = this.kernels.get(kernelId);
    if (!kernel) {
      logError(`Kernel ${kernelId} not found for execution request`);
      return;
    }

    // Request execution and get future
    const future = kernel.requestExecute({
      code,
      silent: false, // Always false to get output
      store_history: storeHistory,
      user_expressions: {},
      allow_stdin: false,
    });

    // Register streaming listener if provided
    if (onStream) {
      (future as any).onStream(onStream);
    }

    // Handle completion and errors
    future.done
      .then(() => {
        onComplete((future as any).result);
      })
      .catch((error) => {
        logError(`Execution error on kernel: ${kernelId}`, error);
      });
  }

  /**
   * Interrupt kernel execution
   * @param kernelId Kernel ID to interrupt
   */
  async interruptKernel(kernelId: string): Promise<void> {
    const kernel = this.kernels.get(kernelId);
    if (!kernel) {
      throw new Error(`Kernel ${kernelId} not found`);
    }

    await kernel.interrupt();
  }

  /**
   * Restart kernel (preserves kernel ID)
   * @param kernelId Kernel ID to restart
   */
  async restartKernel(kernelId: string): Promise<void> {
    const kernel = this.kernels.get(kernelId);
    if (!kernel) {
      throw new Error(`Kernel ${kernelId} not found`);
    }

    try {
      logInfo(`Restarting kernel ${kernelId}`);
      const newKernel = await this.provider.restart(kernelId);

      // Update kernel cache with new connection
      this.kernels.set(kernelId, newKernel);

      // Listen to status changes on new kernel
      newKernel.statusChanged.connect(() => {
        logInfo(
          `Kernel ${newKernel.id} status changed to: ${newKernel.status}`,
        );
        this.onStatusChangeCallback?.();
      });
    } catch (error) {
      throw new Error(`Failed to restart kernel: ${error}`);
    }
  }

  /**
   * Shutdown a specific kernel
   * @param kernelId Kernel ID to shutdown
   */
  async shutdownKernel(kernelId: string): Promise<void> {
    const kernel = this.kernels.get(kernelId);
    if (!kernel) {
      throw new Error(`Kernel ${kernelId} not found`);
    }

    logInfo(`Shutting down kernel ${kernelId}`);

    // Close connection
    await kernel.shutdown();

    // Kill process and cleanup via provider
    await this.provider.dispose(kernelId);

    // Remove from cache
    this.kernels.delete(kernelId);
  }

  /**
   * Dispose all kernels and cleanup
   */
  dispose(): void {
    // Shutdown all kernels
    const kernelIds = Array.from(this.kernels.keys());
    for (const kernelId of kernelIds) {
      this.shutdownKernel(kernelId).catch((error) => {
        logError(`Error shutting down kernel ${kernelId} during disposal: ${error}`, error);
      });
    }
  }
}
