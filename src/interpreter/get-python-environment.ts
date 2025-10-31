import * as vscode from "vscode";
import { PythonEnvironment } from "../types/interpreter";

/**
 * Get Python environment information from VS Code Python extension
 * @returns Python environment or undefined
 */
export async function getPythonEnvironment(): Promise<
  PythonEnvironment | undefined
> {
  try {
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");
    if (!pythonExtension) {
      vscode.window.showErrorMessage("Python extension is not installed.");
      return undefined;
    }

    await pythonExtension.activate();
    const pythonApi = pythonExtension.exports;

    if (!pythonApi?.environments) {
      vscode.window.showErrorMessage("Python extension API is not available.");
      return undefined;
    }

    // Try to get active interpreter
    let activeEnvPath = pythonApi.environments.getActiveEnvironmentPath();
    if (!activeEnvPath?.path) {
      // Prompt user to select interpreter
      await vscode.commands.executeCommand("python.setInterpreter");
      activeEnvPath = pythonApi.environments.getActiveEnvironmentPath();
      if (!activeEnvPath?.path) {
        vscode.window.showErrorMessage(
          "No Python interpreter selected. Please select one using Python extension.",
        );
        return undefined;
      }
    }

    // Resolve environment to get detailed information
    const resolved = await pythonApi.environments.resolveEnvironment(
      activeEnvPath,
    );

    if (!resolved) {
      // Fallback: return basic info if resolution fails
      return {
        path: activeEnvPath.path,
        displayName: "Python",
      };
    }

    // Extract version string (e.g., "3.11.5" from version object)
    let versionString: string | undefined;
    if (resolved.version) {
      const v = resolved.version;
      versionString = `${v.major}.${v.minor}.${v.micro || 0}`;
    }

    // Build display name from available information
    let displayName = "Python";
    if (versionString) {
      displayName = `Python ${versionString}`;
    }
    if (resolved.environment?.name) {
      displayName = `${resolved.environment.name} (${displayName})`;
    }

    return {
      path: activeEnvPath.path,
      displayName,
      version: versionString,
      envName: resolved.environment?.name,
      envType: resolved.environment?.type,
    };
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to get Python interpreter: ${error}`,
    );
    return undefined;
  }
}
