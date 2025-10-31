/**
 * Python environment information
 */
export interface PythonEnvironment {
  path: string;
  displayName: string;
  version?: string;
  envName?: string;
  envType?: string;
}

/**
 * Result of ipykernel availability check
 */
export interface IpykernelCheckResult {
  /** Whether ipykernel is available */
  available: boolean;
  /** Error message if check failed */
  error?: string;
  /** Whether ipykernel can be installed automatically */
  canInstall?: boolean;
}

/**
 * Event handlers for kernel process lifecycle
 */
export interface KernelProcessHandlers {
  /** Called when process encounters an error */
  onError?: (_error: Error) => void;
  /** Called when process exits */
  onExit?: (_code: number | null, _signal: NodeJS.Signals | null) => void;
  /** Called when process writes to stdout */
  onStdout?: (_data: Buffer) => void;
  /** Called when process writes to stderr */
  onStderr?: (_data: Buffer) => void;
}
