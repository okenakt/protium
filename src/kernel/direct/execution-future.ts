import { Kernel, KernelMessage } from "@jupyterlab/services";
import { Signal } from "@lumino/signaling";
import { ExecutionResult } from "../../types";
import { logInfo } from "../../utils";
import { RawSocket } from "./raw-socket";

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
  private rawSocket?: RawSocket;
  private _result: ExecutionResult = {
    status: "ok",
  };

  // ============================================================================
  // Constructor
  // ============================================================================

  constructor(msg: KernelMessage.IExecuteRequestMsg, rawSocket?: RawSocket) {
    this.msg = msg;
    this.rawSocket = rawSocket;

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

    // Set up message handling if we have a socket
    if (this.rawSocket) {
      this.setupMessageHandling();
    }
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
  // Private Helper Methods
  // ============================================================================

  private setupMessageHandling(): void {
    if (!this.rawSocket) return;

    // Store the original onmessage handler
    const originalOnMessage = this.rawSocket.onMessage;

    // Override the onmessage handler to intercept our responses
    this.rawSocket.onMessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Check if this message is related to our request
        if (message.parent_header?.msg_id === this.msg.header.msg_id) {
          if (message.header?.msg_type === "execute_reply") {
            // This is our reply - finalize result
            const status = message.content.status;
            logInfo(
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
      } catch {
        // Ignore message parsing errors
      }

      // Call the original handler
      if (originalOnMessage) {
        originalOnMessage(event);
      }
    };
  }

  private handleIOPubOutput(message: any): void {
    const msgType = message.header?.msg_type;

    // Accumulate output into result
    switch (msgType) {
      case "stream": {
        if (message.content.name === "stdout") {
          this._result.output =
            (this._result.output || "") + message.content.text;
        } else if (message.content.name === "stderr") {
          this._result.error =
            (this._result.error || "") + message.content.text;
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
        }
        break;
      }
      case "error": {
        const errorText =
          message.content.traceback?.join("\n") ||
          message.content.evalue ||
          "Unknown error";
        this._result.error = (this._result.error || "") + errorText;
        break;
      }
    }
  }
}
