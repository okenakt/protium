import { Kernel } from "@jupyterlab/services";

/**
 * Kernel connection information for ZeroMQ communication
 * Used to configure direct kernel connections without Jupyter server
 */
export interface KernelConnectionInfo {
  kernel_id: string;
  shell_port: number;
  iopub_port: number;
  stdin_port: number;
  control_port: number;
  hb_port: number;
  ip: string;
  key: string;
  transport: string;
  signature_scheme: string;
  kernel_name: string;
}

/**
 * Options for kernel provider
 */
export interface KernelProvideOptions {
  /** Kernel name (e.g., "python3") */
  kernelName?: string;
  /** Path to Python interpreter */
  pythonPath?: string;
}

/**
 * Kernel provider interface
 * Abstracts kernel connection establishment
 */
export interface IKernelProvider {
  provide(options: KernelProvideOptions): Promise<Kernel.IKernelConnection>;
  restart(kernelId: string): Promise<Kernel.IKernelConnection>;
  dispose(kernelId: string): Promise<void>;
}

/**
 * Metadata for managing direct kernel lifecycle
 */
export interface DirectKernelMetadata {
  process: any;
  connectionFilePath: string;
  pythonPath: string;
}

/**
 * Options for creating a direct kernel connection
 */
export interface DirectKernelConnectionOptions {
  model: {
    id: string;
    name: string;
  };
  connectionInfo: KernelConnectionInfo;
  username: string;
  clientId: string;
}
