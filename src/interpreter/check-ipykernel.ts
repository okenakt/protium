import { spawn } from "child_process";
import { IpykernelCheckResult } from "../types/interpreter";

/**
 * Check if ipykernel is available in the given Python interpreter
 * @param pythonPath Path to Python interpreter
 * @returns Check result with availability status
 */
export async function checkIpykernel(
  pythonPath: string,
): Promise<IpykernelCheckResult> {
  return new Promise((resolve) => {
    const process = spawn(pythonPath, ["-c", 'import ipykernel; print("OK")'], {
      stdio: "pipe",
    });

    let output = "";
    let error = "";

    process.stdout?.on("data", (data) => {
      output += data.toString();
    });

    process.stderr?.on("data", (data) => {
      error += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0 && output.includes("OK")) {
        resolve({ available: true });
      } else {
        resolve({
          available: false,
          error: error || `Exit code: ${code}`,
          canInstall: true,
        });
      }
    });

    process.on("error", (err) => {
      resolve({
        available: false,
        error: err.message,
        canInstall: false,
      });
    });
  });
}
