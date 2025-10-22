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
  /** Whether execution completed without errors */
  isSucceeded?: boolean;
}
