import { Kernel, KernelMessage, ServerConnection } from "@jupyterlab/services";
import { Signal } from "@lumino/signaling";
import { v4 as uuidv4 } from "uuid";
import {
  DirectKernelConnectionOptions,
  KernelConnectionInfo,
} from "../../types";
import { logInfo } from "../../utils";
import { ExecutionFuture } from "./execution-future";
import { RawSocket } from "./raw-socket";

// Constants
const JUPYTER_PROTOCOL_VERSION = "5.3";
const DEFAULT_KERNEL_LANGUAGE = "python";
const DEFAULT_KERNEL_DISPLAY_NAME = "Python 3";

/**
 * DirectKernelConnection provides ZMQ-based kernel connection bypassing Jupyter server
 */
export class DirectKernelConnection implements Kernel.IKernelConnection {
  // ============================================================================
  // IKernelConnection Interface: Public Signals
  // ============================================================================

  public readonly statusChanged = new Signal<this, Kernel.Status>(this);
  public readonly connectionStatusChanged = new Signal<
    this,
    Kernel.ConnectionStatus
  >(this);
  public readonly iopubMessage = new Signal<this, KernelMessage.IIOPubMessage>(
    this,
  );
  public readonly unhandledMessage = new Signal<this, KernelMessage.IMessage>(
    this,
  );
  public readonly anyMessage = new Signal<this, Kernel.IAnyMessageArgs>(this);
  public readonly disposed = new Signal<this, void>(this);
  public readonly pendingInput = new Signal<this, boolean>(this);

  // ============================================================================
  // IKernelConnection Interface: Public Properties
  // ============================================================================

  public readonly id: string;
  public readonly name: string;
  public readonly model: Kernel.IModel;
  public readonly username: string;
  public readonly clientId: string;

  // ============================================================================
  // Private Properties
  // ============================================================================

  private connectionInfo: KernelConnectionInfo;
  private rawSocket?: RawSocket;
  private _status: Kernel.Status = "starting";
  private _connectionStatus: Kernel.ConnectionStatus = "connecting";
  private _handleComms = false;
  private _hasPendingInput = false;
  private _isDisposed = false;
  private _kernelInfo?: KernelMessage.IInfoReply;
  private _executionCount: number = 0;

  // ============================================================================
  // IKernelConnection Interface: Getters
  // ============================================================================

  public get status(): Kernel.Status {
    return this._status;
  }

  public get connectionStatus(): Kernel.ConnectionStatus {
    return this._connectionStatus;
  }

  public get info(): Promise<KernelMessage.IInfoReply> {
    if (this._kernelInfo) {
      return Promise.resolve(this._kernelInfo);
    }
    return Promise.reject(new Error("Kernel info not available yet"));
  }

  public get spec(): Promise<any> {
    return Promise.resolve({
      name: this.connectionInfo.kernel_name,
      display_name: DEFAULT_KERNEL_DISPLAY_NAME,
      language: DEFAULT_KERNEL_LANGUAGE,
      argv: ["python", "-m", "ipykernel_launcher", "-f", "{connection_file}"],
      env: {},
      interrupt_mode: "signal",
      metadata: {},
    });
  }

  public get handleComms(): boolean {
    return this._handleComms;
  }

  public get hasPendingInput(): boolean {
    return this._hasPendingInput;
  }

  public get isDisposed(): boolean {
    return this._isDisposed;
  }

  public get executionCount(): number {
    return this._executionCount;
  }

  public get serverSettings(): ServerConnection.ISettings {
    // Return a minimal server settings object since we don't use HTTP
    return {
      baseUrl: "raw://localhost",
      wsUrl: "raw://localhost",
      appUrl: "raw://localhost",
      token: "",
      appendToken: false,
      fetch: fetch,
      WebSocket: WebSocket as any,
      Request: Request as any,
      Headers: Headers as any,
      init: {},
      serializer: "json" as any,
    };
  }

  public get supportsSubshells(): boolean {
    return false;
  }

  public get subshellId(): string | null {
    return null;
  }

  // ============================================================================
  // Constructor
  // ============================================================================

  constructor(options: DirectKernelConnectionOptions) {
    this.model = options.model;
    this.id = options.model.id;
    this.clientId = options.clientId;
    this.username = options.username;
    this.name = options.model.name;
    this.connectionInfo = options.connectionInfo;

    logInfo(`Creating DirectKernelConnection for kernel: ${this.id}`);

    // Create RawSocket connection with event handlers
    this.rawSocket = new RawSocket(this.connectionInfo, {
      onOpen: () => {
        this._connectionStatus = "connected";
        this._status = "idle";
        this.connectionStatusChanged.emit("connected");
        this.statusChanged.emit("idle");
      },
      onClose: () => {
        this._connectionStatus = "disconnected";
        this._status = "dead";
        this.connectionStatusChanged.emit("disconnected");
        this.statusChanged.emit("dead");
      },
      onError: () => {
        this._connectionStatus = "disconnected";
        this.connectionStatusChanged.emit("disconnected");
      },
      onMessage: (event) => {
        try {
          // Process the message and emit appropriate signals
          this.handleMessage(event);
        } catch {
          // Ignore message handling errors
        }
      },
    });
  }

  // ============================================================================
  // IKernelConnection Interface: Request Methods
  // ============================================================================

  public requestKernelInfo(): Promise<KernelMessage.IInfoReplyMsg | undefined> {
    return Promise.resolve(undefined);
  }

  public requestComplete(
    _content: KernelMessage.ICompleteRequestMsg["content"],
  ): Promise<KernelMessage.ICompleteReplyMsg> {
    throw new Error("Not implemented");
  }

  public requestInspect(
    _content: KernelMessage.IInspectRequestMsg["content"],
  ): Promise<KernelMessage.IInspectReplyMsg> {
    throw new Error("Not implemented");
  }

  public requestHistory(
    _content: KernelMessage.IHistoryRequestMsg["content"],
  ): Promise<KernelMessage.IHistoryReplyMsg> {
    throw new Error("Not implemented");
  }

  /**
   * Request code execution on the kernel
   * @param content Execute request content
   * @param _disposeOnDone Whether to dispose future on completion
   * @param _metadata Optional metadata
   * @returns Execution future
   */
  public requestExecute(
    content: KernelMessage.IExecuteRequestMsg["content"],
    _disposeOnDone?: boolean,
    _metadata?: Record<string, any>,
  ): Kernel.IShellFuture<
    KernelMessage.IExecuteRequestMsg,
    KernelMessage.IExecuteReplyMsg
  > {
    // Create execute request message
    const msg: KernelMessage.IExecuteRequestMsg = {
      header: {
        msg_id: uuidv4(),
        msg_type: "execute_request",
        username: this.username,
        session: this.clientId,
        date: new Date().toISOString(),
        version: JUPYTER_PROTOCOL_VERSION,
      },
      parent_header: {},
      metadata: _metadata || {},
      content: content,
      channel: "shell",
      buffers: [],
    };

    // Create execution future that sends the message via RawSocket
    const future = new ExecutionFuture(msg, this.rawSocket);

    // Update execution count when future completes
    future.done.then(() => {
      if (
        future.result.executionCount !== undefined &&
        future.result.executionCount !== null
      ) {
        this._executionCount = future.result.executionCount;
      }
    });

    // Send the message
    if (this.rawSocket) {
      this.rawSocket.send(JSON.stringify(msg));
      logInfo(
        `Execute request sent to kernel: ${this.id}, msg_id: ${msg.header.msg_id}`,
      );
    }

    return future;
  }

  public requestDebug(
    _content: KernelMessage.IDebugRequestMsg["content"],
  ): Kernel.IFuture<
    KernelMessage.IDebugRequestMsg,
    KernelMessage.IDebugReplyMsg
  > {
    throw new Error("Not implemented");
  }

  public requestIsComplete(
    _content: KernelMessage.IIsCompleteRequestMsg["content"],
  ): Promise<KernelMessage.IIsCompleteReplyMsg> {
    throw new Error("Not implemented");
  }

  public requestCommInfo(
    _content: KernelMessage.ICommInfoRequestMsg["content"],
  ): Promise<KernelMessage.ICommInfoReplyMsg> {
    throw new Error("Not implemented");
  }

  // ============================================================================
  // IKernelConnection Interface: Message Methods
  // ============================================================================

  public sendShellMessage<T extends KernelMessage.ShellMessageType>(
    _msg: KernelMessage.IShellMessage<T>,
    _expectReply?: boolean,
    _disposeOnDone?: boolean,
  ): Kernel.IShellFuture<
    KernelMessage.IShellMessage<T>,
    KernelMessage.IShellMessage<KernelMessage.ShellMessageType>
  > {
    throw new Error("Not implemented");
  }

  public sendControlMessage<T extends KernelMessage.ControlMessageType>(
    _msg: KernelMessage.IControlMessage<T>,
    _expectReply?: boolean,
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.IControlMessage<T>,
    KernelMessage.IControlMessage<KernelMessage.ControlMessageType>
  > {
    throw new Error("Not implemented");
  }

  public sendInputReply(
    _content: KernelMessage.IInputReplyMsg["content"],
    _parent_header: KernelMessage.IMessage["header"],
  ): void {
    throw new Error("Not implemented");
  }

  // ============================================================================
  // IKernelConnection Interface: Lifecycle Methods
  // ============================================================================

  public async reconnect(): Promise<void> {
    throw new Error("Not implemented");
  }

  public async interrupt(): Promise<void> {
    if (this._isDisposed) {
      throw new Error("Kernel connection is disposed");
    }

    // Send interrupt_request via control channel
    const msg: KernelMessage.IMessage = {
      header: {
        msg_id: uuidv4(),
        msg_type: "interrupt_request",
        username: this.username,
        session: this.clientId,
        date: new Date().toISOString(),
        version: JUPYTER_PROTOCOL_VERSION,
      },
      parent_header: {},
      metadata: {},
      content: {},
      channel: "control",
      buffers: [],
    };

    if (this.rawSocket) {
      this.rawSocket.send(JSON.stringify(msg));
      logInfo(`Interrupt request sent to kernel: ${this.id}`);
    }
  }

  public async restart(): Promise<void> {
    throw new Error("Not implemented");
  }

  public async shutdown(): Promise<void> {
    if (this._isDisposed) {
      return;
    }

    logInfo(`Shutting down DirectKernelConnection for kernel: ${this.id}`);

    this._status = "dead";
    this.statusChanged.emit("dead");
    this.dispose();
  }

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;

    if (this.rawSocket) {
      this.rawSocket.close();
      this.rawSocket = undefined;
    }

    this.disposed.emit();

    logInfo(`Disposed DirectKernelConnection for kernel: ${this.id}`);
  }

  public clone(
    _options?: Kernel.IKernelConnection.IOptions,
  ): Kernel.IKernelConnection {
    throw new Error("Not implemented");
  }

  public registerMessageHook(
    _msgId: string,
    _hook: (
      _msg: KernelMessage.IIOPubMessage,
    ) => boolean | PromiseLike<boolean>,
  ): void {
    throw new Error("Not implemented");
  }

  public removeMessageHook(
    _msgId: string,
    _hook: (
      _msg: KernelMessage.IIOPubMessage,
    ) => boolean | PromiseLike<boolean>,
  ): void {
    throw new Error("Not implemented");
  }

  public removeInputGuard(): void {
    throw new Error("Not implemented");
  }

  // ============================================================================
  // IKernelConnection Interface: Comm Methods
  // ============================================================================

  public createComm(
    _targetName: string,
    _commId?: string,
    _data?: any,
    _metadata?: any,
    _buffers?: (ArrayBuffer | ArrayBufferView)[],
  ): Kernel.IComm {
    throw new Error("Not implemented");
  }

  public hasComm(_commId: string): boolean {
    throw new Error("Not implemented");
  }

  public registerCommTarget(
    _targetName: string,
    _callback: (
      _comm: Kernel.IComm,
      _msg: KernelMessage.ICommOpenMsg,
    ) => void | PromiseLike<void>,
  ): void {
    throw new Error("Not implemented");
  }

  public removeCommTarget(
    _targetName: string,
    _callback: (
      _comm: Kernel.IComm,
      _msg: KernelMessage.ICommOpenMsg,
    ) => void | PromiseLike<void>,
  ): void {
    throw new Error("Not implemented");
  }

  // ============================================================================
  // IKernelConnection Interface: Subshell Methods
  // ============================================================================

  public requestCreateSubshell(_content: any): any {
    throw new Error("Not implemented");
  }

  public requestDeleteSubshell(_content: any): any {
    throw new Error("Not implemented");
  }

  public requestListSubshell(_content: any): any {
    throw new Error("Not implemented");
  }

  public requestSubshellExecution(_content: any): any {
    throw new Error("Not implemented");
  }

  public requestListSubshells(_content: any): any {
    throw new Error("Not implemented");
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Handle incoming Jupyter messages
   * @param event Message event from socket
   */
  private handleMessage(event: MessageEvent): void {
    // Parse and handle the incoming Jupyter message
    try {
      const message = JSON.parse(event.data);
      const msgType = message.header?.msg_type;
      const channel = message.channel;

      // Handle different message types
      switch (msgType) {
        case "status":
          this.handleStatusMessage(message);
          break;
        case "execute_reply":
          this.handleExecuteReply(message);
          break;
        case "interrupt_reply":
          logInfo(
            `Interrupt reply received, status: "${message.content?.status}", kernel: ${this.id}`,
          );
          break;
        case "stream":
        case "display_data":
        case "execute_result":
        case "error":
          this.handleIOPubMessage(message);
          break;
        case "kernel_info_reply":
          this.handleKernelInfoReply(message);
          break;
        default:
      }

      // Emit the message to appropriate signal based on channel
      if (channel === "iopub") {
        this.iopubMessage.emit(message);
      }

      // Always emit to anyMessage for general handling
      this.anyMessage.emit({
        msg: message,
        direction: "recv",
      });
    } catch {
      // Ignore JSON parse errors
    }
  }

  /**
   * Handle status messages from kernel
   * @param message Status message from kernel
   */
  private handleStatusMessage(message: KernelMessage.IStatusMsg): void {
    const executionState = message.content.execution_state;

    // Update kernel status based on execution state
    const statusMap: Record<string, Kernel.Status> = {
      starting: "starting",
      idle: "idle",
      busy: "busy",
      restarting: "restarting",
      dead: "dead",
    };

    const newStatus = statusMap[executionState];
    if (newStatus) {
      this._status = newStatus;
      this.statusChanged.emit(this._status);
    }
  }

  /**
   * Handle execute reply messages
   * @param _message Execute reply message
   */
  private handleExecuteReply(_message: KernelMessage.IExecuteReplyMsg): void {
    // Execute reply handling is primarily done in ExecutionFuture
  }

  /**
   * Handle IOPub messages (output, display data, etc.)
   * @param _message IOPub message
   */
  private handleIOPubMessage(_message: KernelMessage.IIOPubMessage): void {
    // This will be handled by ExecutionFuture for specific execution results
  }

  /**
   * Handle and store kernel info reply
   * @param message Kernel info reply message
   */
  private handleKernelInfoReply(message: KernelMessage.IInfoReplyMsg): void {
    if (message.content.status === "ok") {
      this._kernelInfo = message.content;
    }
  }
}
