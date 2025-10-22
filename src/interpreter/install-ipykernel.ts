import { spawn } from "child_process";
import * as vscode from "vscode";

/**
 * Install ipykernel using pip with progress UI
 * @param pythonPath Path to Python interpreter
 * @returns True if installation succeeded
 */
export async function installIpykernel(pythonPath: string): Promise<boolean> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing ipykernel for Protium...",
      cancellable: true,
    },
    async (progress, token) => {
      return new Promise<boolean>((resolve) => {
        const installProcess = spawn(
          pythonPath,
          ["-m", "pip", "install", "-U", "ipykernel", "--force-reinstall"],
          { stdio: "pipe" },
        );

        const ticker = [".", "..", "..."];
        let counter = 0;

        // Handle cancellation
        token.onCancellationRequested(() => {
          installProcess.kill();
          resolve(false);
        });

        if (token.isCancellationRequested) {
          installProcess.kill();
          resolve(false);
          return;
        }

        // Update progress with stdout
        installProcess.stdout?.on("data", (data) => {
          const output = data.toString().trim();
          const suffix = ticker[counter++ % 3];
          const message =
            output.length > 28 ? `${output.substring(0, 28)}${suffix}` : output;
          if (message) {
            progress.report({ message });
          }
        });

        installProcess.on("close", (code) => {
          if (token.isCancellationRequested) {
            resolve(false);
            return;
          }

          if (code === 0) {
            vscode.window.showInformationMessage(
              "✅ ipykernel installed successfully!",
            );
            resolve(true);
          } else {
            resolve(false);
          }
        });

        installProcess.on("error", () => resolve(false));
      });
    },
  );
}
