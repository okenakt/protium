import { Kernel, KernelMessage } from "@jupyterlab/services";
import * as vscode from "vscode";
import { getPythonInterpreter } from "../interpreter";
import { ExecutionResult } from "../types";
import { DirectKernelProvider } from "./direct";

/**
 * KernelManager manages kernel instances and their connections
 */
export class KernelManager {
  private provider: DirectKernelProvider;
  private kernels: Map<string, Kernel.IKernelConnection> = new Map();

  constructor() {
    this.provider = new DirectKernelProvider();
  }

  /**
   * Get all active kernels
   * @returns Array of kernel info objects
   */
  public getActiveKernels(): Array<{ id: string; name: string }> {
    const kernelList: Array<{ id: string; name: string }> = [];
    for (const [id, kernel] of this.kernels.entries()) {
      kernelList.push({
        id,
        name: kernel.name || `Kernel ${id.substring(0, 8)}`,
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

    // Use provider to provide kernel connection
    const kernel = await this.provider.provide({ pythonPath });

    // Cache the kernel
    this.kernels.set(kernel.id, kernel);

    return kernel;
  }

  /**
   * Handle stream messages (stdout/stderr)
   * @param msg Stream message from kernel
   * @param result Execution result to update
   */
  private handleStreamMessage(
    msg: KernelMessage.IStreamMsg,
    result: ExecutionResult,
  ): void {
    if (msg.content.name === "stdout") {
      result.output = (result.output || "") + msg.content.text;
    } else if (msg.content.name === "stderr") {
      result.error = (result.error || "") + msg.content.text;
    }
  }

  /**
   * Handle execute_result or display_data messages
   * @param msg Data message from kernel
   * @param result Execution result to update
   */
  private handleDataMessage(
    msg: KernelMessage.IExecuteResultMsg | KernelMessage.IDisplayDataMsg,
    result: ExecutionResult,
  ): void {
    const data = msg.content.data;
    if (data) {
      if (!result.mimeData) {
        result.mimeData = {};
      }
      Object.assign(result.mimeData, data);

      // Only add text/plain to output if there's no richer mime type
      // (e.g., don't show "<Figure size 640x480>" for matplotlib plots)
      const hasRichOutput =
        data["image/png"] ||
        data["image/jpeg"] ||
        data["image/svg+xml"] ||
        data["text/html"];

      if (data["text/plain"] && !hasRichOutput) {
        result.output = (result.output || "") + data["text/plain"];
      }
    }
  }

  /**
   * Handle error messages
   * @param msg Error message from kernel
   * @param result Execution result to update
   */
  private handleErrorMessage(
    msg: KernelMessage.IErrorMsg,
    result: ExecutionResult,
  ): void {
    const errorText =
      msg.content.traceback?.join("\n") ||
      msg.content.evalue ||
      "Unknown error";
    result.error = (result.error || "") + errorText;
  }

  /**
   * Process IOPub messages and accumulate outputs
   * @param msg IOPub message from kernel
   * @param result Execution result to update
   */
  private processIOPubMessage(
    msg: KernelMessage.IIOPubMessage,
    result: ExecutionResult,
  ): void {
    const msgType = msg.header.msg_type;

    switch (msgType) {
      case "stream":
        this.handleStreamMessage(msg as KernelMessage.IStreamMsg, result);
        break;
      case "execute_result":
        this.handleDataMessage(msg as KernelMessage.IExecuteResultMsg, result);
        break;
      case "display_data":
        this.handleDataMessage(msg as KernelMessage.IDisplayDataMsg, result);
        break;
      case "error":
        this.handleErrorMessage(msg as KernelMessage.IErrorMsg, result);
        break;
    }
  }

  /**
   * Request code execution on kernel (non-blocking)
   * @param kernelId The kernel ID to execute on
   * @param code The code to execute
   * @param onSuccess Callback for successful execution
   * @param onError Callback for execution errors
   */
  requestExecution(
    kernelId: string,
    code: string,
    onSuccess: (result: ExecutionResult) => void,
    onError: (error: string) => void,
  ): void {
    const kernel = this.kernels.get(kernelId);
    if (!kernel) {
      onError("No kernel available");
      return;
    }

    const future = kernel.requestExecute({
      code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: false,
    });

    const result: ExecutionResult = {};

    future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
      this.processIOPubMessage(msg, result);
    };

    // Handle result asynchronously
    future.done
      .then((reply) => {
        if (
          reply.content.execution_count !== undefined &&
          reply.content.execution_count !== null
        ) {
          result.executionCount = reply.content.execution_count;
        }

        result.isSucceeded = reply.content.status === "ok";
        onSuccess(result);
      })
      .catch((_error) => {
        onError("Kernel execution failed");
      });
  }

  /**
   * Interrupt kernel execution
   * @param kernelId Kernel ID to interrupt
   */
  async interruptKernel(kernelId: string): Promise<void> {
    const kernel = this.kernels.get(kernelId);
    if (kernel) {
      try {
        await kernel.interrupt();
      } catch (error) {
        throw new Error(`Failed to interrupt kernel: ${error}`);
      }
    } else {
      throw new Error(`Kernel ${kernelId} not found`);
    }
  }

  /**
   * Disconnect a kernel and cleanup resources
   * @param kernelId Kernel ID to disconnect
   */
  async disconnectKernel(kernelId: string): Promise<void> {
    // Remove from cache
    const kernel = this.kernels.get(kernelId);
    if (kernel) {
      try {
        await kernel.shutdown();
      } catch {
        // Ignore kernel shutdown errors
      }
      this.kernels.delete(kernelId);
    }

    // Cleanup provider resources
    try {
      await this.provider.dispose(kernelId);
    } catch {
      // Ignore provider dispose errors
    }
  }

  /**
   * Dispose all kernels and cleanup
   */
  dispose(): void {
    // Disconnect all kernels
    const kernelIds = Array.from(this.kernels.keys());
    for (const kernelId of kernelIds) {
      this.disconnectKernel(kernelId).catch((_error) => {});
    }

    // Cleanup provider
    this.provider.disposeAll();
  }
}
