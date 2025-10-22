import * as vscode from "vscode";

/**
 * OutputLogger manages VS Code Output Channel logging as singleton
 */
class OutputLogger {
  private static instance: OutputLogger;
  private outputChannel: vscode.LogOutputChannel | null = null;

  private constructor() {}

  public static getInstance(): OutputLogger {
    if (!OutputLogger.instance) {
      OutputLogger.instance = new OutputLogger();
    }
    return OutputLogger.instance;
  }

  /**
   * Initialize the output channel
   * @param channelName Channel name
   * @returns Log output channel
   */
  public initialize(channelName: string): vscode.LogOutputChannel {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel(channelName, {
        log: true,
      });
    }
    return this.outputChannel as vscode.LogOutputChannel;
  }

  /**
   * Get the output channel instance
   * @returns Log output channel or null
   */
  public getChannel(): vscode.LogOutputChannel | null {
    return this.outputChannel;
  }

  /**
   * Common logging method with log level
   * @param level Log level
   * @param message Message to log
   * @param data Optional data to log
   */
  private log(
    level: "error" | "info" | "warn" | "debug",
    message: string,
    data?: any,
  ): void {
    if (!this.outputChannel) {
      return;
    }
    const text =
      data !== undefined
        ? `${message}: ${JSON.stringify(data, null, 2)}`
        : message;
    this.outputChannel[level](text);
  }

  /**
   * Log an error message
   * @param message Error message
   * @param error Optional error data
   */
  public error(message: string, error?: any): void {
    this.log("error", message, error);
  }

  /**
   * Log an info message
   * @param message Info message
   * @param data Optional data
   */
  public info(message: string, data?: any): void {
    this.log("info", message, data);
  }

  /**
   * Log a warning message
   * @param message Warning message
   * @param data Optional data
   */
  public warn(message: string, data?: any): void {
    this.log("warn", message, data);
  }

  /**
   * Log a debug message
   * @param message Debug message
   * @param data Optional data
   */
  public debug(message: string, data?: any): void {
    this.log("debug", message, data);
  }

  /**
   * Show the output channel
   */
  public show(): void {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }

  /**
   * Dispose the output channel
   */
  public dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
      this.outputChannel = null;
    }
  }
}

// Export singleton instance
const logger = OutputLogger.getInstance();

/**
 * Initialize logger
 * @param channelName Channel name
 * @returns Log output channel
 */
export function initializeLogger(channelName: string): vscode.LogOutputChannel {
  return logger.initialize(channelName);
}

/**
 * Log info message
 * @param message Info message
 * @param data Optional data
 */
export function logInfo(message: string, data?: any): void {
  logger.info(message, data);
}

/**
 * Log warning message
 * @param message Warning message
 * @param data Optional data
 */
export function logWarn(message: string, data?: any): void {
  logger.warn(message, data);
}

/**
 * Log error message
 * @param message Error message
 * @param error Optional error data
 */
export function logError(message: string, error?: any): void {
  logger.error(message, error);
}

/**
 * Log debug message
 * @param message Debug message
 * @param data Optional data
 */
export function logDebug(message: string, data?: any): void {
  logger.debug(message, data);
}

/**
 * Show output channel
 */
export function showOutput(): void {
  logger.show();
}

/**
 * Dispose logger
 */
export function disposeLogger(): void {
  logger.dispose();
}
