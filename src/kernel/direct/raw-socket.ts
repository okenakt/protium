import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { JupyterMessage, KernelConnectionInfo } from "../../types";

// ZMQ types - will be dynamically imported to avoid bundling issues
let zmq: any;

/**
 * Determines the channel for a message type
 * @param msgType Message type
 * @returns Channel name
 */
function getChannelForMessageType(msgType: string): string {
  switch (msgType) {
    case "kernel_info_request":
    case "execute_request":
    case "complete_request":
    case "inspect_request":
      return "shell";
    case "interrupt_request":
    case "shutdown_request":
      return "control";
    case "input_reply":
      return "stdin";
    default:
      return "shell";
  }
}

/**
 * RawSocket provides ZMQ communication with Jupyter kernels via WebSocket-like interface
 */
/**
 * Socket event handlers interface
 */
interface RawSocketHandlers {
  onopen?: (_event: any) => void;
  onclose?: (_event: any) => void;
  onerror?: (_event: any) => void;
  onmessage?: (_event: any) => void;
}

export class RawSocket {
  private connectionInfo: KernelConnectionInfo;
  private sockets: {
    shell?: any;
    iopub?: any;
    control?: any;
    stdin?: any;
    hb?: any;
  } = {};
  private sessionId: string;
  private username: string;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private pendingMessages: any[] = [];

  // WebSocket-like interface properties
  public readyState: number = 0; // CONNECTING = 0, OPEN = 1, CLOSING = 2, CLOSED = 3
  public onopen: ((_event: any) => void) | null = null;
  public onclose: ((_event: any) => void) | null = null;
  public onerror: ((_event: any) => void) | null = null;
  public onmessage: ((_event: any) => void) | null = null;

  // Constants to mimic WebSocket
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(
    connectionInfo: KernelConnectionInfo,
    handlers?: RawSocketHandlers,
  ) {
    this.connectionInfo = connectionInfo;
    this.sessionId = uuidv4().replace(/-/g, "");
    this.username = "protium";

    // Set handlers if provided
    if (handlers) {
      this.onopen = handlers.onopen || null;
      this.onclose = handlers.onclose || null;
      this.onerror = handlers.onerror || null;
      this.onmessage = handlers.onmessage || null;
    }

    // Start connection process immediately
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.isConnecting = true;
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

      await this.createSockets();

      await this.setupMessageHandlers();

      this.isConnected = true;
      this.isConnecting = false;
      this.readyState = RawSocket.OPEN;

      // Trigger onopen event
      if (this.onopen) {
        this.onopen({ type: "open" });
      }

      // Send any pending messages
      this.processPendingMessages();
    } catch (error) {
      this.isConnecting = false;
      this.readyState = RawSocket.CLOSED;

      if (this.onerror) {
        this.onerror({ type: "error", error });
      }
    }
  }

  private async createSockets(): Promise<void> {
    const {
      ip,
      transport,
      shell_port,
      iopub_port,
      control_port,
      stdin_port,
      hb_port,
    } = this.connectionInfo;

    // Create shell socket (DEALER for request-reply)
    this.sockets.shell = new zmq.Dealer();
    await this.sockets.shell.connect(`${transport}://${ip}:${shell_port}`);

    // Create IOPub socket (SUB for receiving output)
    this.sockets.iopub = new zmq.Subscriber();
    this.sockets.iopub.subscribe(""); // Subscribe to all messages
    await this.sockets.iopub.connect(`${transport}://${ip}:${iopub_port}`);

    // Create control socket (DEALER for interrupt/shutdown)
    this.sockets.control = new zmq.Dealer();
    await this.sockets.control.connect(`${transport}://${ip}:${control_port}`);

    // Create stdin socket (DEALER for input requests)
    this.sockets.stdin = new zmq.Dealer();
    await this.sockets.stdin.connect(`${transport}://${ip}:${stdin_port}`);

    // Create heartbeat socket (REQ for keepalive)
    this.sockets.hb = new zmq.Request();
    await this.sockets.hb.connect(`${transport}://${ip}:${hb_port}`);
  }

  private async setupMessageHandlers(): Promise<void> {
    // Handle IOPub messages (outputs, status, etc.)
    if (this.sockets.iopub) {
      this.receiveMessages(this.sockets.iopub, "iopub");
    }

    // Handle shell replies
    if (this.sockets.shell) {
      this.receiveMessages(this.sockets.shell, "shell");
    }

    // Handle control replies
    if (this.sockets.control) {
      this.receiveMessages(this.sockets.control, "control");
    }

    // Handle stdin requests
    if (this.sockets.stdin) {
      this.receiveMessages(this.sockets.stdin, "stdin");
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

          // Trigger onmessage event
          if (this.onmessage) {
            this.onmessage(wsMessage);
          }
        } catch {
          // Ignore parse errors
        }
      }
    } catch (error) {
      if (this.onerror) {
        this.onerror({ type: "error", error });
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

  // WebSocket-like send method
  public send(data: string): void {
    if (!this.isConnected) {
      this.pendingMessages.push(data);
      return;
    }

    try {
      const message: JupyterMessage = JSON.parse(data);

      // Serialize and send the message through appropriate ZMQ channel
      this.sendMessage(message);
    } catch (error) {
      if (this.onerror) {
        this.onerror({ type: "error", error });
      }
    }
  }

  private async sendMessage(message: JupyterMessage): Promise<void> {
    const msgType = message.header?.msg_type;
    const msgParts = this.serializeMessage(message);
    const channel = getChannelForMessageType(msgType);
    const socket = this.sockets[channel as keyof typeof this.sockets];

    if (!socket) {
      throw new Error(`No socket available for channel: ${channel}`);
    }

    await socket.send(msgParts);
  }

  private processPendingMessages(): void {
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    messages.forEach((message) => this.send(message));
  }

  // WebSocket-like close method
  public close(): void {
    this.readyState = RawSocket.CLOSING;

    // Close all ZMQ sockets
    Object.values(this.sockets).forEach((socket) => {
      if (socket) {
        try {
          socket.close();
        } catch {
          // Ignore close errors
        }
      }
    });

    this.sockets = {};
    this.isConnected = false;
    this.readyState = RawSocket.CLOSED;

    if (this.onclose) {
      this.onclose({ type: "close" });
    }
  }
}
