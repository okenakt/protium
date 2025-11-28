import * as fs from "fs";
import * as path from "path";
import { logInfo } from "./output-logger";

let templatesDir: string;

/**
 * Set the templates directory path for resolving template files
 * @param dirPath Templates directory path (e.g., path.join(__dirname, "templates"))
 */
export function setTemplatesDir(dirPath: string): void {
  templatesDir = dirPath;
  logInfo(`Templates directory set to: ${path.join(__dirname, "templates")}`);
}

/**
 * Load HTML template from file and replace placeholders
 * @param templatePath Relative path from templates/ directory (e.g., 'result-display/result-panel.html')
 * @param replacements Object with placeholder replacements (e.g., {maxHeight: 1000, lineHeight: 20})
 * @returns HTML string with placeholders replaced
 */
export function loadTemplate(
  templatePath: string,
  replacements?: Record<string, string | number>,
): string {
  const fullPath = path.join(templatesDir, templatePath);
  let content = fs.readFileSync(fullPath, "utf-8");

  if (replacements) {
    for (const [key, value] of Object.entries(replacements)) {
      const placeholder = `{{${key}}}`;
      content = content.replace(new RegExp(placeholder, "g"), String(value));
    }
  }

  return content;
}

/**
 * Remove ANSI escape sequences from text
 * @param text Text containing ANSI codes
 * @returns Text with ANSI codes removed
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Escape HTML special characters
 * @param text Text to escape
 * @returns HTML-escaped text
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generates a random nonce for CSP
 * @returns Random nonce string
 */
export function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
