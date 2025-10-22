import { Kernel, KernelMessage } from "@jupyterlab/services";
import { Signal } from "@lumino/signaling";
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
  public readonly msg: KernelMessage.IExecuteRequestMsg;
  public readonly done: Promise<KernelMessage.IExecuteReplyMsg>;
  public readonly isDisposed: boolean = false;
  public readonly disposed = new Signal<this, void>(this);

  // Function-based callbacks for compatibility
  public onReply: (
    msg: KernelMessage.IExecuteReplyMsg,
  ) => void | PromiseLike<void> = () => {};
  public onIOPub: (
    msg: KernelMessage.IIOPubMessage,
  ) => void | PromiseLike<void> = () => {};
  public onStdin: (
    msg: KernelMessage.IStdinMessage,
  ) => void | PromiseLike<void> = () => {};

  private replyPromiseResolve:
    | ((reply: KernelMessage.IExecuteReplyMsg) => void)
    | null = null;
  private rawSocket?: RawSocket;

  constructor(msg: KernelMessage.IExecuteRequestMsg, rawSocket?: RawSocket) {
    this.msg = msg;
    this.rawSocket = rawSocket;

    // Create a promise that will be resolved when we receive the reply
    this.done = new Promise<KernelMessage.IExecuteReplyMsg>((resolve) => {
      this.replyPromiseResolve = resolve;
    });

    // Set up message handling if we have a socket
    if (this.rawSocket) {
      this.setupMessageHandling();
    }
  }

  private setupMessageHandling(): void {
    if (!this.rawSocket) return;

    // Store the original onmessage handler
    const originalOnMessage = this.rawSocket.onmessage;

    // Override the onmessage handler to intercept our responses
    this.rawSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Check if this message is related to our request
        if (message.parent_header?.msg_id === this.msg.header.msg_id) {
          if (message.header?.msg_type === "execute_reply") {
            // This is our reply
            this.onReply(message);
            if (this.replyPromiseResolve) {
              this.replyPromiseResolve(message);
            }
          } else if (message.channel === "iopub") {
            // This is an IOPub message (output, status, etc.)
            this.handleIOPubOutput(message);
          } else if (message.channel === "stdin") {
            // This is a stdin request
            this.onStdin(message);
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

    switch (msgType) {
      case "stream":
        this.handleStreamOutput(message);
        break;
      case "display_data":
        this.handleDisplayData(message);
        break;
      case "execute_result":
        this.handleExecuteResult(message);
        break;
      case "error":
        this.handleErrorOutput(message);
        break;
      case "status":
        // Status messages are handled globally, but also passed to IOPub
        this.onIOPub(message);
        break;
      default:
        this.onIOPub(message);
    }
  }

  private handleStreamOutput(message: any): void {
    this.onIOPub(message);
  }

  private handleDisplayData(message: any): void {
    this.onIOPub(message);
  }

  private handleExecuteResult(message: any): void {
    this.onIOPub(message);
  }

  private handleErrorOutput(message: any): void {
    this.onIOPub(message);
  }

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
}
