import * as crypto from "crypto";
import { JupyterMessage, KernelConnectionInfo } from "../../types";
import { logDebug, logError } from "../../utils";

// ZMQ types - will be dynamically imported to avoid bundling issues
let zmq: any;

/**
 * Determines the channel for a message type
 * @param msgType Message type
 * @returns Channel name
 */
function getChannelForMessageType(msgType: string): string {
  switch (msgType) {
    case "interrupt_request":
    case "shutdown_request":
      return "control";
    case "kernel_info_request":
    case "execute_request":
    case "complete_request":
    case "inspect_request":
    default:
      return "shell";
  }
}

/**
 * Socket event handlers interface
 */
interface RawSocketHandlers {
  onOpen?: (_event: any) => void;
  onClose?: (_event: any) => void;
  onError?: (_event: any) => void;
  onMessage?: (_event: any) => void;
}

/**
 * RawSocket provides ZMQ communication with Jupyter kernels via WebSocket-like interface
 */
export class RawSocket {
  // ============================================================================
  // WebSocket-like Constants
  // ============================================================================

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  // ============================================================================
  // WebSocket-like Properties
  // ============================================================================

  public readyState: number = 0; // CONNECTING = 0, OPEN = 1, CLOSING = 2, CLOSED = 3
  public onOpen: ((_event: any) => void) | null = null;
  public onClose: ((_event: any) => void) | null = null;
  public onError: ((_event: any) => void) | null = null;
  public onMessage: ((_event: any) => void) | null = null;

  // ============================================================================
  // Private Properties
  // ============================================================================

  private connectionInfo: KernelConnectionInfo;
  private sockets: {
    shell?: any;
    iopub?: any;
    control?: any;
  } = {};
  private isConnected: boolean = false;
  private pendingMessages: any[] = [];

  // ============================================================================
  // Constructor
  // ============================================================================

  constructor(
    connectionInfo: KernelConnectionInfo,
    handlers?: RawSocketHandlers,
  ) {
    this.connectionInfo = connectionInfo;

    // Set handlers if provided
    if (handlers) {
      this.onOpen = handlers.onOpen || null;
      this.onClose = handlers.onClose || null;
      this.onError = handlers.onError || null;
      this.onMessage = handlers.onMessage || null;
    }

    // Start connection process
    this.connect();
  }

  // ============================================================================
  // WebSocket-like Public Methods
  // ============================================================================

  /**
   * Send a message through the appropriate ZMQ channel
   * @param data JSON string of Jupyter message
   */
  public async send(data: string): Promise<void> {
    if (!this.isConnected) {
      this.pendingMessages.push(data);
      return;
    }

    try {
      const message: JupyterMessage = JSON.parse(data);
      logDebug(`Sending message of type: ${message.header?.msg_type}`);

      // Determine channel and serialize message
      const msgType = message.header?.msg_type;
      const msgParts = this.serializeMessage(message);
      const channel = getChannelForMessageType(msgType);
      const socket = this.sockets[channel as keyof typeof this.sockets];

      if (!socket) {
        throw new Error(`No socket available for channel: ${channel}`);
      }

      await socket.send(msgParts);
    } catch (error) {
      logError(`Failed to send message: ${error}`, error);
      if (this.onError) {
        this.onError({ type: "error", error });
      }
    }
  }

  /**
   * Close all ZMQ sockets and cleanup
   */
  public close(): void {
    this.readyState = RawSocket.CLOSING;
    logDebug("Closing RawSocket connections");

    // Close all ZMQ sockets
    Object.values(this.sockets).forEach((socket) => {
      if (socket) {
        try {
          socket.close();
        } catch (error) {
          logError(`Error closing socket: ${error}`, error);
        }
      }
    });

    this.sockets = {};
    this.isConnected = false;
    this.readyState = RawSocket.CLOSED;

    if (this.onClose) {
      this.onClose({ type: "close" });
    }

    logDebug("RawSocket connections closed");
  }

  // ============================================================================
  // Private Connection Methods
  // ============================================================================

  private async connect(): Promise<void> {
    try {
      this.readyState = RawSocket.CONNECTING;

      // Dynamically import zeromq to avoid bundling issues
      if (!zmq) {
        try {
          zmq = await import("zeromq");
        } catch (error) {
          throw new Error(
            `ZeroMQ import failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Create ZMQ sockets
      const { ip, transport, shell_port, iopub_port, control_port } =
        this.connectionInfo;

      logDebug(
        `Creating sockets at ports ${shell_port}, ${iopub_port}, ${control_port}`,
      );

      // Create shell socket (DEALER for request-reply)
      this.sockets.shell = new zmq.Dealer();
      await this.sockets.shell.connect(`${transport}://${ip}:${shell_port}`);

      // Create IOPub socket (SUB for receiving output)
      this.sockets.iopub = new zmq.Subscriber();
      this.sockets.iopub.subscribe(""); // Subscribe to all messages
      await this.sockets.iopub.connect(`${transport}://${ip}:${iopub_port}`);

      // Create control socket (DEALER for interrupt/shutdown)
      this.sockets.control = new zmq.Dealer();
      await this.sockets.control.connect(
        `${transport}://${ip}:${control_port}`,
      );

      // Setup message handlers after sockets are created
      logDebug("Setting up message handlers for sockets");
      this.setupMessageHandlers();

      this.isConnected = true;
      this.readyState = RawSocket.OPEN;

      // Trigger onOpen event
      if (this.onOpen) {
        this.onOpen({ type: "open" });
      }

      // Send any pending messages
      this.processPendingMessages();

      logDebug("RawSocket connection established");
    } catch (error) {
      this.readyState = RawSocket.CLOSED;
      logError(`Failed to connect RawSocket: ${error}`, error);

      if (this.onError) {
        this.onError({ type: "error", error });
      }
    }
  }

  // ============================================================================
  // Private Message Handling Methods
  // ============================================================================

  /**
   * Setup message handlers for all channels
   */
  private setupMessageHandlers(): void {
    // Start listening on iopub channel
    if (this.sockets.iopub) {
      this.receiveMessages(this.sockets.iopub, "iopub");
    }

    // Start listening on shell channel
    if (this.sockets.shell) {
      this.receiveMessages(this.sockets.shell, "shell");
    }

    // Start listening on control channel
    if (this.sockets.control) {
      this.receiveMessages(this.sockets.control, "control");
    }
  }

  private async receiveMessages(socket: any, channel: string): Promise<void> {
    try {
      for await (const msgParts of socket) {
        try {
          // msgParts is an array of Buffers representing the message parts
          const message = this.deserializeMessage(msgParts);

          // Convert to WebSocket-like message format
          const wsMessage = {
            data: JSON.stringify({
              channel,
              ...message,
            }),
            type: "message",
          };

          // Trigger onMessage event
          if (this.onMessage) {
            this.onMessage(wsMessage);
          }
        } catch (error) {
          logError(
            `Failed to parse message on ${channel} channel: ${error}`,
            error,
          );
        }
      }
    } catch (error) {
      logError(`Error receiving messages on ${channel} channel`, error);
      if (this.onError) {
        this.onError({ type: "error", error });
      }
    }
  }

  private deserializeMessage(msgParts: Buffer[]): JupyterMessage {
    // Jupyter message format: [identity, delimiter, hmac, header, parent_header, metadata, content, ...buffers]
    // For simplicity, we'll assume no HMAC verification for now
    let partIndex = 0;

    // Find delimiter
    while (
      partIndex < msgParts.length &&
      msgParts[partIndex].toString() !== "<IDS|MSG>"
    ) {
      partIndex++;
    }
    partIndex++; // Skip delimiter

    if (partIndex + 4 > msgParts.length) {
      throw new Error("Invalid message format");
    }

    // Skip HMAC signature (index partIndex)
    const headerStr = msgParts[partIndex + 1]?.toString() || "{}";
    const parentHeaderStr = msgParts[partIndex + 2]?.toString() || "{}";
    const metadataStr = msgParts[partIndex + 3]?.toString() || "{}";
    const contentStr = msgParts[partIndex + 4]?.toString() || "{}";

    return {
      header: JSON.parse(headerStr),
      parent_header: JSON.parse(parentHeaderStr),
      metadata: JSON.parse(metadataStr),
      content: JSON.parse(contentStr),
      buffers: msgParts
        .slice(partIndex + 5)
        .map((buf) => buf.buffer as ArrayBuffer),
    };
  }

  private serializeMessage(message: JupyterMessage): Buffer[] {
    // Create message parts
    const header = Buffer.from(JSON.stringify(message.header));
    const parentHeader = Buffer.from(
      JSON.stringify(message.parent_header || {}),
    );
    const metadata = Buffer.from(JSON.stringify(message.metadata || {}));
    const content = Buffer.from(JSON.stringify(message.content || {}));

    // Create HMAC signature
    const hmac = crypto.createHmac("sha256", this.connectionInfo.key);
    hmac.update(header);
    hmac.update(parentHeader);
    hmac.update(metadata);
    hmac.update(content);
    const signature = Buffer.from(hmac.digest("hex"));

    // Return message parts: [delimiter, signature, header, parent_header, metadata, content]
    return [
      Buffer.from("<IDS|MSG>"),
      signature,
      header,
      parentHeader,
      metadata,
      content,
      ...(message.buffers?.map((buf) => Buffer.from(buf)) || []),
    ];
  }

  private processPendingMessages(): void {
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    messages.forEach((message) => this.send(message));
  }
}
