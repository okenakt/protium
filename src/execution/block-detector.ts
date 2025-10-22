import * as vscode from "vscode";

/**
 * BlockDetector detects Python code blocks
 */
export class BlockDetector {
  private readonly blockStartPatterns = [
    /^\s*@\w+/, // Decorator
    /^\s*(def\s+\w+)/, // Function definition
    /^\s*(class\s+\w+)/, // Class definition
    /^\s*(if\s+.+:)/, // If statement
    /^\s*(for\s+.+:)/, // For loop
    /^\s*(while\s+.+:)/, // While loop
    /^\s*(with\s+.+:)/, // With statement
    /^\s*(try\s*:)/, // Try block
    /^\s*(async\s+)/, // Async keyword (async def, async for, async with)
    /^\s*(match\s+.+:)/, // Match statement
  ];

  private readonly skipPatterns = [
    /^\s*$/, // Empty line
    /^\s*#/, // Comment line
  ];

  private readonly continuationRules = [
    {
      // Decorator can be followed by another decorator or definition
      starter: /^\s*@\w+/,
      continuations: [
        /^\s*@\w+/, // Another decorator
        /^\s*(async\s+)/, // Async
        /^\s*(def\s+\w+)/, // Function
        /^\s*(class\s+\w+)/, // Class
      ],
    },
    {
      // if/elif/else control flow group
      starter: /^\s*if\s+/,
      continuations: [/^\s*elif\s+/, /^\s*else\s*:/],
    },
    {
      // try/except/else/finally control flow group
      starter: /^\s*try\s*:/,
      continuations: [/^\s*except/, /^\s*else\s*:/, /^\s*finally\s*:/],
    },
    {
      // match/case control flow group
      starter: /^\s*match\s+/,
      continuations: [/^\s*case\s+/],
    },
  ];

  /**
   * Detects the code block based on cursor position
   * @param document Text document
   * @param position Cursor position
   * @returns Range of code block
   */
  detectCodeBlock(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Range {
    const startLine = position.line;
    const endLine = this.findBlockEnd(document, startLine);

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(
      endLine,
      document.lineAt(endLine).text.length,
    );

    return new vscode.Range(startPos, endPos);
  }

  /**
   * Checks if a line should be skipped during block detection (empty lines and comments)
   * @param line Line text to check
   * @returns True if line should be skipped
   */
  private shouldSkipLine(line: string): boolean {
    return this.skipPatterns.some((pattern) => pattern.test(line));
  }

  /**
   * Finds the last line of a code block starting from the given line
   * @param document Text document
   * @param startLine Line number to start searching from
   * @returns Line number of the last line in the block
   */
  private findBlockEnd(
    document: vscode.TextDocument,
    startLine: number,
  ): number {
    const startLineText = document.lineAt(startLine).text;

    // Check if this line starts a block
    const isBlock = this.blockStartPatterns.some((pattern) =>
      pattern.test(startLineText),
    );

    // If not a block start, return the start line itself
    if (!isBlock) {
      return startLine;
    }

    const startIndent = this.getIndentLevel(startLineText);
    let lastBlockLine = startLine;

    for (let line = startLine + 1; line < document.lineCount; line++) {
      const lineText = document.lineAt(line).text;
      const indent = this.getIndentLevel(lineText);

      // Skip empty lines and comments
      if (this.shouldSkipLine(lineText)) {
        continue;
      }

      // Less indent - block ends
      if (indent < startIndent) {
        break;
      }

      // Deeper indent - inside the block
      if (indent > startIndent) {
        lastBlockLine = line;
        continue;
      }

      // Same indent - check if continuation keyword
      if (this.isContinuationKeyword(lineText, startLineText)) {
        lastBlockLine = line;
        continue;
      }

      // Not a continuation - block ends here
      break;
    }

    return lastBlockLine;
  }

  /**
   * Checks if a line is a continuation keyword for the current block (e.g., elif, else, except)
   * @param line Line text to check
   * @param startLine Starting line text of the block
   * @returns True if line is a continuation keyword
   */
  private isContinuationKeyword(line: string, startLine: string): boolean {
    for (const rule of this.continuationRules) {
      // First check if startLine matches the starter pattern
      if (rule.starter.test(startLine)) {
        // Then check if line is in the continuations
        return rule.continuations.some((pattern) => pattern.test(line));
      }
    }

    return false;
  }

  /**
   * Calculate indentation level of a line
   * @param line Line text to calculate
   * @returns Number of spaces (tabs count as 4 spaces)
   */
  private getIndentLevel(line: string): number {
    let indent = 0;
    for (const char of line) {
      if (char === " ") {
        indent++;
      } else if (char === "\t") {
        indent += 4;
      } else {
        break;
      }
    }
    return indent;
  }
}
