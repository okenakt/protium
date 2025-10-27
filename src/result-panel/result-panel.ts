import * as vscode from "vscode";
import { logInfo } from "../utils";
import { loadTemplate } from "../utils/html-utils";
import { getActiveEditor, getLineHeight } from "../utils/vscode-apis";

/**
 * ResultPanel manages the webview panel for displaying execution results
 */
export class ResultPanel {
  private panel: vscode.WebviewPanel | undefined;
  private scrollSyncEnabled: boolean = true;
  private onVisible: (() => void) | undefined;

  constructor(onVisible: () => void) {
    this.onVisible = onVisible;

    // Track visible range changes (scroll events)
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      const activeEditor = getActiveEditor();
      if (event.textEditor === activeEditor && this.scrollSyncEnabled) {
        this.syncScrollPosition(event.visibleRanges);
      }
    });
  }

  /**
   * Check panel is visible or not
   */
  isVisible(): boolean {
    return this.panel !== undefined && this.panel.visible;
  }

  /**
   * Ensure panel exists, creating it if necessary
   * @returns True if new panel was created
   */
  async ensurePanel(): Promise<boolean> {
    if (this.panel) {
      return false;
    }

    logInfo("Creating new result panel");

    this.panel = vscode.window.createWebviewPanel(
      "protiumResults",
      "Protium Results",
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true, // Keep forcus on editor
      },
      {
        enableScripts: true,
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      logInfo("Result panel disposed");
    });

    // When panel becomes visible, webview content is recreated from webview.html
    // VSCode destroys webview content when hidden to save memory
    // See: https://code.visualstudio.com/api/extension-guides/webview#persistence
    // Therefore need to restore results via postMessage
    this.panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        logInfo("Panel became visible");

        if (this.onVisible) {
          this.onVisible();
        }
      }
    });

    // Initialize with empty HTML template
    this.initialize();
    return true;
  }

  /**
   * Set panel HTML to empty template
   */
  initialize(): void {
    if (!this.panel) {
      return;
    }

    const lineHeight = getLineHeight();
    logInfo(`Generate base HTML with lineHeight: ${lineHeight}`);

    const baseHTML = loadTemplate("templates/result-panel/result-panel.html", {
      lineHeight: lineHeight,
    });
    this.panel.webview.html = baseHTML;
  }

  /**
   * Set breadcrumb text via postMessage
   * @param text Text to display in breadcrumb
   */
  async setBreadcrumb(text: string): Promise<void> {
    if (!this.panel) {
      return;
    }

    logInfo(`Setting breadcrumb: ${text}`);
    this.panel.webview.postMessage({
      command: "setBreadcrumb",
      context: text,
    });
  }

  /**
   * Send result blocks to webview via postMessage
   * @param blocks HTML blocks to display
   */
  async update(blocks: Array<string>): Promise<void> {
    if (!this.panel) {
      return;
    }

    // Send blocks
    logInfo(`Posting ${blocks.length} blocks`);
    this.panel.webview.postMessage({
      command: "updateBlocks",
      context: blocks,
    });

    // Sync scroll position after update
    const editor = getActiveEditor();
    if (this.scrollSyncEnabled && editor && editor.visibleRanges.length > 0) {
      this.syncScrollPosition(editor.visibleRanges);
    }
  }

  /**
   * Clear all result blocks via postMessage
   */
  async clearBlocks(): Promise<void> {
    if (!this.panel) {
      return;
    }

    logInfo("Clearing content blocks");
    this.panel.webview.postMessage({
      command: "clearBlocks",
    });
  }

  /**
   * Sync panel scroll to editor scroll position
   * @param visibleRanges Currently visible line ranges
   */
  private syncScrollPosition(visibleRanges: readonly vscode.Range[]): void {
    if (visibleRanges.length === 0 || !this.panel) {
      return;
    }

    const firstVisibleLine = visibleRanges[0].start.line;
    const lineHeight = getLineHeight();
    // Apply half-line offset to approximate mid-line scroll position
    const scrollPosition = firstVisibleLine * lineHeight - lineHeight / 2;

    this.panel.webview.postMessage({
      command: "scrollToPosition",
      context: scrollPosition,
    });
  }

  /**
   * Dispose panel and cleanup resources
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
  }
}
