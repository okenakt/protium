import { Kernel } from "@jupyterlab/services";
import { PythonEnvironment } from "./interpreter";

/**
 * Kernel execution information including session data
 */
export interface KernelExecInfo {
  id: string;
  name: string;
  status: Kernel.Status;
  execCount: number;
  connectedFiles: string[];
}

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
 * Kernel provider interface
 * Abstracts kernel connection establishment
 */
export interface IKernelProvider {
  provide(pythonEnv: PythonEnvironment): Promise<Kernel.IKernelConnection>;
  restart(kernelId: string): Promise<Kernel.IKernelConnection>;
  dispose(kernelId: string): Promise<void>;
}

/**
 * Metadata for managing direct kernel lifecycle
 */
export interface DirectKernelMetadata {
  process: any;
  connectionFilePath: string;
  pythonEnv: PythonEnvironment;
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
