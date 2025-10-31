# Development Guide

## Development Setup

### Prerequisites

- **Node.js**: v18 or higher
- **npm**: Comes with Node.js
- **VS Code**: Latest version recommended
- **Python**: 3.8 or higher (for testing kernel functionality)

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd protium

# Install dependencies
npm install

# Build the extension
npm run compile
```

### Development Workflow

#### Building

```bash
# One-time build
npm run compile

# Watch mode (auto-rebuild on file changes)
npm run watch

# Clean build artifacts
npm run clean
```

#### Running the Extension

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. A new VS Code window opens with the extension loaded
4. Open a `.py` file and test the features

#### Running Tests

```bash
# Run all tests
npm test

# Tests are located in src/test/suite/
```

#### Linting

```bash
# Run ESLint
npm run lint
```

## Project Structure

```
protium/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── execution/             # Code execution logic
│   │   ├── execution-manager.ts
│   │   └── block-detector.ts
│   ├── kernel/                # Kernel management
│   │   ├── kernel-manager.ts
│   │   └── direct/            # Direct kernel provider
│   ├── result-display/        # Result display panel
│   ├── watch-list/            # Watch expression management
│   ├── kernel-monitor/        # Kernel monitor view
│   ├── interpreter/           # Python environment detection
│   ├── types/                 # TypeScript type definitions
│   ├── utils/                 # Shared utilities
│   ├── templates/             # HTML templates for WebViews
│   │   ├── kernel-monitor/
│   │   ├── result-display/
│   │   └── watch-list/
│   └── test/                  # Test files
├── out/                       # Compiled JavaScript (gitignored)
├── docs/                      # Documentation
├── package.json               # Extension manifest
└── tsconfig.json              # TypeScript configuration
```

## Coding Conventions

### TypeScript

- **Strict Mode**: Enabled in `tsconfig.json`
- **Type Annotations**: Always provide type annotations for function parameters and return values
- **No `any`**: Avoid using `any` type; use proper types or `unknown`

### File Naming

- **kebab-case**: All TypeScript files use kebab-case naming
  - Example: `execution-manager.ts`, `block-detector.ts`

### Code Style

- **Prettier**: Configured with automatic import organization
  - Run automatically on save if configured in VS Code
  - Configuration in `package.json` under `"prettier"`
- **ESLint**: Configured for TypeScript
  - Unused variables with `_` prefix are allowed (e.g., `_error`, `_code`)
  - `console.log` is allowed (use logger instead in production code)

### JSDoc Comments

All exported functions, classes, and interfaces must have JSDoc comments with the following format:

```typescript
/**
 * Brief one-sentence summary of what this function does
 * @param paramName Parameter description
 * @param anotherParam Another parameter description
 * @returns Description of return value
 */
export function exampleFunction(
  paramName: string,
  anotherParam: number,
): boolean {
  // implementation
}
```

**Rules**:

- One-sentence summary only (concise)
- `@param` for each parameter
- `@returns` for return value (omit for `void`)
- No additional tags unless necessary

**Example from codebase**:

```typescript
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
  // ...
}
```

### Error Handling

- Always use try-catch for operations that can fail
- Show user-friendly error messages via `vscode.window.showErrorMessage()`
- Log detailed errors to Output Channel using logger utilities
- Clean up resources in finally blocks or error handlers

**Example**:

```typescript
try {
  await this.kernelManager.restartKernel(kernelId);
  vscode.window.showInformationMessage("Kernel restarted");
} catch (error) {
  vscode.window.showErrorMessage(`Failed to restart kernel: ${error}`);
  logError(`Restart error: ${error}`, error);
}
```

### Logging

Use centralized logger from `src/utils/output-logger.ts`:

```typescript
import { logInfo, logWarn, logError, logDebug } from "./utils/output-logger";

logInfo("Operation completed successfully");
logWarn("Potential issue detected");
logError("Error occurred", error);
logDebug("Debug information");
```

- `logInfo`: General information
- `logWarn`: Warnings
- `logError`: Errors (include error object as second parameter)
- `logDebug`: Detailed debug information

### Naming Conventions

- **Classes**: PascalCase (e.g., `ExecutionManager`, `KernelManager`)
- **Interfaces**: PascalCase with `I` prefix for interfaces defining contracts (e.g., `IKernelProvider`)
- **Functions/Methods**: camelCase (e.g., `executeAndMoveNext`, `detectCodeBlock`)
- **Variables**: camelCase (e.g., `kernelId`, `fileUri`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `CONNECTION_TIMEOUT_MS`)
- **Private members**: No special prefix, rely on TypeScript `private` keyword

## Testing

### Test Structure

Tests are located in `src/test/suite/` and use Mocha framework:

```typescript
import * as assert from "assert";
import { BlockDetector } from "../../execution/block-detector";

suite("BlockDetector Test Suite", () => {
  test("Should detect single line", () => {
    // Test implementation
  });

  test("Should detect function block", () => {
    // Test implementation
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Tests run in a VS Code Extension Host environment
```

### Writing New Tests

1. Create a new file in `src/test/suite/` with `.test.ts` suffix
2. Import necessary modules and the code to test
3. Use `suite()` to group related tests
4. Use `test()` for individual test cases
5. Use `assert` for assertions

## Debugging

### Extension Debugging

1. Set breakpoints in TypeScript files
2. Press `F5` to launch Extension Development Host with debugger attached
3. Debugger will pause at breakpoints
4. Use Debug Console to inspect variables

### Kernel Process Debugging

Kernel processes run as separate IPython processes. To debug:

1. Check logs in Output Channel (`View` → `Output` → Select `Protium`)
2. Connection files are in `/tmp/protium-kernels/`
3. Monitor kernel process with `ps aux | grep ipykernel`

### WebView Debugging

WebViews run in isolated contexts. To debug:

1. Open WebView (e.g., Kernel Monitor or Watch List)
2. Right-click in the WebView area
3. Select `Inspect` or use `Ctrl+Shift+I` to open Developer Tools
4. Use Console and Elements tabs to debug HTML/JavaScript

### Common Debug Scenarios

**Extension not activating**:

- Check `activationEvents` in `package.json`
- Verify Python file is open (extension activates on Python files)
- Check Output Channel for errors

**Kernel connection issues**:

- Verify ipykernel is installed: `python -m ipykernel --version`
- Check connection file exists in `/tmp/protium-kernels/`
- Look for ZeroMQ errors in Output Channel

**Results not displaying**:

- Verify Result Display Panel is open
- Check if active file matches the file where code was executed
- Inspect WebView Developer Tools for JavaScript errors

## Common Development Tasks

### Adding a New Command

1. **Define command in `package.json`**:

```json
{
  "command": "protium.myNewCommand",
  "title": "My New Command",
  "category": "Protium"
}
```

2. **Register command in `src/extension.ts`**:

```typescript
const myNewCmd = vscode.commands.registerCommand("protium.myNewCommand", () =>
  executionManager.myNewCommand(),
);

context.subscriptions.push(myNewCmd);
```

3. **Implement in appropriate manager** (e.g., `ExecutionManager`)

4. **Add keybinding** (optional) in `package.json` under `"keybindings"`

### Updating WebView HTML

1. Navigate to `src/templates/<view-name>/`
2. Edit HTML template files
3. Rebuild: `npm run compile`
4. Templates are copied to `out/templates/` during build
5. Reload Extension Development Host to see changes

### Adding Support for New MIME Types

1. **Update renderer in `src/utils/result-renderer.ts`**:

```typescript
export function renderResultAsHtml(
  mimeData: Record<string, any>,
): string | null {
  // Add new MIME type handling
  if (mimeData["application/custom"]) {
    return renderCustomType(mimeData["application/custom"]);
  }
  // ... existing handlers
}
```

2. **Add corresponding CSS** in result display template if needed

### Modifying Kernel Behavior

- **Kernel startup**: `src/kernel/direct/direct-kernel-provider.ts`
- **Execution logic**: `src/kernel/kernel-manager.ts`
- **Connection handling**: `src/kernel/direct/direct-kernel-connection.ts`

## Build and Release

### Pre-release Checklist

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run compile`
- [ ] Manual testing in Extension Development Host
- [ ] Update `CHANGELOG.md` with changes
- [ ] Update version in `package.json`

### Building VSIX Package

```bash
# Install vsce if not already installed
npm install -g @vscode/vsce

# Package the extension
vsce package

# This creates protium-<version>.vsix
```

### Installing VSIX Locally

```bash
code --install-extension protium-<version>.vsix
```

## Troubleshooting

### Build Errors

**TypeScript compilation errors**:

- Run `npm run clean` and `npm run compile`
- Check for type errors in the error output
- Verify all imports are correct

**Missing dependencies**:

- Delete `node_modules/` and `package-lock.json`
- Run `npm install` again

### ZeroMQ Issues

**Build failures on ZeroMQ**:

- ZeroMQ requires native compilation
- Ensure build tools are installed:
  - **Linux**: `sudo apt-get install build-essential`
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools

**Runtime errors**:

- Check if ZeroMQ library is loaded correctly
- Verify kernel connection file has correct ports
- Check firewall settings (should allow localhost connections)

### Extension Host Errors

**Extension fails to activate**:

- Check Output Channel for activation errors
- Verify `extension.ts` exports `activate()` function
- Check `package.json` for correct `main` entry point

**Commands not showing up**:

- Verify command is registered in `package.json` under `"contributes.commands"`
- Check if command is properly registered in `extension.ts`
- Reload VS Code window

### WebView Issues

**WebView not displaying**:

- Check if WebView provider is registered in `extension.ts`
- Verify WebView view ID matches between code and `package.json`
- Open Developer Tools to check for JavaScript errors

**WebView not updating**:

- Ensure `postMessage()` is called correctly
- Check message listener in WebView JavaScript
- Verify HTML template is copied to `out/templates/`

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Jupyter Protocol](https://jupyter-client.readthedocs.io/en/stable/messaging.html)
- [ZeroMQ Guide](https://zeromq.org/get-started/)
