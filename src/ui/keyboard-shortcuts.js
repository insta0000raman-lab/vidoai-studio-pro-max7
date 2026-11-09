import { history } from "../core/history.js";
import { store } from "../core/state-store.js";
import { notifications } from "../core/notifications.js";

export class KeyboardShortcuts {
  constructor(options = {}) {
    this.playback = options.playback || null;
    this.timeline = options.timeline || null;
    this.clipManager = options.clipManager || null;

    this.enabled = true;
    this.handleKeyDown = this.handleKeyDown.bind(this);

    window.addEventListener("keydown", this.handleKeyDown);
  }

  isTyping(target) {
    if (!target) return false;

    const tag = target.tagName?.toLowerCase();

    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      target.isContentEditable
    );
  }

  async handleKeyDown(event) {
    if (!this.enabled || this.isTyping(event.target)) return;

    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;

    if (command && key === "z" && event.shiftKey) {
      event.preventDefault();
      this.redo();
      return;
    }

    if (command && key === "z") {
      event.preventDefault();
      this.undo();
      return;
    }

    if (command && key === "y") {
      event.preventDefault();
      this.redo();
      return;
    }

    if (command && key === "s") {
      event.preventDefault();
      this.save();
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      this.togglePlayback();
      return;
    }

    if (key === "arrowleft") {
      event.preventDefault();
      this.step(-1, event.shiftKey ? 10 : 1);
      return;
    }

    if (key === "arrowright") {
      event.preventDefault();
      this.step(1, event.shiftKey ? 10 : 1);
      return;
    }

    if (key === "delete" || key === "backspace") {
      this.deleteSelectedClip();
      return;
    }

    if (command && key === "d") {
      event.preventDefault();
      this.duplicateSelectedClip();
      return;
    }

    if (key === "escape") {
      this.cancelSelection();
    }
  }

  undo() {
    try {
      history.undo();
    } catch (error) {
      notifications.error(`Undo failed: ${error.message}`);
    }
  }

  redo() {
    try {
      history.redo();
    } catch (error) {
      notifications.error(`Redo failed: ${error.message}`);
    }
  }

  save() {
    document.dispatchEvent(
      new CustomEvent("zerox:save-request")
    );
  }

  togglePlayback() {
    if (!this.playback) {
      notifications.warning("Playback is not connected.");
      return;
    }

    try {
      if (store.getState()?.isPlaying) {
        this.playback.pause();
      } else {
        this.playback.play();
      }
    } catch (error) {
      notifications.error(error.message);
    }
  }

  step(direction, count) {
    if (!this.playback?.stepFrames) return;

    const amount = direction * count;

    this.playback.stepFrames(amount);
  }

  deleteSelectedClip() {
    const selectedId = store.getState()?.selectedClipId;

    if (!selectedId || !this.clipManager) return;

    this.clipManager.removeClip(selectedId);
  }

  duplicateSelectedClip() {
    const selectedId = store.getState()?.selectedClipId;

    if (!selectedId || !this.clipManager) return;

    this.clipManager.duplicateClip(selectedId);
  }

  cancelSelection() {
    store.update({
      selectedClipId: null,
      selectedTrackId: null
    });
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
  }

  destroy() {
    window.removeEventListener(
      "keydown",
      this.handleKeyDown
    );
  }
}

export default KeyboardShortcuts;
