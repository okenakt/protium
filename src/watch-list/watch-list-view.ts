import * as vscode from "vscode";
import { WatchExpression } from "../types/watch";
import { logInfo } from "../utils";
import {
  escapeHtml,
  getNonce,
  loadTemplate,
  stripAnsi,
} from "../utils/html-utils";
import { isRichResult, renderResultAsHtml } from "../utils/result-renderer";
import { getLineHeight } from "../utils/vscode-apis";

/**
 * Displays watch expressions in a webview panel
 */
export class WatchListView implements vscode.WebviewViewProvider {
  public static readonly viewType = "protium.watchList";

  private view?: vscode.WebviewView;
  private watches: WatchExpression[] = [];
  private currentFileUri: string | undefined;
  private initialized = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private callbacks?: {
      onRemoveWatch?: (watchId: string) => void;
      onRefreshWatch?: (watchId: string) => void;
      onRefreshAll?: () => void;
      onClearAll?: () => void;
      onAddWatch?: (expression: string, fileUri: string) => void;
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

    logInfo("Watch list view created");
  }

  /**
   * Updates the watch list display with current data.
   * @param watches Array of watch expressions to display
   * @param currentFileUri Current active file URI
   */
  public update(watches: WatchExpression[], currentFileUri?: string): void {
    if (!this.view || !this.initialized) {
      return;
    }

    this.watches = watches;
    if (currentFileUri !== undefined) {
      this.currentFileUri = currentFileUri;
    }

    // Filter watches for current file
    const filteredWatches = this.currentFileUri
      ? watches.filter((w) => w.filePath === this.currentFileUri)
      : watches;

    logInfo(
      `Updating watch list: ${filteredWatches.length}/${this.watches.length} watches for file: ${this.currentFileUri}`,
    );

    const html = this.renderWatches(filteredWatches);

    this.view.webview.postMessage({
      command: "updateWatchList",
      data: {
        html,
        fileUri: this.currentFileUri,
      },
    });
  }

  /**
   * Renders watches as HTML
   * @param watches Watches to render
   * @returns HTML string
   */
  private renderWatches(watches: WatchExpression[]): string {
    if (watches.length === 0) {
      return '<div class="no-watches">No watches for this file.<br/>Enter an expression above.</div>';
    }

    return watches
      .map((w) => {
        let resultHtml: string;

        if (w.error) {
          resultHtml = `<pre class="watch-error">${escapeHtml(stripAnsi(w.error))}</pre>`;
        } else if (w.value !== undefined) {
          // Use common result renderer
          const rendered = renderResultAsHtml(w.mimeData, w.value);
          if (rendered) {
            // If it's rich HTML (images, tables, etc.), wrap in div
            // Otherwise it's already wrapped in <pre> by renderResultAsHtml
            if (isRichResult(w.mimeData)) {
              resultHtml = `<div class="watch-value">${rendered}</div>`;
            } else {
              // Already has <pre> tag with escaped content
              // Just add the class to the existing pre tag
              resultHtml = rendered.replace(
                "<pre>",
                '<pre class="watch-value">',
              );
            }
          } else {
            resultHtml = '<pre class="watch-value">No output</pre>';
          }
        } else {
          resultHtml = '<pre class="watch-pending">Not evaluated yet</pre>';
        }

        return loadTemplate("watch-list/watch-item.html", {
          id: w.id,
          expression: escapeHtml(w.expression),
          resultHtml: resultHtml,
        });
      })
      .join("");
  }

  /**
   * Updates the current file context
   * @param fileUri Current file URI
   */
  public setCurrentFile(fileUri: string): void {
    if (this.currentFileUri !== fileUri) {
      this.currentFileUri = fileUri;
      logInfo(`Watch list switched to file: ${fileUri}`);
      this.update(this.watches, fileUri);
    }
  }

  /**
   * Sets up message handler for webview commands.
   * @param webviewView The webview view to attach handler to
   */
  private setupMessageHandler(webviewView: vscode.WebviewView): void {
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "removeWatch":
          this.callbacks?.onRemoveWatch?.(message.watchId);
          break;
        case "refreshWatch":
          this.callbacks?.onRefreshWatch?.(message.watchId);
          break;
        case "refreshAll":
          this.callbacks?.onRefreshAll?.();
          break;
        case "clearAll":
          this.callbacks?.onClearAll?.();
          break;
        case "addWatch":
          if (this.currentFileUri && message.expression) {
            this.callbacks?.onAddWatch?.(
              message.expression,
              this.currentFileUri,
            );
          }
          break;
      }
    });
  }

  /**
   * Sets up visibility change handler
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
   * Initializes the webview with HTML content
   */
  private initialize(): void {
    if (!this.view) {
      return;
    }

    const webview = this.view.webview;
    const nonce = getNonce();
    const lineHeight = getLineHeight();

    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "node_modules",
        "@vscode",
        "codicons",
        "dist",
        "codicon.css",
      ),
    );

    webview.html = loadTemplate("watch-list/watch-list.html", {
      nonce,
      cspSource: webview.cspSource,
      codiconsUri: codiconsUri.toString(),
      lineHeight: lineHeight,
    });

    this.initialized = true;

    logInfo(`Watch list view initialized with lineHeight: ${lineHeight}`);
  }
}
