import * as vscode from "vscode";

/**
 * Get Python interpreter path from VS Code Python extension
 * @returns Path to Python interpreter or undefined
 */
export async function getPythonInterpreter(): Promise<string | undefined> {
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
    let activeInterpreter = pythonApi.environments.getActiveEnvironmentPath();
    if (activeInterpreter?.path) {
      return activeInterpreter.path;
    }

    // Prompt user to select interpreter
    await vscode.commands.executeCommand("python.setInterpreter");
    activeInterpreter = pythonApi.environments.getActiveEnvironmentPath();
    if (activeInterpreter?.path) {
      return activeInterpreter.path;
    }

    vscode.window.showErrorMessage(
      "No Python interpreter selected. Please select one using Python extension.",
    );
    return undefined;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to get Python interpreter: ${error}`,
    );
    return undefined;
  }
}
