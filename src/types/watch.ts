/**
 * Watch expression information
 */
export interface WatchExpression {
  /** Unique ID for the watch expression */
  id: string;
  /** Python expression to evaluate */
  expression: string;
  /** File path where the watch was created (for context) */
  filePath: string;
  /** Current value (result of evaluation) */
  value?: string;
  /** MIME data from execution result (for rich display like HTML tables) */
  mimeData?: Record<string, string>;
  /** Error message if evaluation failed */
  error?: string;
  /** Timestamp of last evaluation */
  lastEvaluated?: Date;
}

/**
 * Watch list update event data
 */
export interface WatchListUpdateData {
  watches: WatchExpression[];
}
