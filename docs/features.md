# Features Specification

## Core Features

### 1. Interactive Code Execution

#### 1.1 Execute and Move Next (Shift+Enter)

**Description**: Execute the code block at the cursor position and move the cursor to the next line

**Requirements**:

- Automatically detect the code block at the cursor position
- Execute the selected range if there is a selection
- After execution completes, move the cursor to the next line after the block end
- Only active in Python files (`.py`)
- Key binding: `Shift+Enter`

**Examples**:

```python
# If the cursor is on this line, only this line is executed
x = 10

# If the cursor is in this block, the entire block is executed
def greet(name):
    message = f"Hello, {name}"
    return message

# Multiple lines can be selected and executed
y = 20
z = 30
```

#### 1.2 Execute in Place (Ctrl+Enter)

**Description**: Execute the code block at the cursor position and keep the cursor in place

**Requirements**:

- Same execution logic as Execute and Move Next
- Does not change the cursor position
- Convenient for executing the same code multiple times
- Key binding: `Ctrl+Enter`

**Use Cases**:

- Execute the same cell multiple times for testing
- Iterative execution while changing parameters
- Repeatedly execute the same code during debugging

### 2. Code Block Detection

#### 2.1 Smart Block Detection

**Description**: Automatically detect code blocks based on Python syntax and indentation

**Supported Structures**:

- Single-line statements
- Function definitions (including decorators)
- Class definitions (including decorators)
- Control structures:
  - `if`/`elif`/`else` groups
  - `for` loops
  - `while` loops
  - `try`/`except`/`else`/`finally` groups
  - `with` statements
  - `match`/`case` groups (Python 3.10+)
- Async syntax (`async def`, `async for`, `async with`)

**Detection Rules**:

1. Check if cursor line is the start of a structure
2. Set the indentation level of the start line as the baseline
3. Deeper indentation is within the same block
4. Same indentation with continuation keywords (`elif`, `except`, etc.) is the same block
5. Block ends when indentation becomes shallower
6. Skip blank lines and comments, but include them within blocks

**Example**:

```python
# If cursor is on def line, select entire function from @decorator
@decorator
def complex_function(x):
    if x > 0:
        return x * 2
    else:
        return 0
# ← Block ends

# If cursor is on try line, select entire try/except/finally
try:
    risky_operation()
except ValueError:
    handle_error()
finally:
    cleanup()
# ← Block ends
```

#### 2.2 Selection Override

**Description**: Override automatic detection when there is a selection range

**Requirements**:

- If the user explicitly selects code, execute that range
- Support execution of multiple functions or partial code
- Use block detection only when the selection range is empty

### 3. Kernel Management

#### 3.1 Automatic Kernel Startup

**Description**: Automatically start a kernel when executing code

**Requirements**:

- Start a new kernel on first execution for each file
- Suggest automatic installation if ipykernel is not installed
- Display loading indicator while kernel is starting
- Display clear error messages when startup fails

**Workflow**:

1. User requests code execution
2. Check for kernel associated with the file
3. If no kernel exists:
   - Detect Python environment
   - Check for ipykernel availability
   - Suggest installation if needed
   - Start kernel process
   - Establish connection (timeout: 5 seconds)
4. Begin execution when kernel becomes available

#### 3.2 Connect to Existing Kernel

**Description**: Connect the current file to an existing kernel

**Requirements**:

- Command: `Protium: Connect to Existing Kernel`
- Display list of active kernels
- Display connection file information for each kernel
- Connect the current file to the selected kernel
- Used for sharing variables across multiple files

**Use Cases**:

- Share the same variable namespace across multiple Python files
- Access main script variables from auxiliary scripts
- Test without reloading modules

#### 3.3 Kernel Operations

**Description**: Kernel control operations

**3.3.1 Interrupt Execution**

- Command: `Protium: Interrupt Execution`
- Key binding: `Ctrl+Shift+C`
- Interrupt currently executing code
- Kernel is not restarted, state is preserved

**3.3.2 Restart Kernel**

- Command: `Protium: Restart Kernel`
- Restart kernel process
- All variables and imports are cleared
- Maintains the same kernel ID (session maintained)

**3.3.3 Shutdown Kernel**

- Command: `Protium: Shutdown Kernel`
- Completely terminate kernel process
- Delete all associated file sessions
- Clean up resources

#### 3.4 Kernel Monitor

**Description**: Monitor the state of active kernels

**Display Information**:

- Kernel name (display name of Python environment)
- Kernel status (idle, busy, starting, restarting, dead)
- Execution count (number of executed code cells)
- Connected files (list of files using this kernel)

**Actions**:

- Interrupt: Interrupt kernel execution
- Restart: Restart kernel
- Shutdown: Shutdown kernel

**Location**: WebView in the Panel area

### 4. Result Display

#### 4.1 Result Display Panel

**Description**: Display code execution results in a dedicated panel

**Requirements**:

- Display executed code range (line numbers)
- Results are appended in execution order
- Automatically restore file results when switching files
- Results are preserved even when panel is closed

**Display Format**:

```
[Lines 10-15]
Execution result content...

[Lines 20-25]
Another execution result...
```

#### 4.2 Streaming Output

**Description**: Display intermediate results in real-time during long-running execution

**Requirements**:

- `print()` output is displayed immediately
- Output within loops is displayed sequentially
- Update output with final result

**Example**:

```python
for i in range(10):
    print(f"Processing {i}")  # Each line is displayed immediately
    time.sleep(1)
```

#### 4.3 Loading Animation

**Description**: Display loading animation when code execution starts

**Requirements**:

- Display animation immediately after execution starts
- Replace with result when first output arrives
- Provide feedback to user

#### 4.4 Rich MIME Display

**Description**: Rendering of rich MIME types

**Supported Types**:

- `text/plain`: Plain text (default)
- `text/html`: HTML (displayed as-is)
- `image/png`: PNG image (base64 decoded)
- `image/jpeg`: JPEG image
- `image/svg+xml`: SVG image
- `application/json`: JSON (formatted display)

**Use Cases**:

- Display Matplotlib/Seaborn plots
- Display Pandas DataFrame HTML tables
- Various IPython.display outputs

**Example**:

```python
import matplotlib.pyplot as plt
plt.plot([1, 2, 3, 4])
plt.show()  # Displayed as image in result panel
```

#### 4.5 Error Display

**Description**: Display error messages and tracebacks in a readable format

**Requirements**:

- Highlight error messages in red
- Format tracebacks for display
- Also display standard output (`print()`, etc.) if present
- Remove ANSI color codes for display

#### 4.6 Clear Results

**Description**: Clear execution results for the current file

**Requirements**:

- Command: `Protium: Clear Results`
- Key binding: `Ctrl+Backspace`
- Clear only the results of the current active file
- Does not affect kernel state (variables are preserved)

#### 4.7 Result Display Configuration

**Description**: Configuration for result display

**Settings**:

- `protium.resultDisplay.maxLines`: Maximum number of lines to display in result block
  - Default: 20
  - Range: 1-1000
  - Automatically trim long output

### 5. Watch List

#### 5.1 Watch Expressions

**Description**: Monitor Python expressions similar to debugger watch expressions

**Requirements**:

- Manage watch expressions per file
- Automatically evaluate watch expressions after successful code execution
- Display evaluation results and timestamps
- Display error messages when errors occur

**Use Cases**:

- Continuously monitor variable values
- Verify results of complex expressions
- Monitor dataframe shape and size

**Example Watch Expressions**:

```
x
len(data)
df.shape
np.mean(values)
type(result)
```

#### 5.2 Watch List View

**Description**: Sidebar view for managing watch expressions

**Display Information**:

- Expression name
- Evaluation result
- Last evaluation time
- Error (when evaluation fails)

**Actions**:

- Add Watch: Add a new watch expression
- Remove Watch: Delete a watch expression
- Refresh Watch: Re-evaluate a specific watch expression
- Refresh All: Re-evaluate all watch expressions
- Clear All: Clear all watch expressions

**Location**: WebView in the Activity Bar

#### 5.3 Auto-evaluation

**Description**: Automatically evaluate watch expressions after successful code execution

**Requirements**:

- Only when main code execution is `status: ok`
- Evaluate only watch expressions related to the current file
- Evaluation runs with `storeHistory=false` (does not increment execution count)
- Continue evaluating other watch expressions even if errors occur

**Workflow**:

1. User executes code
2. Execution succeeds
3. ExecutionManager notifies WatchListManager with file URI
4. Evaluate all watch expressions for that file
5. Display results in Watch List View

#### 5.4 Watch Expression Scope

**Description**: Watch expressions are evaluated in the kernel associated with the file

**Requirements**:

- Watch expressions are bound to files
- The file must be connected to a kernel
- Display error message if no kernel exists
- Display watch expressions for that file when switching files

### 6. Python Environment Integration

#### 6.1 Python Environment Detection

**Description**: Integrate with VS Code Python extension to detect Python environment

**Requirements**:

- Automatically detect active Python interpreter
- Support virtual environments (venv, conda, poetry, etc.)
- Warn if Python extension is not installed
- Prompt to select interpreter if not configured

#### 6.2 IPykernel Auto-installation

**Description**: Suggest automatic installation if ipykernel is not installed

**Workflow**:

1. Check for ipykernel presence when starting kernel
2. Display installation dialog if not present
3. Execute `pip install ipykernel` when user approves
4. Continue kernel startup after successful installation
5. Display manual installation instructions if failed

**Error Handling**:

- Display manual installation instructions if pip is not available
- Display progress indicator during installation
- Automatically verify after installation completes

### 7. File Context Management

#### 7.1 File Switching

**Description**: Automatic context update when switching files

**Requirements**:

- Automatically detect when active editor changes
- Enable Protium only for Python files
- Switch result panel to that file's results
- Switch watch list to that file's watch expressions
- Update `protium.active` context (enable key bindings)

#### 7.2 Multi-file Support

**Description**: Support multiple Python files simultaneously

**Requirements**:

- Each file has independent result history
- Each file has its own watch expression list
- By default, each file has its own kernel
- Can be explicitly shared with "Connect to Existing Kernel"

### 8. Commands

#### 8.1 Execution Commands

- `protium.executeAndMoveNext`: Execute Code and Move Next (Shift+Enter)
- `protium.executeInPlace`: Execute Code in Place (Ctrl+Enter)
- `protium.interruptExecution`: Interrupt Execution (Ctrl+Shift+C)
- `protium.clearResults`: Clear Results (Ctrl+Backspace)

#### 8.2 Kernel Commands

- `protium.connectToExistingKernel`: Connect to Existing Kernel
- `protium.restartKernel`: Restart Kernel
- `protium.shutdownKernel`: Shutdown Kernel

#### 8.3 View Commands

- `protium.showKernelMonitor`: Show Kernel Monitor
- `protium.showWatchList`: Show Watch List

### 9. Configuration

#### 9.1 Extension Settings

- `protium.resultDisplay.maxLines`:
  - Description: Maximum number of lines to display in result block
  - Type: number
  - Default: 20
  - Range: 1-1000
