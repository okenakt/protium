import * as assert from "assert";
import * as vscode from "vscode";
import { BlockDetector } from "../../execution/block-detector";

suite("BlockDetector Test Suite", () => {
  let detector: BlockDetector;

  setup(() => {
    detector = new BlockDetector();
  });

  /**
   * Creates a mock VS Code TextDocument from text string for testing
   * @param text Multi-line text string (lines separated by \n)
   * @returns Mock TextDocument with lineCount, lineAt, and getText methods
   */
  function createMockDocument(text: string): vscode.TextDocument {
    const lines = text.split("\n");
    return {
      lineCount: lines.length,
      lineAt: (line: number) => ({
        text: lines[line] || "",
        range: new vscode.Range(line, 0, line, (lines[line] || "").length),
      }),
      getText: (range: vscode.Range) => {
        const result: string[] = [];
        for (let i = range.start.line; i <= range.end.line; i++) {
          result.push(lines[i] || "");
        }
        return result.join("\n");
      },
    } as any;
  }

  /**
   * Helper to test block detection
   * @param code Code text
   * @param startLine Line number to start detection
   * @param expectedEndLine Expected end line number
   */
  function assertBlockRange(
    code: string,
    startLine: number,
    expectedEndLine: number,
  ): void {
    const doc = createMockDocument(code);
    const range = detector.detectCodeBlock(doc, new vscode.Position(startLine, 0));
    assert.strictEqual(range.start.line, startLine);
    assert.strictEqual(range.end.line, expectedEndLine);
  }

  suite("Single line detection", () => {
    test("Single statement line", () => {
      assertBlockRange("x = 1", 0, 0);
    });

    test("Comment line", () => {
      assertBlockRange("# This is a comment", 0, 0);
    });

    test("Empty line", () => {
      assertBlockRange("", 0, 0);
    });
  });

  suite("Function detection", () => {
    test("Simple function", () => {
      assertBlockRange(
        [
          "def add(x, y):", ////////////////////////////////// 0
          "    return x + y", //////////////////////////////// 1
        ].join("\n"),
        0,
        1,
      );
    });

    test("Multi-line function", () => {
      assertBlockRange(
        [
          "def process():", ////////////////////////////////// 0
          "    x = 1", /////////////////////////////////////// 1
          "    y = 2", /////////////////////////////////////// 2
          "    return x + y", //////////////////////////////// 3
        ].join("\n"),
        0,
        3,
      );
    });

    test("Function with empty line before body", () => {
      assertBlockRange(
        [
          "def func():", ///////////////////////////////////// 0
          "", //////////////////////////////////////////////// 1
          "    return True", ///////////////////////////////// 2
        ].join("\n"),
        0,
        2,
      );
    });

    test("Function with comment line before body", () => {
      assertBlockRange(
        [
          "def func():", ///////////////////////////////////// 0
          "# comment", /////////////////////////////////////// 1
          "    return True", ///////////////////////////////// 2
        ].join("\n"),
        0,
        2,
      );
    });

    test("Async function", () => {
      assertBlockRange(
        [
          "async def fetch():", ////////////////////////////// 0
          "    return await get_data()", ///////////////////// 1
        ].join("\n"),
        0,
        1,
      );
    });
  });

  suite("Class detection", () => {
    test("Simple class", () => {
      assertBlockRange(
        [
          "class MyClass:", ////////////////////////////////// 0
          "    def __init__(self):", ///////////////////////// 1
          "        self.x = 1", ////////////////////////////// 2
        ].join("\n"),
        0,
        2,
      );
    });

    test("Class with comment before method", () => {
      assertBlockRange(
        [
          "class MyClass:", ////////////////////////////////// 0
          "# Constructor", /////////////////////////////////// 1
          "    def __init__(self):", ///////////////////////// 2
          "        self.x = 1", ////////////////////////////// 3
        ].join("\n"),
        0,
        3,
      );
    });
  });

  suite("If/elif/else detection", () => {
    test("If statement alone", () => {
      assertBlockRange(
        [
          "if x > 0:", /////////////////////////////////////// 0
          '    print("positive")', /////////////////////////// 1
        ].join("\n"),
        0,
        1,
      );
    });

    test("If-else statement", () => {
      assertBlockRange(
        [
          "if x > 0:", /////////////////////////////////////// 0
          '    print("positive")', /////////////////////////// 1
          "else:", /////////////////////////////////////////// 2
          '    print("not positive")', /////////////////////// 3
        ].join("\n"),
        0,
        3,
      );
    });

    test("If-elif-else statement", () => {
      assertBlockRange(
        [
          "if x > 0:", /////////////////////////////////////// 0
          '    print("positive")', /////////////////////////// 1
          "elif x < 0:", ///////////////////////////////////// 2
          '    print("negative")', /////////////////////////// 3
          "else:", /////////////////////////////////////////// 4
          '    print("zero")', /////////////////////////////// 5
        ].join("\n"),
        0,
        5,
      );
    });

    test("Two consecutive if statements", () => {
      assertBlockRange(
        [
          "if x > 0:", /////////////////////////////////////// 0
          '    print("positive")', /////////////////////////// 1
          "if y > 0:", /////////////////////////////////////// 2
          '    print("y positive")', ///////////////////////// 3
        ].join("\n"),
        0,
        1,
      );
    });

    test("If-else with comment between", () => {
      assertBlockRange(
        [
          "if x > 0:", /////////////////////////////////////// 0
          '    print("positive")', /////////////////////////// 1
          "# comment", /////////////////////////////////////// 2
          "else:", /////////////////////////////////////////// 3
          '    print("not positive")', /////////////////////// 4
        ].join("\n"),
        0,
        4,
      );
    });
  });

  suite("Try/except/finally detection", () => {
    test("Try-except", () => {
      assertBlockRange(
        [
          "try:", //////////////////////////////////////////// 0
          "    risky()", ///////////////////////////////////// 1
          "except ValueError:", ////////////////////////////// 2
          "    handle()", //////////////////////////////////// 3
        ].join("\n"),
        0,
        3,
      );
    });

    test("Try-except-else", () => {
      assertBlockRange(
        [
          "try:", //////////////////////////////////////////// 0
          "    risky()", ///////////////////////////////////// 1
          "except ValueError:", ////////////////////////////// 2
          "    handle()", //////////////////////////////////// 3
          "else:", /////////////////////////////////////////// 4
          "    success()", /////////////////////////////////// 5
        ].join("\n"),
        0,
        5,
      );
    });

    test("Try-except-finally", () => {
      assertBlockRange(
        [
          "try:", //////////////////////////////////////////// 0
          "    risky()", ///////////////////////////////////// 1
          "except ValueError:", ////////////////////////////// 2
          "    handle()", //////////////////////////////////// 3
          "finally:", //////////////////////////////////////// 4
          "    cleanup()", /////////////////////////////////// 5
        ].join("\n"),
        0,
        5,
      );
    });

    test("Multiple except blocks", () => {
      assertBlockRange(
        [
          "try:", //////////////////////////////////////////// 0
          "    risky()", ///////////////////////////////////// 1
          "except ValueError:", ////////////////////////////// 2
          "    handle_value()", ////////////////////////////// 3
          "except TypeError:", /////////////////////////////// 4
          "    handle_type()", /////////////////////////////// 5
          "finally:", //////////////////////////////////////// 6
          "    cleanup()", /////////////////////////////////// 7
        ].join("\n"),
        0,
        7,
      );
    });

    test("Two consecutive try statements", () => {
      assertBlockRange(
        [
          "try:", //////////////////////////////////////////// 0
          "    risky()", ///////////////////////////////////// 1
          "except ValueError:", ////////////////////////////// 2
          "    handle()", //////////////////////////////////// 3
          "try:", //////////////////////////////////////////// 4
          "    another()", /////////////////////////////////// 5
          "except:", ///////////////////////////////////////// 6
          "    handle_another()", //////////////////////////// 7
        ].join("\n"),
        0,
        3,
      );
    });

    test("Try-finally with comment between", () => {
      assertBlockRange(
        [
          "try:", //////////////////////////////////////////// 0
          "    risky()", ///////////////////////////////////// 1
          "# cleanup", /////////////////////////////////////// 2
          "finally:", //////////////////////////////////////// 3
          "    cleanup()", /////////////////////////////////// 4
        ].join("\n"),
        0,
        4,
      );
    });
  });

  suite("Loop detection", () => {
    test("For loop", () => {
      assertBlockRange(
        [
          "for i in range(10):", ///////////////////////////// 0
          "    print(i)", //////////////////////////////////// 1
        ].join("\n"),
        0,
        1,
      );
    });

    test("Async for loop", () => {
      assertBlockRange(
        [
          "async for item in async_gen():", ////////////////// 0
          "    process(item)", /////////////////////////////// 1
        ].join("\n"),
        0,
        1,
      );
    });

    test("While loop", () => {
      assertBlockRange(
        [
          "while x > 0:", //////////////////////////////////// 0
          "    x -= 1", ////////////////////////////////////// 1
        ].join("\n"),
        0,
        1,
      );
    });
  });

  suite("With statement detection", () => {
    test("With statement", () => {
      assertBlockRange(
        [
          'with open("file.txt") as f:', ///////////////////// 0
          "    content = f.read()", ////////////////////////// 1
        ].join("\n"),
        0,
        1,
      );
    });

    test("Async with statement", () => {
      assertBlockRange(
        [
          "async with session.get(url) as r:", /////////////// 0
          "    data = await r.json()", /////////////////////// 1
        ].join("\n"),
        0,
        1,
      );
    });
  });

  suite("Match/case detection", () => {
    test("Match statement with multiple cases", () => {
      assertBlockRange(
        [
          "match status:", /////////////////////////////////// 0
          "    case 200:", /////////////////////////////////// 1
          '        print("OK")', ///////////////////////////// 2
          "    case 404:", /////////////////////////////////// 3
          '        print("Not Found")', ////////////////////// 4
          "    case _:", ///////////////////////////////////// 5
          '        print("Other")', ////////////////////////// 6
        ].join("\n"),
        0,
        6,
      );
    });

    test("Two consecutive match statements", () => {
      assertBlockRange(
        [
          "match x:", //////////////////////////////////////// 0
          "    case 1:", ///////////////////////////////////// 1
          '        print("one")', //////////////////////////// 2
          "    case 2:", ///////////////////////////////////// 3
          '        print("two")', //////////////////////////// 4
          "match y:", //////////////////////////////////////// 5
          "    case 3:", ///////////////////////////////////// 6
          '        print("three")', ////////////////////////// 7
        ].join("\n"),
        0,
        4,
      );
    });

    test("Match with comment between cases", () => {
      assertBlockRange(
        [
          "match x:", //////////////////////////////////////// 0
          "    case 1:", ///////////////////////////////////// 1
          '        print("one")', //////////////////////////// 2
          "    case 2:", ///////////////////////////////////// 3
          '        print("two")', //////////////////////////// 4
          "# otherwise", ///////////////////////////////////// 5
          "    case _:", ///////////////////////////////////// 6
          '        print("other")', ////////////////////////// 7
        ].join("\n"),
        0,
        7,
      );
    });
  });

  suite("Decorator detection", () => {
    test("Single decorator", () => {
      assertBlockRange(
        [
          "@decorator", ////////////////////////////////////// 0
          "def func():", ///////////////////////////////////// 1
          "    return 1", //////////////////////////////////// 2
        ].join("\n"),
        0,
        2,
      );
    });

    test("Multiple decorators", () => {
      assertBlockRange(
        [
          "@decorator1", ///////////////////////////////////// 0
          "@decorator2", ///////////////////////////////////// 1
          "@decorator3", ///////////////////////////////////// 2
          "def func():", ///////////////////////////////////// 3
          "    return 1", //////////////////////////////////// 4
        ].join("\n"),
        0,
        4,
      );
    });

    test("Decorators with comment lines", () => {
      assertBlockRange(
        [
          "@decorator1", ///////////////////////////////////// 0
          "# Comment about decorator", /////////////////////// 1
          "@decorator2", ///////////////////////////////////// 2
          "def func():", ///////////////////////////////////// 3
          "    return 1", //////////////////////////////////// 4
        ].join("\n"),
        0,
        4,
      );
    });

    test("Single decorator on async function", () => {
      assertBlockRange(
        [
          "@decorator", ////////////////////////////////////// 0
          "async def fetch():", ////////////////////////////// 0
          "    return await get_data()", ///////////////////// 1
        ].join("\n"),
        0,
        2,
      );
    });

    test("Single decorator on class", () => {
      assertBlockRange(
        [
          "@dataclass", ////////////////////////////////////// 0
          "class Point:", //////////////////////////////////// 1
          "    x: int", ////////////////////////////////////// 2
          "    y: int", ////////////////////////////////////// 3
        ].join("\n"),
        0,
        3,
      );
    });
  });

  suite("Docstring detection", () => {
    test("Single-line docstring with single quotes", () => {
      assertBlockRange(
        [
          "def func():", ///////////////////////////////////// 0
          "    '''This is a docstring'''", /////////////////// 1
          "    return 1", //////////////////////////////////// 2
        ].join("\n"),
        0,
        2,
      );
    });

    test("Single-line docstring with double quotes", () => {
      assertBlockRange(
        [
          "def func():", ///////////////////////////////////// 0
          '    """This is a docstring"""', /////////////////// 1
          "    return 1", //////////////////////////////////// 2
        ].join("\n"),
        0,
        2,
      );
    });

    test("Multi-line docstring with single quotes", () => {
      assertBlockRange(
        [
          "def func():", ///////////////////////////////////// 0
          "    '''", ///////////////////////////////////////// 1
          "    This is a multi-line docstring", ////////////// 2
          "    with single quotes", ////////////////////////// 3
          "    '''", ///////////////////////////////////////// 4
          "    return 1", //////////////////////////////////// 5
        ].join("\n"),
        0,
        5,
      );
    });

    test("Multi-line docstring with double quotes", () => {
      assertBlockRange(
        [
          "def func():", ///////////////////////////////////// 0
          '    """', ///////////////////////////////////////// 1
          "    This is a multi-line docstring", ////////////// 2
          "    with double quotes", ////////////////////////// 3
          '    """', ///////////////////////////////////////// 4
          "    return 1", //////////////////////////////////// 5
        ].join("\n"),
        0,
        5,
      );
    });

    test("Class with docstring", () => {
      assertBlockRange(
        [
          "class MyClass:", ////////////////////////////////// 0
          '    """Class docstring"""', /////////////////////// 1
          "    def __init__(self):", ///////////////////////// 2
          "        self.x = 1", ////////////////////////////// 3
        ].join("\n"),
        0,
        3,
      );
    });
  });

  suite("Edge cases", () => {
    test("Nested blocks", () => {
      const code = [
        "if x > 0:", ///////////////////////////////////////// 0
        "    for i in range(x):", //////////////////////////// 1
        "        print(i)", ////////////////////////////////// 2
      ].join("\n");

      // Cursor on if should return entire if block
      assertBlockRange(code, 0, 2);

      // Cursor on for should return for block
      assertBlockRange(code, 1, 2);
    });

    test("Block with comment at same indent in middle", () => {
      assertBlockRange(
        [
          "def func():", ///////////////////////////////////// 0
          "    x = 1", /////////////////////////////////////// 1
          "# comment", /////////////////////////////////////// 2
          "    print(x)", //////////////////////////////////// 3
        ].join("\n"),
        0,
        3,
      );
    });

    test("If block with wrongly indented else", () => {
      assertBlockRange(
        [
          "    if x > 0:", /////////////////////////////////// 0
          "        print('positive')", /////////////////////// 1
          "else:", /////////////////////////////////////////// 2
          "    print('not positive')", /////////////////////// 3
        ].join("\n"),
        0,
        1,
      );
    });
  });
});
