import { store } from "../core/state-store.js";
import { notifications } from "../core/notifications.js";

export class TimelineInteractions {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.querySelector("#timelineTracks");

    this.timeline = options.timeline || null;
    this.clipManager = options.clipManager || null;
    this.snapping = options.snapping || null;

    this.drag = null;
    this.enabled = true;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    this.bind();
  }

  bind() {
    if (!this.container) return;

    this.container.addEventListener(
      "pointerdown",
      this.onPointerDown
    );

    window.addEventListener(
      "pointermove",
      this.onPointerMove
    );

    window.addEventListener(
      "pointerup",
      this.onPointerUp
    );

    window.addEventListener(
      "pointercancel",
      this.onPointerUp
    );
  }

  onPointerDown(event) {
    if (!this.enabled || event.button !== 0) return;

    const clipElement = event.target.closest(
      "[data-clip-id]"
    );

    if (!clipElement || !this.container.contains(clipElement)) {
      return;
    }

    const clipId = clipElement.dataset.clipId;
    const trackId = clipElement.dataset.trackId;

    const clip = this.findClip(clipId);

    if (!clip || clip.locked) return;

    const rect = clipElement.getBoundingClientRect();

    const edgeSize = 9;
    const pointerX = event.clientX - rect.left;

    let mode = "move";

    if (pointerX <= edgeSize) {
      mode = "trim-start";
    } else if (rect.width - pointerX <= edgeSize) {
      mode = "trim-end";
    }

    this.drag = {
      clipId,
      trackId,
      element: clipElement,
      mode,
      startX: event.clientX,
      originalStart: Number(clip.start || 0),
      originalEnd: Number(
        clip.end ?? clip.start + clip.duration
      ),
      originalDuration: Number(clip.duration || 0),
      pixelsPerSecond: this.getPixelsPerSecond(),
      moved: false
    };

    store.selectClip?.(clipId);

    this.container.setPointerCapture?.(event.pointerId);

    document.dispatchEvent(
      new CustomEvent("zerox:clip-selected", {
        detail: { clipId, trackId }
      })
    );

    event.preventDefault();
  }

  onPointerMove(event) {
    if (!this.drag || !this.enabled) return;

    const drag = this.drag;

    const deltaPixels = event.clientX - drag.startX;

    if (Math.abs(deltaPixels) < 2 && !drag.moved) return;

    drag.moved = true;

    const deltaTime =
      deltaPixels / Math.max(1, drag.pixelsPerSecond);

    let start = drag.originalStart;
    let end = drag.originalEnd;

    if (drag.mode === "move") {
      start += deltaTime;
      end += deltaTime;
    }

    if (drag.mode === "trim-start") {
      start += deltaTime;
      start = Math.min(start, end - 0.05);
    }

    if (drag.mode === "trim-end") {
      end += deltaTime;
      end = Math.max(end, start + 0.05);
    }

    if (drag.mode === "move") {
      const duration = end - start;
      start = this.snapTime(start, drag.clipId);
      end = start + duration;
    } else {
      start = Math.max(0, start);
      end = Math.max(start + 0.05, end);
    }

    drag.previewStart = start;
    drag.previewEnd = end;

    this.updateClipPreview(drag.element, start, end);
  }

  onPointerUp() {
    if (!this.drag) return;

    const drag = this.drag;
    this.drag = null;

    if (!drag.moved) return;

    const start = drag.previewStart;
    const end = drag.previewEnd;

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      this.restoreElement(drag);
      return;
    }

    try {
      if (!this.clipManager) {
        throw new Error("Clip manager is not connected.");
      }

      if (drag.mode === "move") {
        this.clipManager.moveClip(
          drag.clipId,
          start,
          drag.trackId
        );
      } else {
        this.clipManager.trimClip(
          drag.clipId,
          start,
          end
        );
      }

      document.dispatchEvent(
        new CustomEvent("zerox:timeline-clip-changed", {
          detail: {
            clipId: drag.clipId,
            start,
            end,
            mode: drag.mode
          }
        })
      );

    } catch (error) {
      this.restoreElement(drag);
      notifications.error(error.message);
    }
  }

  findClip(clipId) {
    const project = store.getState()?.project;

    for (const track of project?.tracks || []) {
      const clip = (track.clips || []).find(
        item => item.id === clipId
      );

      if (clip) return clip;
    }

    return null;
  }

  getPixelsPerSecond() {
    return this.timeline?.pixelsPerSecond || 80;
  }

  snapTime(time, clipId) {
    if (!this.snapping?.snap) {
      return Math.max(0, time);
    }

    const result = this.snapping.snap(time, {
      excludeClipId: clipId
    });

    return Math.max(
      0,
      Number(result?.time ?? result ?? time)
    );
  }

  updateClipPreview(element, start, end) {
    const scale = this.getPixelsPerSecond();

    element.style.left = `${start * scale}px`;
    element.style.width = `${Math.max(
      2,
      (end - start) * scale
    )}px`;
  }

  restoreElement(drag) {
    this.updateClipPreview(
      drag.element,
      drag.originalStart,
      drag.originalEnd
    );
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
  }

  destroy() {
    this.container?.removeEventListener(
      "pointerdown",
      this.onPointerDown
    );

    window.removeEventListener(
      "pointermove",
      this.onPointerMove
    );

    window.removeEventListener(
      "pointerup",
      this.onPointerUp
    );

    window.removeEventListener(
      "pointercancel",
      this.onPointerUp
    );
  }
}

export default TimelineInteractions;
