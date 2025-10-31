# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Protium is a VS Code extension that provides an interactive Python environment with flexible execution. It enables REPL-like functionality within Python files, similar to Jupyter notebooks but integrated into regular .py files.

## Documentation

- **[Design Document](docs/design.md)**: System architecture, component responsibilities, and design philosophy
- **[Features Specification](docs/features.md)**: Detailed feature requirements and specifications
- **[Development Guide](docs/development.md)**: Setup, coding conventions, testing, and debugging

## Common Commands

See [Development Guide](docs/development.md) for detailed instructions.

```bash
npm run compile    # Build the extension
npm run watch      # Watch mode for development
npm run lint       # Run linting
npm test          # Run tests
```

Press F5 to launch Extension Development Host with the extension loaded.

## Quick Reference

### Key Components

See [Design Document](docs/design.md) for detailed architecture.

- **ExecutionManager**: Orchestrates code execution and coordinates all managers
- **KernelManager**: Manages Jupyter kernel lifecycle and execution requests
- **DirectKernelProvider**: Starts local IPython kernels via ZeroMQ
- **BlockDetector**: Detects Python code blocks based on cursor position
- **ResultDisplayManager**: Handles result display and persistence
- **WatchListManager**: Manages watch expressions similar to debugger

### Important Patterns

- **Session Management**: `ExecutionManager.sessions` maps `fileUri -> kernelId`
- **Result Storage**: Two-level map `fileUri -> Range -> HTML`
- **Execution**: Non-blocking with callbacks (`onComplete`, `onStream`)
- **Kernel Communication**: Direct ZeroMQ, no Jupyter server required

## File Structure

- `src/extension.ts`: Extension entry point
- `src/execution/`: Code execution and block detection
- `src/kernel/`: Kernel management and ZeroMQ connection
- `src/result-display/`: Result panel rendering
- `src/watch-list/`: Watch expression management
- `src/interpreter/`: Python environment detection
- `src/templates/`: HTML templates for WebViews
- `src/types/`: TypeScript type definitions

## Code Style

See [Development Guide](docs/development.md) for detailed conventions.

- TypeScript strict mode
- JSDoc: One sentence summary + `@param` + `@returns`
- kebab-case file names
- Centralized logging via `src/utils/output-logger.ts`
