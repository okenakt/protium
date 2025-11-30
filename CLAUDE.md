# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Protium is a VS Code extension that provides an interactive Python environment with flexible execution. It enables REPL-like functionality within Python files, similar to Jupyter notebooks but integrated into regular .py files.

Key distinguishing features:
- Direct kernel connection via ZeroMQ (no Jupyter server)
- Callback-based, non-blocking execution with streaming support
- Two-level result storage: `Map<fileUri, Map<Range, HTML>>`
- Session-per-file model with optional kernel sharing

## Documentation

**IMPORTANT**: Read these docs before making architectural changes:
- **[Design Document](docs/design.md)**: System architecture, component responsibilities, and design philosophy
- **[Features Specification](docs/features.md)**: Detailed feature requirements and specifications
- **[Development Guide](docs/development.md)**: Setup, coding conventions, testing, and debugging

## Common Commands

```bash
# Development
npm run compile              # Build with TypeScript to out/ (includes template copy)
npm run watch                # Watch mode with esbuild (auto-rebuild on changes)
npm run clean                # Remove build artifacts from dist/
npm run lint                 # Run ESLint
npm run check-types          # Type check without emitting files

# Testing
npm test                     # Compile and run tests

# Packaging
npm run package              # Build with esbuild to dist/ (production mode, minified)
npm run vscode:prepublish    # Pre-publish build (runs package)
npx @vscode/vsce package     # Create .vsix package for distribution

# Development Host
# Press F5 in VS Code to launch Extension Development Host with production build
```

**Notes**:
- **Development (tsc)**: Compiles to `out/`, templates: `out/templates/`
- **Production (esbuild)**: Bundles to `dist/extension.js`, templates: `dist/templates/`
- Tests are compiled with TypeScript to `out/test/` directory
- Production build reduces package size from ~40MB to ~4MB (90% reduction)
- **esbuild**: Fast TypeScript bundler (10-100x faster than webpack)
- **Type checking**: esbuild doesn't type check; use `npm run check-types` or tests
- Template path resolution: `path.join(__dirname, "templates")` works for both builds

## Architecture Overview

### Component Hierarchy

```
ExecutionManager (orchestrator)
├── KernelManager
│   └── DirectKernelProvider → IPython kernel processes
├── ResultDisplayManager (two-level map: fileUri → Range → HTML)
├── WatchListManager
└── BlockDetector
```

### Critical Design Patterns

1. **Session Management**: `ExecutionManager.sessions` maps `fileUri -> kernelId`
   - Default: One kernel per file
   - Users can explicitly share kernels via "Connect to Existing Kernel"
   - Shutting down a kernel removes all associated sessions

2. **Non-blocking Execution**: `KernelManager.requestExecution()` uses callbacks
   - `onStream`: Real-time intermediate results
   - `onComplete`: Final result
   - Kernels process requests serially (no concurrent execution)

3. **Result Storage**: Two-level Map in `ResultDisplayManager`
   - Structure: `Map<fileUri, Map<Range, HTML>>`
   - First level: file URI
   - Second level: code range
   - Re-executing same range overwrites previous result
   - Results persist when switching files or closing panel
   - Only updates display for active file (non-active results stored only)

4. **WebView Communication**: Bidirectional messaging
   - Extension → WebView: `postMessage()`
   - WebView → Extension: Message handlers in provider classes

5. **Logging**: Centralized via `src/utils/output-logger.ts`
   - Use `logInfo`, `logWarn`, `logError`, `logDebug`
   - **Never** use `console.log` in production code

6. **Watch Expression Evaluation**:
   - Triggered after successful code execution only
   - Uses `storeHistory=false` to avoid incrementing execution count
   - No streaming support (serial kernel processing)
   - Continues evaluating even if individual watches fail

7. **Kernel Port Allocation**: DirectKernelProvider dynamically allocates 5 consecutive ports
   - Shell, IOPub, Control, Stdin, Heartbeat sockets
   - Connection info stored in `/tmp/protium-kernels/`
   - Kernel ID preserved during restart

## Execution Flow

### Code Execution Sequence
1. User triggers execution (Shift+Enter or Ctrl+Enter)
2. ExecutionManager → BlockDetector: Detect code block or use selection
3. ExecutionManager → ResultDisplayManager: Display loading animation
4. ExecutionManager → KernelManager: Request execution with callbacks
5. KernelManager → DirectKernelConnection: Send via ZeroMQ
6. During execution:
   - `onStream` callback: Updates display with intermediate results
   - `onComplete` callback: Final result displayed
7. If successful: ExecutionManager → WatchListManager: Auto-evaluate watches

### Session Management Flow
- On first execution: Create new kernel for file
- "Connect to Existing Kernel": Share kernel across multiple files
- On kernel shutdown: Remove all associated file sessions

### Block Detection Priority
1. If text is selected: Execute selection
2. Else: Detect block based on cursor position
3. Check for structure start (function, class, if, try, etc.)
4. Group based on indentation and continuation keywords
5. Include decorators with function/class definitions

## Key Files and Directories

- `src/extension.ts`: Activation, component initialization, command registration
- `src/execution/execution-manager.ts`: Orchestrates execution flow, coordinates all managers
- `src/execution/block-detector.ts`: Python code block detection logic
- `src/kernel/kernel-manager.ts`: Kernel lifecycle, execution requests
- `src/kernel/direct/`: DirectKernelProvider and DirectKernelConnection (ZeroMQ)
- `src/result-display/`: Result panel WebView provider
- `src/watch-list/`: Watch expression management and WebView
- `src/kernel-monitor/`: Kernel status monitoring WebView
- `src/templates/`: HTML templates (copied to `out/templates/` or `dist/templates/` during build)
- `src/utils/html-utils.ts`: Template loading using `__dirname`-based resolution
- `src/utils/output-logger.ts`: Centralized logging
- `src/interpreter/`: Python environment detection and integration
- `out/`: Development build (tsc) - preserves directory structure
- `dist/`: Production build (esbuild) - single bundled extension.js file
- `esbuild.js`: esbuild configuration and build script

## Code Style & Conventions

See [Development Guide](docs/development.md) for full details.

**File Naming**: kebab-case (e.g., `execution-manager.ts`)

**JSDoc**: Required for all exports
```typescript
/**
 * Brief one-sentence summary
 * @param paramName Description
 * @returns Description
 */
```

**Prettier**: Auto-formats with import organization (configured in `package.json`)

**TypeScript**: Strict mode enabled, avoid `any` type

**Error Handling**:
- Always try-catch operations that can fail
- Show user-friendly messages via `vscode.window.showErrorMessage()`
- Log details via `logError()`
- Clean up resources in finally blocks

**Result Rendering**:
- Supported MIME types: `text/plain`, `text/html`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/json`
- Custom renderers in `src/utils/result-renderer.ts`
- Images displayed as base64-encoded inline data
- Matplotlib/Seaborn plots rendered as images
- Pandas DataFrames rendered as HTML tables

## Dependencies and Build Requirements

**Native Dependencies**:
- ZeroMQ (`zeromq` npm package) requires native compilation
- Build tools needed:
  - **Linux**: `build-essential` package
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools
- If ZeroMQ build fails, extension cannot communicate with kernels

**Python Dependencies**:
- `ipykernel` required in Python environment
- Extension auto-prompts installation if missing
- Supports all Python environment types (venv, conda, poetry, etc.)

## Common Pitfalls

1. **Templates not updating**: Run `npm run compile` (tsc) or `npm run package` (esbuild) to copy templates
2. **Code changes not reflected in F5 test**: Run `npm run package` to rebuild esbuild bundle
3. **Type errors not caught**: esbuild doesn't type check - run `npm run check-types` or `npm test`
4. **Result display issues**:
   - Check if `fileUri` matches active editor
   - Results only update display for active file
   - Verify Result Display Panel is open
5. **Kernel connection failures**:
   - Verify ipykernel is installed: `python -m ipykernel --version`
   - Check connection files in `/tmp/protium-kernels/`
   - Look for ZeroMQ errors in Output Channel
   - Monitor kernel process: `ps aux | grep ipykernel`
   - Check firewall settings (should allow localhost connections)
6. **WebView debugging**: Right-click WebView → Inspect to open Developer Tools
7. **Extension not activating**: Only activates when Python file (`.py`) is open
8. **Watch expressions**:
   - Evaluated with `storeHistory=false` (doesn't increment execution count)
   - Only auto-evaluates after successful code execution
   - File must be connected to a kernel
9. **ZeroMQ build failures**: Ensure native build tools are installed before `npm install`
10. **esbuild bundling issues**:
   - ZeroMQ is externalized (not bundled) as it's a native module
   - Check `esbuild.js` externals array if adding new native dependencies
