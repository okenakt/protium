import * as vscode from "vscode";
import { ExecutionManager } from "./execution";
import { initializeLogger, logInfo } from "./utils/output-logger";
import { getActiveEditor, isPythonEditor } from "./utils/vscode-apis";

let executionManager: ExecutionManager;

function readyExtension(editor: vscode.TextEditor) {
  const isPython = isPythonEditor(editor);

  // Set protium.active context
  vscode.commands.executeCommand("setContext", "protium.active", isPython);
}

/**
 * Activates the Protium extension
 * Initializes core components, registers commands, and sets up event listeners
 * @param context - VS Code extension context
 */
export function activate(context: vscode.ExtensionContext) {
  // Initialize output channel for logging
  const outputChannel = initializeLogger("Protium");
  context.subscriptions.push(outputChannel);

  // Set initial context if there's already an active Python file
  const activeEditor = getActiveEditor();
  if (activeEditor) readyExtension(activeEditor);

  // Set context when Python file is active
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    editor && readyExtension(editor);
  });

  // Initialize execution manager
  executionManager = new ExecutionManager();

  // Register commands
  const executeAndMoveNextCmd = vscode.commands.registerCommand(
    "protium.executeAndMoveNext",
    () => executionManager.executeAndMoveNext(),
  );

  const executeInPlaceCmd = vscode.commands.registerCommand(
    "protium.executeInPlace",
    () => executionManager.executeInPlace(),
  );

  const interruptExecutionCmd = vscode.commands.registerCommand(
    "protium.interruptExecution",
    () => executionManager.interruptExecution(),
  );

  const connectToExistingKernelCmd = vscode.commands.registerCommand(
    "protium.connectToExistingKernel",
    () => executionManager.connectToExistingKernel(),
  );

  const clearResultsCmd = vscode.commands.registerCommand(
    "protium.clearResults",
    () => executionManager.clearResults(),
  );

  const restartKernelCmd = vscode.commands.registerCommand(
    "protium.restartKernel",
    () => executionManager.restartKernel(),
  );

  const shutdownKernelCmd = vscode.commands.registerCommand(
    "protium.shutdownKernel",
    () => executionManager.shutdownKernel(),
  );

  // Register all disposables
  context.subscriptions.push(
    executeAndMoveNextCmd,
    executeInPlaceCmd,
    interruptExecutionCmd,
    connectToExistingKernelCmd,
    clearResultsCmd,
    restartKernelCmd,
    shutdownKernelCmd,
    executionManager,
  );

  logInfo("Protium activated");
}

/**
 * Deactivates the Protium extension
 * Cleans up resources and disposes of components
 */
export function deactivate() {
  if (executionManager) {
    executionManager.dispose();
  }
}
