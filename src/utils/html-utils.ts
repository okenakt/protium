import * as fs from "fs";
import * as path from "path";

/**
 * Load HTML template from file and replace placeholders
 * @param templatePath Relative path from project root (e.g., 'templates/display/result-panel.html')
 * @param replacements Object with placeholder replacements (e.g., {maxHeight: 1000, lineHeight: 20})
 * @returns HTML string with placeholders replaced
 */
export function loadTemplate(
  templatePath: string,
  replacements?: Record<string, string | number>,
): string {
  const fullPath = path.join(__dirname, "..", templatePath);
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
