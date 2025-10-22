/**
 * Jupyter wire protocol message structure
 * Used for low-level ZeroMQ communication
 */
export interface JupyterMessage {
  header: {
    msg_id: string;
    msg_type: string;
    username: string;
    session: string;
    date: string;
    version: string;
  };
  parent_header: any;
  metadata: any;
  content: any;
  buffers: any[];
}
