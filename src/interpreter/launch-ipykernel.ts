import { ChildProcess, spawn } from "child_process";
import { KernelProcessHandlers } from "../types/interpreter";

/**
 * Launch ipykernel process with the given Python interpreter and connection file
 * @param pythonPath Path to Python interpreter
 * @param connectionFile Path to Jupyter connection file
 * @param handlers Optional process event handlers
 * @returns Spawned child process
 */
export function launchIpykernel(
  pythonPath: string,
  connectionFile: string,
  handlers?: KernelProcessHandlers,
): ChildProcess {
  const kernelProcess = spawn(
    pythonPath,
    ["-m", "ipykernel_launcher", `--f=${connectionFile}`],
    {
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
      windowsHide: true,
    },
  );

  // Setup process event handlers
  if (handlers?.onError) {
    kernelProcess.on("error", handlers.onError);
  }
  if (handlers?.onExit) {
    kernelProcess.on("exit", handlers.onExit);
  }
  if (handlers?.onStdout) {
    kernelProcess.stdout?.on("data", handlers.onStdout);
  }
  if (handlers?.onStderr) {
    kernelProcess.stderr?.on("data", handlers.onStderr);
  }

  // Ensure kernel process is killed when Node.js exits
  const cleanupHandler = () => {
    if (!kernelProcess.killed) {
      kernelProcess.kill();
    }
  };

  process.once("exit", cleanupHandler);
  process.once("SIGINT", cleanupHandler);
  process.once("SIGTERM", cleanupHandler);

  // Remove cleanup handlers when kernel process exits naturally
  kernelProcess.once("exit", () => {
    process.off("exit", cleanupHandler);
    process.off("SIGINT", cleanupHandler);
    process.off("SIGTERM", cleanupHandler);
  });

  return kernelProcess;
}
