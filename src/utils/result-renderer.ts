import { escapeHtml, stripAnsi } from "./html-utils";

/**
 * Renders execution result as HTML based on MIME data
 * This is used by both result-display and watch-list for consistent rendering
 *
 * @param mimeData MIME data from execution result
 * @param fallbackText Fallback plain text if no MIME data available
 * @returns HTML string for rendering the result
 */
export function renderResultAsHtml(
  mimeData: Record<string, string> | undefined,
  fallbackText?: string,
): string | null {
  if (!mimeData && !fallbackText) {
    return null;
  }

  // Priority order for MIME types (same as result-display-manager)

  // 1. Images (PNG, JPEG, SVG)
  if (mimeData?.["image/png"]) {
    return `<img src="data:image/png;base64,${mimeData["image/png"]}" />`;
  }
  if (mimeData?.["image/svg+xml"]) {
    const svgData = mimeData["image/svg+xml"];
    if (typeof svgData === "string" && svgData.startsWith("<svg")) {
      return svgData;
    }
    return `<img src="data:image/svg+xml;base64,${svgData}" />`;
  }
  if (mimeData?.["image/jpeg"]) {
    return `<img src="data:image/jpeg;base64,${mimeData["image/jpeg"]}" />`;
  }

  // 2. Rich HTML (e.g., pandas DataFrames)
  if (mimeData?.["text/html"]) {
    return mimeData["text/html"];
  }

  // 3. Plain text fallback
  const textValue = mimeData?.["text/plain"] || fallbackText;
  if (textValue) {
    return `<pre>${escapeHtml(stripAnsi(textValue.trimEnd()))}</pre>`;
  }

  return null;
}

/**
 * Checks if the rendered result is rich HTML (not plain text)
 * Used to determine whether to apply special styling
 *
 * @param mimeData MIME data from execution result
 * @returns True if result contains rich HTML, images, or SVG
 */
export function isRichResult(mimeData: Record<string, string> | undefined): boolean {
  if (!mimeData) {
    return false;
  }

  return !!(
    mimeData["image/png"] ||
    mimeData["image/svg+xml"] ||
    mimeData["image/jpeg"] ||
    mimeData["text/html"]
  );
}
