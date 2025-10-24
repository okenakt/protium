/**
 * Execution status from kernel (Jupyter Protocol)
 */
export type ExecutionStatus = "ok" | "error" | "aborted";

/**
 * Execution result from kernel
 */
export interface ExecutionResult {
  /** Standard output text */
  output?: string;
  /** Error message or traceback */
  error?: string;
  /** Jupyter execution count */
  executionCount?: number;
  /** Rich output data (images, HTML, etc.) keyed by MIME type */
  mimeData?: { [mimeType: string]: any };
  /** Execution status: ok | error | aborted (follows Jupyter Protocol) */
  status: ExecutionStatus;
}
