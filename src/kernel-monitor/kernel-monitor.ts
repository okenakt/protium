import * as vscode from "vscode";
import { KernelExecInfo } from "../types/kernel";
import { logInfo } from "../utils";
import { escapeHtml, loadTemplate } from "../utils/html-utils";

/**
 * Displays kernel status in a table format in the bottom panel.
 */
export class KernelMonitor implements vscode.WebviewViewProvider {
  public static readonly viewType = "protium.kernelMonitor";

  private view?: vscode.WebviewView;
  private kernels: KernelExecInfo[] = [];
  private initialized = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private callbacks?: {
      onInterrupt?: (kernelId: string) => void;
      onRestart?: (kernelId: string) => void;
      onShutdown?: (kernelId: string) => void;
      onVisible?: () => void;
    },
  ) {}

  /**
   * Resolves the webview view when it becomes visible.
   * @param webviewView The webview view to resolve
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri,
        vscode.Uri.joinPath(
          this.extensionUri,
          "node_modules",
          "@vscode",
          "codicons",
          "dist",
        ),
      ],
    };

    this.setupMessageHandler(webviewView);
    this.setupVisibilityHandler(webviewView);
    this.initialize();

    if (webviewView.visible) {
      this.callbacks?.onVisible?.();
    }

    logInfo("Kernel monitor created");
  }

  /**
   * Updates the kernel display with current data.
   * @param kernels Array of kernel information to display
   */
  public update(kernels: KernelExecInfo[]): void {
    if (!this.view || !this.initialized) {
      return;
    }

    this.kernels = kernels;

    logInfo(
      `Updating kernel monitor via postMessage: ${this.kernels.length} kernels`,
    );

    const rows = this.kernels.map((kernel) => ({
      kernelId: kernel.id,
      html: this.generateRowHtml(kernel),
    }));

    this.view.webview.postMessage({
      command: "updateKernelRows",
      data: { rows },
    });
  }

  /**
   * Sets up message handler for webview commands.
   * @param webviewView The webview view to attach handler to
   */
  private setupMessageHandler(webviewView: vscode.WebviewView): void {
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "interrupt":
          this.callbacks?.onInterrupt?.(message.kernelId);
          break;
        case "restart":
          this.callbacks?.onRestart?.(message.kernelId);
          break;
        case "shutdown":
          this.callbacks?.onShutdown?.(message.kernelId);
          break;
      }
    });
  }

  /**
   * Sets up visibility change handler to update on view show.
   * @param webviewView The webview view to attach handler to
   */
  private setupVisibilityHandler(webviewView: vscode.WebviewView): void {
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.callbacks?.onVisible?.();
      }
    });
  }

  /**
   * Initializes webview with HTML template on first load.
   */
  private initialize(): void {
    if (!this.view || this.initialized) {
      return;
    }

    logInfo("Initializing kernel monitor HTML");

    const nonce = this.getNonce();
    const codiconsUri = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "node_modules",
        "@vscode/codicons",
        "dist",
        "codicon.css",
      ),
    );

    this.view.webview.html = loadTemplate(
      "templates/kernel-monitor/kernel-monitor.html",
      {
        cspSource: this.view.webview.cspSource,
        nonce: nonce,
        codiconsUri: codiconsUri.toString(),
      },
    );

    this.initialized = true;

    if (this.kernels.length > 0) {
      this.update(this.kernels);
    }
  }

  /**
   * Generates HTML for a single kernel row.
   * @param kernel Kernel information to render
   * @returns HTML string for the table row
   */
  private generateRowHtml(kernel: KernelExecInfo): string {
    const filesDisplay =
      kernel.connectedFiles.length > 0
        ? kernel.connectedFiles
            .map((f) => `<div class="file-item">${escapeHtml(f)}</div>`)
            .join("")
        : '<div class="no-files">No connections</div>';

    const kernelIdShort = escapeHtml(kernel.id.substring(0, 8));
    const statusClass = `status-${kernel.status}`;
    const statusText =
      kernel.status.charAt(0).toUpperCase() + kernel.status.slice(1);

    return loadTemplate("templates/kernel-monitor/table-row.html", {
      kernelId: escapeHtml(kernel.id),
      kernelName: escapeHtml(kernel.name),
      statusClass: statusClass,
      statusText: statusText,
      execCount: kernel.execCount.toString(),
      kernelIdShort: kernelIdShort,
      filesDisplay: filesDisplay,
    });
  }

  /**
   * Generates a random nonce for Content Security Policy.
   * @returns Random 32-character string
   */
  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
