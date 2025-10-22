import * as os from "os";
import * as vscode from "vscode";

/**
 * Get the configured line height from VS Code editor settings
 * @returns Line height in pixels
 */
export function getLineHeight(): number {
  const config = vscode.workspace.getConfiguration("editor");
  const fontSize = config.get<number>("fontSize", 14);
  const lineHeightSetting = config.get<number>("lineHeight", 0);

  // VS Code's GOLDEN_LINE_HEIGHT_RATIO from fontInfo.ts
  const GOLDEN_LINE_HEIGHT_RATIO = os.platform() === "darwin" ? 1.5 : 1.35;
  const MINIMUM_LINE_HEIGHT = 8;

  if (lineHeightSetting === 0) {
    // Default: use platform-specific golden ratio
    return Math.round(GOLDEN_LINE_HEIGHT_RATIO * fontSize);
  } else if (lineHeightSetting < MINIMUM_LINE_HEIGHT) {
    // Treat as multiplier if less than minimum
    return Math.round(fontSize * lineHeightSetting);
  } else {
    // Otherwise it's an absolute pixel value
    return lineHeightSetting;
  }
}

/**
 * Extract file name from URI
 * @param fileUri File URI string
 * @returns File name
 */
export function getFileNameFromUri(fileUri: string): string {
  try {
    const uri = vscode.Uri.parse(fileUri);
    return uri.path.split("/").pop() || fileUri;
  } catch {
    return fileUri;
  }
}

/**
 * Get the currently active text editor
 * @returns Active text editor or undefined
 */
export function getActiveEditor(): vscode.TextEditor | undefined {
  return vscode.window.activeTextEditor;
}

/**
 * Check if the given editor is a Python file editor
 * @param editor Text editor to check
 * @returns True if editor is Python file
 */
export function isPythonEditor(
  editor: vscode.TextEditor | undefined,
): editor is vscode.TextEditor {
  return editor !== undefined && editor.document.languageId === "python";
}

/**
 * Get the currently active Python text editor
 * @returns Active Python editor or undefined
 */
export function getActivePythonEditor(): vscode.TextEditor | undefined {
  const editor = getActiveEditor();
  if (!editor || editor.document.languageId !== "python") {
    return undefined;
  }
  return editor;
}

/**
 * Get the URI of the currently active document
 * @returns Document URI string or undefined
 */
export function getActiveDocumentUri(): string | undefined {
  const editor = getActiveEditor();
  return editor?.document.uri.toString();
}
