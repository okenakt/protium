import { v4 as uuidv4 } from "uuid";
import { WatchExpression } from "../types/watch";
import { logInfo } from "../utils";

/**
 * Manages watch expressions and their evaluation state
 */
export class WatchListManager {
  private watches: Map<string, WatchExpression> = new Map();
  private onUpdateCallbacks: Array<(watches: WatchExpression[]) => void> = [];
  private lastActiveFileUri: string | undefined;

  /**
   * Adds a new watch expression
   * @param expression Python expression to watch
   * @param filePath File path where the watch was created
   * @returns The created watch expression
   */
  public addWatch(expression: string, filePath: string): WatchExpression {
    const watch: WatchExpression = {
      id: uuidv4(),
      expression,
      filePath,
    };

    this.watches.set(watch.id, watch);
    logInfo(`Watch added: ${expression} (${watch.id}) for file: ${filePath}`);
    this.notifyUpdate();

    return watch;
  }

  /**
   * Removes a watch expression by ID
   * @param id Watch expression ID
   */
  public removeWatch(id: string): void {
    if (this.watches.delete(id)) {
      logInfo(`Watch removed: ${id}`);
      this.notifyUpdate();
    }
  }

  /**
   * Updates the value of a watch expression
   * @param id Watch expression ID
   * @param value Evaluated value
   * @param mimeData MIME data from execution result
   * @param error Error message if evaluation failed
   */
  public updateWatchValue(
    id: string,
    value?: string,
    mimeData?: Record<string, string>,
    error?: string,
  ): void {
    const watch = this.watches.get(id);
    if (watch) {
      watch.value = value;
      watch.mimeData = mimeData;
      watch.error = error;
      watch.lastEvaluated = new Date();
      this.notifyUpdate();
    }
  }

  /**
   * Gets all watch expressions
   * @returns Array of all watch expressions
   */
  public getWatches(): WatchExpression[] {
    return Array.from(this.watches.values());
  }

  /**
   * Gets watch expressions for a specific file
   * @param filePath File path to filter by
   * @returns Array of watch expressions for the file
   */
  public getWatchesForFile(filePath: string): WatchExpression[] {
    return this.getWatches().filter((watch) => watch.filePath === filePath);
  }

  /**
   * Gets a watch expression by ID
   * @param id Watch expression ID
   * @returns The watch expression or undefined
   */
  public getWatch(id: string): WatchExpression | undefined {
    return this.watches.get(id);
  }

  /**
   * Clears all watch expressions
   */
  public clearAll(): void {
    this.watches.clear();
    logInfo("All watches cleared");
    this.notifyUpdate();
  }

  /**
   * Clears watch expressions for a specific file
   * @param filePath File path to clear watches for
   */
  public clearForFile(filePath: string): void {
    const toRemove = this.getWatchesForFile(filePath);
    toRemove.forEach((watch) => this.watches.delete(watch.id));
    if (toRemove.length > 0) {
      logInfo(`Cleared ${toRemove.length} watches for file: ${filePath}`);
      this.notifyUpdate();
    }
  }

  /**
   * Sets the last active file URI
   * @param fileUri File URI that was last active
   */
  public setLastActiveFile(fileUri: string): void {
    if (this.lastActiveFileUri !== fileUri) {
      this.lastActiveFileUri = fileUri;
      logInfo(`Last active file updated: ${fileUri}`);
      this.notifyUpdate();
    }
  }

  /**
   * Gets the last active file URI
   * @returns Last active file URI or undefined
   */
  public getLastActiveFile(): string | undefined {
    return this.lastActiveFileUri;
  }

  /**
   * Registers a callback for watch list updates
   * @param callback Function to call when watch list changes
   */
  public onUpdate(callback: (watches: WatchExpression[]) => void): void {
    this.onUpdateCallbacks.push(callback);
  }

  /**
   * Notifies all registered callbacks of a watch list update
   */
  private notifyUpdate(): void {
    const watches = this.getWatches();
    this.onUpdateCallbacks.forEach((callback) => callback(watches));
  }
}
