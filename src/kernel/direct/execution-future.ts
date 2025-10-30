import { Kernel, KernelMessage } from "@jupyterlab/services";
import { Signal } from "@lumino/signaling";
import { ExecutionResult } from "../../types";
import { logDebug } from "../../utils";

/**
 * ExecutionFuture handles streaming output and final reply from Jupyter kernel
 */
export class ExecutionFuture
  implements
    Kernel.IShellFuture<
      KernelMessage.IExecuteRequestMsg,
      KernelMessage.IExecuteReplyMsg
    >
{
  // ============================================================================
  // IShellFuture Interface: Public Properties
  // ============================================================================

  public readonly msg: KernelMessage.IExecuteRequestMsg;
  public readonly done: Promise<KernelMessage.IExecuteReplyMsg>;
  public readonly isDisposed: boolean = false;
  public readonly disposed = new Signal<this, void>(this);

  // ============================================================================
  // IShellFuture Interface: Callback Properties
  // ============================================================================

  public onReply: (
    msg: KernelMessage.IExecuteReplyMsg,
  ) => void | PromiseLike<void> = () => {};
  public onIOPub: (
    msg: KernelMessage.IIOPubMessage,
  ) => void | PromiseLike<void> = () => {};
  public onStdin: (
    msg: KernelMessage.IStdinMessage,
  ) => void | PromiseLike<void> = () => {};

  // ============================================================================
  // Private Properties
  // ============================================================================

  private replyPromiseResolve:
    | ((reply: KernelMessage.IExecuteReplyMsg) => void)
    | null = null;
  private replyPromiseReject: ((reason?: any) => void) | null = null;
  private _result: ExecutionResult = {
    status: "ok",
  };

  // Event emitter for streaming updates
  private streamListeners: Array<(result: ExecutionResult) => void> = [];

  // ============================================================================
  // Constructor
  // ============================================================================

  constructor(msg: KernelMessage.IExecuteRequestMsg) {
    this.msg = msg;

    // Create a promise that will be resolved when we receive execute_reply
    // Note: Promise is resolved even for status="error" or status="aborted"
    // as these represent completed executions (following Jupyter protocol semantics).
    // Promise is rejected only for communication errors (socket errors, timeouts, etc.)
    this.done = new Promise<KernelMessage.IExecuteReplyMsg>(
      (resolve, reject) => {
        this.replyPromiseResolve = resolve;
        this.replyPromiseReject = reject;
      },
    );
  }

  // ============================================================================
  // Public Getters
  // ============================================================================

  /**
   * Get the accumulated execution result
   * @returns ExecutionResult containing all outputs and metadata
   */
  public get result(): ExecutionResult {
    return this._result;
  }

  // ============================================================================
  // Event Listener Methods
  // ============================================================================

  /**
   * Register a listener for streaming updates
   * @param listener Callback invoked on each intermediate result update
   */
  public onStream(listener: (result: ExecutionResult) => void): void {
    this.streamListeners.push(listener);
  }

  /**
   * Emit streaming update to all registered listeners
   * @param result Current execution result
   */
  private emitStream(result: ExecutionResult): void {
    this.streamListeners.forEach((listener) => listener(result));
  }

  // ============================================================================
  // IShellFuture Interface: Methods
  // ============================================================================

  public dispose(): void {
    // Real disposal logic can be added here
  }

  public registerMessageHook(
    _hook: (
      _msg: KernelMessage.IIOPubMessage,
    ) => boolean | PromiseLike<boolean>,
  ): void {
    // Implementation for message hook registration
  }

  public removeMessageHook(
    _hook: (
      _msg: KernelMessage.IIOPubMessage,
    ) => boolean | PromiseLike<boolean>,
  ): void {
    // Implementation for message hook removal
  }

  public sendInputReply(
    _content: KernelMessage.IInputReplyMsg["content"],
  ): void {
    // Implementation for input reply
  }

  // ============================================================================
  // Public Methods for Message Handling (called by DirectKernelConnection)
  // ============================================================================

  /**
   * Handle incoming message from kernel
   * Called by DirectKernelConnection when a message with matching parent_header.msg_id is received
   * @param message Kernel message
   */
  public handleMessage(message: any): void {
    const msgType = message.header?.msg_type;

    if (msgType === "execute_reply") {
      // This is our reply - finalize result
      const status = message.content.status;
      logDebug(
        `Execute reply received, status: "${status}", msg_id: ${this.msg.header.msg_id}`,
      );

      if (
        message.content.execution_count !== undefined &&
        message.content.execution_count !== null
      ) {
        this._result.executionCount = message.content.execution_count;
      }

      // Set execution result based on status
      this._result.status = status;

      if (this.replyPromiseResolve) {
        this.replyPromiseResolve(message);
      }
    } else if (message.channel === "iopub") {
      // This is an IOPub message (output, status, etc.)
      this.handleIOPubOutput(message);
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private handleIOPubOutput(message: any): void {
    const msgType = message.header?.msg_type;
    let shouldNotify = false;

    // Accumulate output into result
    switch (msgType) {
      case "stream": {
        if (message.content.name === "stdout") {
          this._result.output =
            (this._result.output || "") + message.content.text;
          shouldNotify = true;
        } else if (message.content.name === "stderr") {
          this._result.error =
            (this._result.error || "") + message.content.text;
          shouldNotify = true;
        }
        break;
      }
      case "display_data":
      case "execute_result": {
        const data = message.content.data;
        if (data) {
          if (!this._result.mimeData) {
            this._result.mimeData = {};
          }
          Object.assign(this._result.mimeData, data);

          // Only add text/plain to output if there's no richer mime type
          const hasRichOutput =
            data["image/png"] ||
            data["image/jpeg"] ||
            data["image/svg+xml"] ||
            data["text/html"];

          if (data["text/plain"] && !hasRichOutput) {
            this._result.output =
              (this._result.output || "") + data["text/plain"];
          }
          shouldNotify = true;
        }
        break;
      }
      case "error": {
        const errorText =
          message.content.traceback?.join("\n") ||
          message.content.evalue ||
          "Unknown error";
        this._result.error = (this._result.error || "") + errorText;
        shouldNotify = true;
        break;
      }
    }

    // Emit streaming update with intermediate result
    if (shouldNotify) {
      this.emitStream({ ...this._result });
    }
  }
}
