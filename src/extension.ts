import * as vscode from "vscode";
import { ExecutionManager } from "./execution";
import { KernelMonitor } from "./kernel-monitor";
import { DisplayManager } from "./result-panel";
import { initializeLogger, logInfo } from "./utils/output-logger";
import { getActiveEditor, isPythonEditor } from "./utils/vscode-apis";
import { WatchListManager, WatchListView } from "./watch-list";

let executionManager: ExecutionManager;
let displayManager: DisplayManager;
let watchListManager: WatchListManager;

/**
 * Handles active editor changes for Python files
 * Centralized event handler for all Python file activation logic
 */
function handleActiveEditorChange(editor: vscode.TextEditor | undefined) {
  if (!editor) {
    vscode.commands.executeCommand("setContext", "protium.active", false);
    return;
  }

  const isPython = isPythonEditor(editor);

  // Set protium.active context for keybindings
  vscode.commands.executeCommand("setContext", "protium.active", isPython);

  if (isPython) {
    const fileUri = editor.document.uri.toString();

    // Switch display manager to this file
    displayManager.switchToFile(fileUri).catch(() => {});

    // Update watch list manager with active file
    watchListManager.setLastActiveFile(fileUri);
  }
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

  // Initialize watch list manager
  watchListManager = new WatchListManager();

  // Initialize kernel monitor
  const kernelMonitor = new KernelMonitor(context.extensionUri, {
    onInterrupt: (kernelId) => executionManager.interruptKernelById(kernelId),
    onRestart: (kernelId) => executionManager.restartKernelById(kernelId),
    onShutdown: (kernelId) => executionManager.shutdownKernelById(kernelId),
    onVisible: () => executionManager.updateKernelMonitor(),
  });

  // Initialize watch list view
  const watchListView = new WatchListView(context.extensionUri, {
    onRemoveWatch: (watchId) => watchListManager.removeWatch(watchId),
    onRefreshWatch: (watchId) => executionManager.evaluateWatch(watchId),
    onRefreshAll: () => executionManager.evaluateAllWatches(),
    onClearAll: () => watchListManager.clearAll(),
    onAddWatch: (expression, fileUri) => {
      const watch = watchListManager.addWatch(expression, fileUri);
      // Auto-evaluate if kernel exists for this file
      executionManager.evaluateWatch(watch.id);
    },
    onVisible: () => {
      const currentFile = watchListManager.getLastActiveFile();
      watchListView.update(watchListManager.getWatches(), currentFile);
    },
  });

  // Update watch list view when watches change
  watchListManager.onUpdate((watches) => {
    const currentFile = watchListManager.getLastActiveFile();
    watchListView.update(watches, currentFile);
  });

  // Initialize execution manager with dependencies
  displayManager = new DisplayManager();
  executionManager = new ExecutionManager(
    displayManager,
    kernelMonitor,
    watchListManager,
  );

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

  const showKernelMonitorCmd = vscode.commands.registerCommand(
    "protium.showKernelMonitor",
    () => executionManager.showKernelMonitor(),
  );

  const showWatchListCmd = vscode.commands.registerCommand(
    "protium.showWatchList",
    async () => {
      await vscode.commands.executeCommand("protium.watchList.focus");
    },
  );

  // Register kernel monitor WebviewView provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "protium.kernelMonitor",
      kernelMonitor,
    ),
  );

  // Register watch list WebviewView provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "protium.watchList",
      watchListView,
    ),
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
    showKernelMonitorCmd,
    showWatchListCmd,
    executionManager,
  );

  // Handle initial active editor
  const initialEditor = getActiveEditor();
  handleActiveEditorChange(initialEditor);

  // Handle active editor changes
  vscode.window.onDidChangeActiveTextEditor(handleActiveEditorChange);

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
