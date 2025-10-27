import * as vscode from "vscode";
import { ExecutionResult } from "../types";
import { logInfo } from "../utils";
import { escapeHtml, loadTemplate, stripAnsi } from "../utils/html-utils";
import { getActiveDocumentUri, getFileNameFromUri } from "../utils/vscode-apis";
import { ResultPanel } from "./result-panel";

/**
 * DisplayManager manages result display and coordinates with result panel
 */
export class DisplayManager {
  private resultPanel: ResultPanel;
  // fileUri -> Range -> content (HTML string)
  private contentBlocks: Map<string, Map<vscode.Range, string>> = new Map();
  private lastActiveFileUri: string | undefined;

  constructor() {
    this.resultPanel = new ResultPanel(async () => {
      if (this.lastActiveFileUri) {
        await this.restoreResults(this.lastActiveFileUri);
      }
    });
  }

  /**
   * Store HTML block for a file and range
   * @param fileUri File URI
   * @param range Line range
   * @param block HTML block content
   */
  private storeContentBlock(
    fileUri: string,
    range: vscode.Range,
    block: string,
  ): void {
    // Get or create file mappings
    if (!this.contentBlocks.has(fileUri)) {
      this.contentBlocks.set(fileUri, new Map());
      logInfo(`Created new content mapping for file: ${fileUri}`);
    }

    const fileBlocks = this.contentBlocks.get(fileUri)!;
    fileBlocks.set(range, block);
  }

  /**
   * Restore all results for a specific file
   * @param fileUri File URI to restore results for
   */
  private async restoreResults(fileUri: string): Promise<void> {
    logInfo(`Restoring results for ${fileUri}`);

    // Set breadcrumb
    const fileName = getFileNameFromUri(fileUri);
    await this.resultPanel.setBreadcrumb(fileName);

    // Send all blocks
    const fileBlocks = this.contentBlocks.get(fileUri);
    if (fileBlocks && fileBlocks.size > 0) {
      await this.resultPanel.update(Array.from(fileBlocks.values()));
    }
  }

  /**
   * Display HTML block in the result panel
   * @param fileUri File URI
   * @param range Line range
   * @param block HTML block to display
   */
  private async display(
    fileUri: string,
    range: vscode.Range,
    block: string,
  ): Promise<void> {
    // Store HTML mapping
    this.storeContentBlock(fileUri, range, block);

    // Check if active editor matches the fileUri
    const activeFileUri = getActiveDocumentUri();
    if (activeFileUri !== fileUri) {
      logInfo(`Active editor does not match, skipping display update`);
      return;
    }

    // Ensure panel exists
    const isNewPanel = await this.resultPanel.ensurePanel();

    if (isNewPanel) {
      // Panel just created - restore all results for this file
      await this.restoreResults(fileUri);
    } else {
      // Panel exists - send only this new result
      await this.resultPanel.update([block]);
    }
  }

  /**
   * Display execution result in the result panel
   * @param fileUri File URI
   * @param range Line range
   * @param result Execution result to display
   */
  displayResult(
    fileUri: string,
    range: vscode.Range,
    result: ExecutionResult,
  ): void {
    logInfo(
      `Displaying result for file: ${fileUri}, range: ${range.start.line} - ${range.end.line}`,
    );

    // Load result block template and replace placeholders
    const block = loadTemplate("templates/result-panel/result-block.html", {
      lineStart: range.start.line.toString(),
      lineEnd: range.end.line.toString(),
      content: this.formatResultAsHtml(result),
    });

    this.display(fileUri, range, block);
  }

  /**
   * Display loading animation before execution
   * @param fileUri File URI
   * @param range Line range
   */
  displayExecutionLoading(fileUri: string, range: vscode.Range): void {
    logInfo(
      `Displaying loading animation for file: ${fileUri}, range: ${range.start.line} - ${range.end.line}`,
    );

    // Load result block template and replace placeholders
    const block = loadTemplate("templates/result-panel/loading-block.html", {
      lineStart: range.start.line.toString(),
      lineEnd: range.end.line.toString(),
    });

    this.display(fileUri, range, block);
  }

  /**
   * Wrap text in <pre> tag with class
   * @param text Text to wrap
   * @param className CSS class name
   * @returns HTML string with wrapped text
   */
  private wrapInPre(text: string, className: string): string {
    return `<pre class="${className}">${escapeHtml(stripAnsi(text).trimEnd())}</pre>`;
  }

  /**
   * Format ExecutionResult as HTML
   * @param result Execution result to format
   * @returns HTML string representation of result
   */
  private formatResultAsHtml(result: ExecutionResult): string {
    // Handle errors
    if (result.error) {
      let html = this.wrapInPre(result.error, "error-text");
      if (result.output) {
        html += this.wrapInPre(result.output, "output-text");
      }
      return html;
    }

    // Handle mime data (images, plots, etc.)
    if (result.mimeData) {
      const mimeHtml = this.formatMimeData(result.mimeData);
      if (mimeHtml) return mimeHtml;
    }

    // Handle text output
    if (result.output?.trim()) {
      return this.wrapInPre(result.output, "output-text");
    }

    // Success with no output
    if (result.status === "ok") {
      return '<span class="checkmark">✓</span>';
    }

    // Aborted
    if (result.status === "aborted") {
      return '<span class="error-text">Aborted</span>';
    }

    return "";
  }

  /**
   * Format mime data with priority order
   * @param mimeData Mime data record from kernel
   * @returns HTML string or null if no supported mime type
   */
  private formatMimeData(mimeData: Record<string, string>): string | null {
    // Image formats
    if (mimeData["image/png"]) {
      return `<img src="data:image/png;base64,${mimeData["image/png"]}" />`;
    }
    if (mimeData["image/svg+xml"]) {
      const svgData = mimeData["image/svg+xml"];
      if (typeof svgData === "string" && svgData.startsWith("<svg")) {
        return svgData;
      }
      return `<img src="data:image/svg+xml;base64,${svgData}" />`;
    }
    if (mimeData["image/jpeg"]) {
      return `<img src="data:image/jpeg;base64,${mimeData["image/jpeg"]}" />`;
    }

    // Rich HTML (e.g., pandas DataFrames)
    if (mimeData["text/html"]) {
      return mimeData["text/html"];
    }

    // Plain text fallback
    if (mimeData["text/plain"]) {
      return this.wrapInPre(mimeData["text/plain"], "output-text");
    }

    return null;
  }

  /**
   * Switch display to show results for a different file
   * @param fileUri File URI to switch to
   */
  async switchToFile(fileUri: string): Promise<void> {
    // Check if active editor matches the fileUri
    const activeFileUri = getActiveDocumentUri();
    if (activeFileUri !== fileUri) {
      return;
    }

    // Track last active file
    this.lastActiveFileUri = fileUri;

    // Only switch if panel exists and is visible
    if (!this.resultPanel.isVisible()) {
      return;
    }

    logInfo(`Switching to file: ${fileUri}`);

    // Clear existing blocks and restore all results for this file
    await this.resultPanel.clearBlocks();
    await this.restoreResults(fileUri);
  }

  /**
   * Clear results for a specific file
   * @param fileUri File URI to clear results for
   */
  async clearResults(fileUri: string): Promise<void> {
    logInfo(`Clearing results for file: ${fileUri}`);
    // Remove file from mappings
    this.contentBlocks.delete(fileUri);

    // Check if active editor matches the fileUri
    const activeFileUri = getActiveDocumentUri();
    if (activeFileUri !== fileUri) {
      return;
    }

    // Clear blocks from current html
    if (this.resultPanel.isVisible()) {
      await this.resultPanel.clearBlocks();
    }
  }

  dispose(): void {
    this.resultPanel.dispose();
  }
}
