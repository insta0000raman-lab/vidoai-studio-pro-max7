import { history } from "../core/history.js";
import { eventBus } from "../core/event-bus.js";
import { store } from "../core/state-store.js";
import { clipManager } from "../timeline/clips.js";
import { playhead } from "../timeline/playhead.js";
import { timelineManager } from "../timeline/timeline.js";

export class ShortcutManager {
  constructor(options = {}) {
    this.enabled = true;
    this.shortcuts = new Map();
    this.target = options.target || document;
    this.handleKeydown = this.handleKeydown.bind(this);
    this.registerDefaults();
  }

  init() {
    this.target.addEventListener(
      "keydown",
      this.handleKeydown
    );

    return this;
  }

  register(keys, callback, description = "") {
    const normalized = this.normalize(keys);

    this.shortcuts.set(normalized, {
      callback,
      description
    });

    return this;
  }

  unregister(keys) {
    return this.shortcuts.delete(this.normalize(keys));
  }

  normalize(keys) {
    return String(keys)
      .toLowerCase()
      .split("+")
      .map(key => key.trim())
      .sort()
      .join("+");
  }

  getPressedKeys(event) {
    const keys = [];

    if (event.ctrlKey || event.metaKey) {
      keys.push("ctrl");
    }

    if (event.altKey) keys.push("alt");
    if (event.shiftKey) keys.push("shift");

    keys.push(event.key.toLowerCase());

    return keys.sort().join("+");
  }

  isTypingTarget(target) {
    if (!target) return false;

    return Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true']"
      )
    );
  }

  handleKeydown(event) {
    if (!this.enabled || this.isTypingTarget(event.target)) {
      return;
    }

    const key = this.getPressedKeys(event);
    const shortcut = this.shortcuts.get(key);

    if (!shortcut) return;

    event.preventDefault();

    try {
      shortcut.callback(event);
      eventBus.emit("SHORTCUT_EXECUTED", {
        key,
        description: shortcut.description
      });
    } catch (error) {
      console.error("Shortcut failed:", error);
      eventBus.emit("SHORTCUT_ERROR", {
        key,
        message: error.message
      });
    }
  }

  registerDefaults() {
    this.register("ctrl+z", () => {
      history.undo();
    }, "Undo");

    this.register("ctrl+y", () => {
      history.redo();
    }, "Redo");

    this.register("ctrl+shift+z", () => {
      history.redo();
    }, "Redo");

    this.register("space", () => {
      const playing = store.getState().isPlaying;

      if (playing) {
        playhead.pause();
      } else {
        playhead.play();
      }
    }, "Play / Pause");

    this.register("delete", () => {
      const selected = store.getState().selectedClipId;

      if (selected) {
        clipManager.removeClip(selected);
      }
    }, "Delete selected clip");

    this.register("backspace", () => {
      const selected = store.getState().selectedClipId;

      if (selected) {
        clipManager.removeClip(selected);
      }
    }, "Delete selected clip");

    this.register("left", () => {
      playhead.stepFrames(-1);
    }, "Previous frame");

    this.register("right", () => {
      playhead.stepFrames(1);
    }, "Next frame");

    this.register("shift+left", () => {
      playhead.stepFrames(-10);
    }, "Back ten frames");

    this.register("shift+right", () => {
      playhead.stepFrames(10);
    }, "Forward ten frames");

    this.register("ctrl+plus", () => {
      timelineManager.zoomIn();
    }, "Zoom timeline in");

    this.register("ctrl+minus", () => {
      timelineManager.zoomOut();
    }, "Zoom timeline out");

    this.register("ctrl+s", () => {
      eventBus.emit("PROJECT_SAVE_REQUESTED");
    }, "Save project");

    this.register("escape", () => {
      store.set("selectedClipId", null);
      eventBus.emit("SELECTION_CLEARED");
    }, "Clear selection");

    this.register("home", () => {
      playhead.seek(0);
    }, "Go to beginning");

    this.register("end", () => {
      const project = store.getState().project;
      playhead.seek(project?.duration || 0);
    }, "Go to end");
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  getAll() {
    return [...this.shortcuts.entries()].map(
      ([keys, item]) => ({
        keys,
        description: item.description
      })
    );
  }

  destroy() {
    this.target.removeEventListener(
      "keydown",
      this.handleKeydown
    );

    this.shortcuts.clear();
  }
}

export const shortcutManager = new ShortcutManager();
