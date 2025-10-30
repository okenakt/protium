import * as vscode from "vscode";
import { KernelManager } from "../kernel";
import { KernelMonitor } from "../kernel-monitor";
import { ResultDisplayManager } from "../result-display";
import { KernelExecInfo } from "../types/kernel";
import { logInfo, logWarn } from "../utils";
import {
  getActivePythonEditor,
  getFileNameFromUri,
} from "../utils/vscode-apis";
import { WatchListManager } from "../watch-list";
import { BlockDetector } from "./";

/**
 * ExecutionManager orchestrates code execution workflow
 */
export class ExecutionManager {
  private blockDetector: BlockDetector;
  private kernelManager: KernelManager;
  private resultDisplayManager: ResultDisplayManager;
  private kernelMonitor: KernelMonitor;
  private watchListManager: WatchListManager;
  private sessions: Map<string, string> = new Map();

  constructor(
    resultDisplayManager: ResultDisplayManager,
    kernelMonitor: KernelMonitor,
    watchListManager: WatchListManager,
  ) {
    this.blockDetector = new BlockDetector();
    this.resultDisplayManager = resultDisplayManager;
    this.kernelManager = new KernelManager();
    this.kernelMonitor = kernelMonitor;
    this.watchListManager = watchListManager;

    // Set up kernel status change callback
    this.kernelManager.setOnStatusChange(() => {
      this.updateKernelMonitor();
    });
  }

  /**
   * Prepare execution environment for a file
   * Returns existing or new kernel ID associated with the file
   */
  async prepareExecution(fileUri: string): Promise<string | undefined> {
    const existingKernelId = this.sessions.get(fileUri);
    if (existingKernelId) {
      return existingKernelId;
    }

    const kernel = await this.kernelManager.startDirectKernel();
    if (!kernel) {
      return undefined;
    }

    // Associate file with kernel
    this.sessions.set(fileUri, kernel.id);
    return kernel.id;
  }

  /**
   * Core execution workflow
   * Returns editor and code range immediately for cursor movement
   * Execution happens asynchronously with result delivered via callback
   */
  private async executeCurrentBlock(): Promise<
    { editor: vscode.TextEditor; codeRange: vscode.Range } | undefined
  > {
    const editor = getActivePythonEditor();
    if (!editor) {
      vscode.window.showErrorMessage("No active Python editor");
      return undefined;
    }

    const fileUri = editor.document.uri.toString();

    // Determine code range: use selection if exists, otherwise detect block
    let codeRange: vscode.Range;
    if (!editor.selection.isEmpty) {
      // Use selection
      codeRange = new vscode.Range(
        editor.selection.start,
        editor.selection.end,
      );
    } else {
      // Detect block based on cursor position
      codeRange = this.blockDetector.detectCodeBlock(
        editor.document,
        editor.selection.active,
      );
    }

    const code = editor.document.getText(codeRange);

    // Skip empty code
    if (!code.trim()) {
      vscode.window.showWarningMessage("No code to execute");
      return { editor, codeRange };
    }

    logInfo(
      `Executing code lines from ${codeRange.start.line} to ${codeRange.end.line}`,
    );

    // Get or create kernel for this file
    const kernelId = await this.prepareExecution(fileUri);
    if (!kernelId) {
      const error = "Failed to prepare kernel for execution";
      vscode.window.showErrorMessage(error);
      return undefined;
    }

    // Update kernel monitor when kernel is ready
    this.updateKernelMonitor();

    // Show loading animation
    this.resultDisplayManager.displayExecutionLoading(fileUri, codeRange);

    // Execute code on kernel with streaming updates
    this.kernelManager.requestExecution(
      kernelId,
      code,
      (result) => {
        // Display final result
        this.resultDisplayManager.displayResult(fileUri, codeRange, result);

        // Auto-refresh watch list for this file after successful execution
        if (result.status === "ok") {
          this.evaluateWatchesForFile(fileUri);
        }
      },
      true, // Store in history and update execution count
      (intermediateResult) => {
        // Display intermediate streaming result
        this.resultDisplayManager.displayResult(
          fileUri,
          codeRange,
          intermediateResult,
        );
      },
    );

    return { editor, codeRange };
  }

  /**
   * Execute current block without moving cursor
   */
  async executeInPlace(): Promise<void> {
    this.executeCurrentBlock();
  }

  /**
   * Execute current block and move cursor to next line
   */
  async executeAndMoveNext(): Promise<void> {
    const result = await this.executeCurrentBlock();

    if (result) {
      const { editor, codeRange } = result;
      const nextLine = codeRange.end.line + 1;
      if (nextLine < editor.document.lineCount) {
        const newPosition = new vscode.Position(nextLine, 0);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(new vscode.Range(newPosition, newPosition));
        logInfo(`Moved cursor to line ${nextLine}`);
      }
    }
  }

  /**
   * Connect current file to an existing kernel
   */
  async connectToExistingKernel(): Promise<void> {
    const editor = getActivePythonEditor();
    if (!editor) {
      vscode.window.showErrorMessage("No active Python editor");
      return;
    }

    const fileUri = editor.document.uri.toString();

    // Get list of active kernels
    const activeKernels = this.kernelManager.getActiveKernels();

    if (activeKernels.length === 0) {
      vscode.window.showWarningMessage("No active kernels");
      return;
    }

    // Build kernel sessions from sessions map
    const kernelSessions = new Map<string, string[]>();
    for (const [source, kernelId] of this.sessions.entries()) {
      if (!kernelSessions.has(kernelId)) {
        kernelSessions.set(kernelId, []);
      }
      kernelSessions.get(kernelId)!.push(source);
    }

    // Show QuickPick to select a kernel
    const items = activeKernels.map((kernel) => {
      const sources = kernelSessions.get(kernel.id) || [];

      // Format sources for display
      const sourcesDisplay =
        sources.length > 0
          ? sources
              .map((s) => {
                if (s.startsWith("file://")) {
                  return getFileNameFromUri(s.toString());
                }
                return s;
              })
              .join(", ")
          : "No connections";

      return {
        label: kernel.name,
        detail: `Connected: ${sourcesDisplay}`,
        kernelId: kernel.id,
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a kernel to connect to",
      title: "Connect to Existing Kernel",
    });

    if (!selected) {
      return; // User cancelled
    }

    // Associate this file with the selected kernel
    this.sessions.set(fileUri, selected.kernelId);
    logInfo(`Connected file to kernel ${selected.kernelId}`);

    // Update kernel monitor
    this.updateKernelMonitor();
  }

  /**
   * Interrupt execution for the current file
   */
  async interruptExecution(): Promise<void> {
    const editor = getActivePythonEditor();
    if (!editor) {
      vscode.window.showErrorMessage("No active Python editor");
      return;
    }

    const fileUri = editor.document.uri.toString();
    const kernelId = this.sessions.get(fileUri);

    if (!kernelId) {
      vscode.window.showWarningMessage("No kernel running for this file");
      return;
    }

    await this.interruptKernelById(kernelId);
  }

  /**
   * Interrupt kernel by ID
   */
  public async interruptKernelById(kernelId: string): Promise<void> {
    try {
      await this.kernelManager.interruptKernel(kernelId);
      vscode.window.showInformationMessage("Kernel interrupted");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to interrupt: ${error}`);
    }
  }

  /**
   * Restart kernel for the current file
   */
  async restartKernel(): Promise<void> {
    const editor = getActivePythonEditor();
    if (!editor) {
      vscode.window.showErrorMessage("No active Python editor");
      return;
    }

    const fileUri = editor.document.uri.toString();
    const kernelId = this.sessions.get(fileUri);

    if (!kernelId) {
      vscode.window.showWarningMessage("No kernel running for this file");
      return;
    }

    await this.restartKernelById(kernelId);
  }

  /**
   * Restart kernel by ID
   */
  public async restartKernelById(kernelId: string): Promise<void> {
    try {
      await this.kernelManager.restartKernel(kernelId);
      vscode.window.showInformationMessage("Kernel restarted");
      this.updateKernelMonitor();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to restart kernel: ${error}`);
    }
  }

  /**
   * Shutdown kernel for the current file
   */
  async shutdownKernel(): Promise<void> {
    const editor = getActivePythonEditor();
    if (!editor) {
      vscode.window.showErrorMessage("No active Python editor");
      return;
    }

    const fileUri = editor.document.uri.toString();
    const kernelId = this.sessions.get(fileUri);

    if (!kernelId) {
      vscode.window.showWarningMessage("No kernel running for this file");
      return;
    }

    await this.shutdownKernelById(kernelId);
  }

  /**
   * Shutdown kernel by ID
   */
  public async shutdownKernelById(kernelId: string): Promise<void> {
    try {
      await this.kernelManager.shutdownKernel(kernelId);

      // Remove all sessions associated with this kernel
      const sessionEntries = Array.from(this.sessions.entries());
      for (const [uri, id] of sessionEntries) {
        if (id === kernelId) {
          this.resultDisplayManager.clearResults(uri);
          this.sessions.delete(uri);
        }
      }

      vscode.window.showInformationMessage("Kernel shutdown");
      this.updateKernelMonitor();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to shutdown kernel: ${error}`);
    }
  }

  /**
   * Clear results for the current editor
   */
  clearResults(): void {
    const editor = getActivePythonEditor();
    if (!editor) {
      vscode.window.showErrorMessage("No active Python editor");
      return;
    }

    const fileUri = editor.document.uri.toString();
    this.resultDisplayManager.clearResults(fileUri);
  }

  /**
   * Show kernel monitor panel
   */
  async showKernelMonitor(): Promise<void> {
    this.updateKernelMonitor();
    await vscode.commands.executeCommand(
      "workbench.view.extension.protium-panel",
    );
  }

  /**
   * Update kernel monitor with current kernel information
   */
  updateKernelMonitor(): void {
    if (!this.kernelMonitor) {
      return;
    }

    const activeKernels = this.kernelManager.getActiveKernels();

    // Build kernel sessions from sessions map
    const kernelSessions = new Map<string, string[]>();
    for (const [source, kernelId] of this.sessions.entries()) {
      if (!kernelSessions.has(kernelId)) {
        kernelSessions.set(kernelId, []);
      }
      kernelSessions.get(kernelId)!.push(source);
    }

    const kernelInfos: KernelExecInfo[] = activeKernels.map((kernel) => {
      const sources = kernelSessions.get(kernel.id) || [];

      // Format sources for display
      const connectedFiles = sources.map((s) => {
        if (s.startsWith("file://")) {
          return getFileNameFromUri(s);
        }
        return s;
      });

      return {
        id: kernel.id,
        name: kernel.name,
        status: kernel.status,
        execCount: kernel.execCount,
        connectedFiles,
      };
    });

    this.kernelMonitor.update(kernelInfos);
  }

  /**
   * Evaluates a single watch expression
   * Note: Watch evaluation cannot use streaming updates because the kernel
   * processes execution requests serially. While main code is executing,
   * watch evaluation requests are queued and only processed after completion.
   */
  async evaluateWatch(watchId: string): Promise<void> {
    const watch = this.watchListManager.getWatch(watchId);
    if (!watch) {
      logWarn(`Watch not found: ${watchId}`);
      return;
    }

    const kernelId = this.sessions.get(watch.filePath);
    if (!kernelId) {
      this.watchListManager.updateWatchValue(
        watchId,
        undefined,
        "No kernel running for this file",
      );
      return;
    }

    logInfo(`Evaluating watch: ${watch.expression}`);

    // Use storeHistory=false to avoid incrementing execution count
    // Note: No onStream callback - kernel processes requests serially
    this.kernelManager.requestExecution(
      kernelId,
      watch.expression,
      (result) => {
        if (result.error) {
          this.watchListManager.updateWatchValue(
            watchId,
            undefined,
            result.error,
          );
        } else {
          // Extract value from mimeData (text/plain) or output
          let value = result.output;
          if (!value && result.mimeData && result.mimeData["text/plain"]) {
            value = result.mimeData["text/plain"];
          }

          // Don't update if no output (keep previous value)
          if (!value) {
            logWarn(
              `Watch evaluation returned no output for: ${watch.expression}`,
            );
            return;
          }

          this.watchListManager.updateWatchValue(watchId, value);
        }
      },
      false, // Don't store in history to avoid incrementing execution count
    );
  }

  /**
   * Evaluates all watch expressions
   */
  async evaluateAllWatches(): Promise<void> {
    const watches = this.watchListManager.getWatches();
    for (const watch of watches) {
      await this.evaluateWatch(watch.id);
    }
  }

  /**
   * Evaluates watch expressions for a specific file
   * @param fileUri File URI to evaluate watches for
   */
  private evaluateWatchesForFile(fileUri: string): void {
    const watches = this.watchListManager.getWatchesForFile(fileUri);
    for (const watch of watches) {
      this.evaluateWatch(watch.id);
    }
  }

  dispose(): void {
    this.resultDisplayManager.dispose();
    this.kernelManager.dispose();
    // KernelMonitor (WebviewView) is managed by VS Code, no disposal needed
    this.sessions.clear();
  }
}
