/* ZERO X MOTION — UNDO / REDO HISTORY */

import { eventBus } from "./event-bus.js";
import { APP_EVENTS, APP_CONFIG } from "../config.js";

function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

class HistoryManager {
  constructor(limit = APP_CONFIG.timeline.maximumUndoSteps) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.isRestoring = false;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get undoCount() {
    return this.undoStack.length;
  }

  get redoCount() {
    return this.redoStack.length;
  }

  execute(action) {
    if (!action || typeof action !== "object") {
      throw new TypeError("A valid history action is required.");
    }

    if (
      typeof action.undo !== "function" ||
      typeof action.redo !== "function"
    ) {
      throw new TypeError(
        "Every action must provide undo() and redo() functions."
      );
    }

    if (this.isRestoring) {
      action.redo();
      return;
    }

    action.redo();

    this.undoStack.push({
      label: action.label || "Edit",
      undo: action.undo,
      redo: action.redo,
      timestamp: Date.now()
    });

    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }

    this.redoStack = [];
    this.emitChange();
  }

  undo() {
    if (!this.canUndo) return false;

    const action = this.undoStack.pop();

    try {
      this.isRestoring = true;
      action.undo();

      this.redoStack.push(action);
      this.emitChange();

      return true;
    } catch (error) {
      this.undoStack.push(action);
      console.error("[ZERO X MOTION] Undo failed:", error);
      return false;
    } finally {
      this.isRestoring = false;
    }
  }

  redo() {
    if (!this.canRedo) return false;

    const action = this.redoStack.pop();

    try {
      this.isRestoring = true;
      action.redo();

      this.undoStack.push(action);
      this.emitChange();

      return true;
    } catch (error) {
      this.redoStack.push(action);
      console.error("[ZERO X MOTION] Redo failed:", error);
      return false;
    } finally {
      this.isRestoring = false;
    }
  }

  pushSnapshot(label, before, after, restore) {
    if (typeof restore !== "function") {
      throw new TypeError("Snapshot restore function is required.");
    }

    const previous = deepClone(before);
    const next = deepClone(after);

    this.execute({
      label: label || "Change",
      undo: () => restore(deepClone(previous)),
      redo: () => restore(deepClone(next))
    });
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.emitChange();
  }

  emitChange() {
    eventBus.emit(APP_EVENTS.HISTORY_CHANGED, {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoCount: this.undoCount,
      redoCount: this.redoCount,
      lastUndo: this.undoStack.at(-1)?.label || null,
      lastRedo: this.redoStack.at(-1)?.label || null
    });
  }

  getStatus() {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoCount: this.undoCount,
      redoCount: this.redoCount
    };
  }
}

export const history = new HistoryManager();

export default history;
