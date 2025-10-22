import { Kernel, KernelMessage, ServerConnection } from "@jupyterlab/services";
import { Signal } from "@lumino/signaling";
import { v4 as uuidv4 } from "uuid";
import {
  DirectKernelConnectionOptions,
  KernelConnectionInfo,
} from "../../types";
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

  public readonly model: Kernel.IModel;
  public readonly id: string;
  public readonly clientId: string;
  public readonly username: string;
  public readonly name: string;

  private connectionInfo: KernelConnectionInfo;
  private rawSocket?: RawSocket;
  private _status: Kernel.Status = "starting";
  private _connectionStatus: Kernel.ConnectionStatus = "connecting";
  private _handleComms = false;
  private _hasPendingInput = false;
  private _isDisposed = false;
  private _kernelInfo?: KernelMessage.IInfoReply;

  public get status(): Kernel.Status {
    return this._status;
  }

  public get connectionStatus(): Kernel.ConnectionStatus {
    return this._connectionStatus;
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

  public get info(): Promise<KernelMessage.IInfoReply> {
    // Return cached kernel info if available, otherwise return default
    if (this._kernelInfo) {
      return Promise.resolve(this._kernelInfo);
    }

    // Return minimal default info (will be updated when kernel responds)
    return Promise.resolve(this.getDefaultKernelInfo());
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

  /**
   * Get default kernel info (used before actual kernel info is received)
   * @returns Default kernel info reply
   */
  private getDefaultKernelInfo(): KernelMessage.IInfoReply {
    return {
      status: "ok",
      protocol_version: JUPYTER_PROTOCOL_VERSION,
      implementation: "ipython",
      implementation_version: "unknown",
      language_info: {
        name: DEFAULT_KERNEL_LANGUAGE,
        version: "unknown",
        mimetype: "text/x-python",
        file_extension: ".py",
        pygments_lexer: "ipython3",
        codemirror_mode: { name: "ipython", version: 3 },
        nbconvert_exporter: "python",
      },
      banner: `${DEFAULT_KERNEL_DISPLAY_NAME} [Protium Kernel]`,
      help_links: [],
    };
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

  public get supportsSubshells(): boolean {
    return false;
  }

  public get subshellId(): string | null {
    return null;
  }

  constructor(options: DirectKernelConnectionOptions) {
    this.model = options.model;
    this.id = options.model.id;
    this.clientId = options.clientId;
    this.username = options.username;
    this.name = options.model.name;
    this.connectionInfo = options.connectionInfo;

    // Create our RawSocket connection
    this.createRawSocket();
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

    // Send the message
    if (this.rawSocket) {
      this.rawSocket.send(JSON.stringify(msg));
    }

    return future;
  }

  public requestInspect(
    _content: KernelMessage.IInspectRequestMsg["content"],
  ): Promise<KernelMessage.IInspectReplyMsg> {
    throw new Error("Not implemented");
  }

  public requestComplete(
    _content: KernelMessage.ICompleteRequestMsg["content"],
  ): Promise<KernelMessage.ICompleteReplyMsg> {
    throw new Error("Not implemented");
  }

  public requestHistory(
    _content: KernelMessage.IHistoryRequestMsg["content"],
  ): Promise<KernelMessage.IHistoryReplyMsg> {
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

  public requestKernelInfo(): Promise<KernelMessage.IInfoReplyMsg | undefined> {
    // For now, return undefined as the signature expects
    return Promise.resolve(undefined);
  }

  public async interrupt(): Promise<void> {
    // Implementation for kernel interrupt
  }

  public async restart(): Promise<void> {
    // Implementation for kernel restart
  }

  public async shutdown(): Promise<void> {
    this._status = "dead";
    this.statusChanged.emit("dead");
    this.dispose();
  }

  public clone(
    _options?: Kernel.IKernelConnection.IOptions,
  ): Kernel.IKernelConnection {
    throw new Error("Not implemented");
  }

  public registerCommTarget(
    _targetName: string,
    _callback: (
      _comm: Kernel.IComm,
      _msg: KernelMessage.ICommOpenMsg,
    ) => void | PromiseLike<void>,
  ): void {
    // Not implemented
  }

  public removeCommTarget(
    _targetName: string,
    _callback: (
      _comm: Kernel.IComm,
      _msg: KernelMessage.ICommOpenMsg,
    ) => void | PromiseLike<void>,
  ): void {
    // Not implemented
  }

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
    return false;
  }

  public registerMessageHook(
    _msgId: string,
    _hook: (
      _msg: KernelMessage.IIOPubMessage,
    ) => boolean | PromiseLike<boolean>,
  ): void {
    // Not implemented
  }

  public removeMessageHook(
    _msgId: string,
    _hook: (
      _msg: KernelMessage.IIOPubMessage,
    ) => boolean | PromiseLike<boolean>,
  ): void {
    // Not implemented
  }

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
    // Not implemented
  }

  public async reconnect(): Promise<void> {
    // Not implemented
  }

  public requestDebug(
    _content: KernelMessage.IDebugRequestMsg["content"],
  ): Kernel.IFuture<
    KernelMessage.IDebugRequestMsg,
    KernelMessage.IDebugReplyMsg
  > {
    throw new Error("Not implemented");
  }

  public requestCreateSubshell(_content: any): any {
    throw new Error("Not implemented");
  }

  public requestDeleteSubshell(_content: any): any {
    throw new Error("Not implemented");
  }

  public requestListSubshells(_content: any): any {
    throw new Error("Not implemented");
  }

  public requestSubshellExecution(_content: any): any {
    throw new Error("Not implemented");
  }

  public requestListSubshell(_content: any): any {
    throw new Error("Not implemented");
  }

  public removeInputGuard(): void {
    // Not implemented
  }

  private createRawSocket(): void {
    // Create our RawSocket with event handlers
    this.rawSocket = new RawSocket(this.connectionInfo, {
      onopen: () => {
        this._connectionStatus = "connected";
        this._status = "idle";
        this.connectionStatusChanged.emit("connected");
        this.statusChanged.emit("idle");

        // Request kernel info to complete initialization
        this.initializeKernel();
      },
      onclose: () => {
        this._connectionStatus = "disconnected";
        this._status = "dead";
        this.connectionStatusChanged.emit("disconnected");
        this.statusChanged.emit("dead");
      },
      onerror: () => {
        this._connectionStatus = "disconnected";
        this.connectionStatusChanged.emit("disconnected");
      },
      onmessage: (event) => {
        try {
          // Process the message and emit appropriate signals
          this.handleMessage(event);
        } catch {
          // Ignore message handling errors
        }
      },
    });
  }

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

  private async initializeKernel(): Promise<void> {
    try {
      await this.requestKernelInfo();
    } catch {
      // Ignore initialization errors
    }
  }

  /**
   * Dispose connection and cleanup resources
   */
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
  }
}
