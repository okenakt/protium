import * as vscode from "vscode";

/**
 * BlockDetector detects Python code blocks
 */
export class BlockDetector {
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
    const startIndent = this.getIndentLevel(startLineText);
    let lastBlockLine = startLine;
    let unclosedBrackets = this.countBrackets(startLineText);
    let prevUnclosedBrackets = unclosedBrackets;

    for (let line = startLine + 1; line < document.lineCount; line++) {
      const lineText = document.lineAt(line).text;
      const prevLineText = document.lineAt(line - 1).text;

      prevUnclosedBrackets = unclosedBrackets;
      unclosedBrackets += this.countBrackets(lineText);

      // === Force continuation ===

      // 1. Backslash continuation
      if (this.endsWithBackslash(prevLineText)) {
        if (!this.shouldSkipLine(lineText)) {
          lastBlockLine = line;
        }
        continue;
      }

      // 2. Inside bracket continuation (brackets were already open)
      if (unclosedBrackets > 0 && prevUnclosedBrackets > 0) {
        if (!this.shouldSkipLine(lineText)) {
          lastBlockLine = line;
        }
        continue;
      }

      // 3. Skip lines (empty lines and comments) - defer judgment
      if (this.shouldSkipLine(lineText)) {
        continue;
      }

      // === Termination check ===

      const indent = this.getIndentLevel(lineText);

      // 4. Shallower indentation - block ends
      if (indent < startIndent) {
        break;
      }

      // 5. Same indentation
      if (indent === startIndent) {
        // 5a. Bracket just closed on this line (e.g., `):`  in `def func():`)
        if (prevUnclosedBrackets > 0 && unclosedBrackets === 0) {
          lastBlockLine = line;
          continue;
        }

        // 5b. Continuation keyword (elif, else, except, etc.)
        if (this.isContinuationKeyword(lineText, startLineText)) {
          lastBlockLine = line;
          continue;
        }

        // Otherwise (including new statement with opening bracket) - block ends
        break;
      }

      // 6. Deeper indentation - continue
      lastBlockLine = line;
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

  /**
   * Checks if line ends with backslash continuation
   * @param line Line text to check
   * @returns True if line ends with backslash
   */
  private endsWithBackslash(line: string): boolean {
    return line.trimEnd().endsWith("\\");
  }

  /**
   * Counts unclosed brackets in a line, ignoring brackets inside strings and comments
   * @param line Line text to analyze
   * @returns Net count of unclosed brackets (positive means more opening brackets)
   */
  private countBrackets(line: string): number {
    // Remove strings and comments to avoid counting brackets inside them
    const cleaned = line
      .replace(/"""[\s\S]*?"""/g, '""') // Triple double quotes (single line)
      .replace(/'''[\s\S]*?'''/g, "''") // Triple single quotes (single line)
      .replace(/"(?:[^"\\]|\\.)*"/g, '""') // Double quoted strings
      .replace(/'(?:[^'\\]|\\.)*'/g, "''") // Single quoted strings
      .replace(/#.*$/, ""); // Comments

    let count = 0;
    for (const char of cleaned) {
      if (char === "(" || char === "[" || char === "{") {
        count++;
      } else if (char === ")" || char === "]" || char === "}") {
        count--;
      }
    }
    return count;
  }
}
