import { createId } from "../project/schema.js";
import { eventBus } from "../core/event-bus.js";
import { store } from "../core/state-store.js";

const ANIMATABLE_PROPERTIES = [
  "positionX",
  "positionY",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
  "anchorX",
  "anchorY",
  "volume",
  "brightness",
  "contrast",
  "saturation",
  "blur",
  "glow",
  "fontSize"
];

class KeyframeManager {
  constructor() {
    this.clipboards = new Map();
    this.selectedKeyframes = new Set();
  }

  getProject() {
    return store.getState()?.project || null;
  }

  getClip(clipId) {
    const project = this.getProject();
    if (!project) return null;

    for (const track of project.tracks || []) {
      const clip = (track.clips || []).find(
        item => item.id === clipId
      );

      if (clip) return clip;
    }

    return null;
  }

  ensureAnimation(clip) {
    if (!clip.animation) {
      clip.animation = {
        keyframes: []
      };
    }

    if (!Array.isArray(clip.animation.keyframes)) {
      clip.animation.keyframes = [];
    }

    return clip.animation.keyframes;
  }

  isAnimatable(property) {
    return ANIMATABLE_PROPERTIES.includes(property);
  }

  add(clipId, property, time, value, options = {}) {
    const clip = this.getClip(clipId);

    if (!clip) {
      throw new Error("Clip not found");
    }

    if (!this.isAnimatable(property)) {
      throw new Error(`Unsupported property: ${property}`);
    }

    const keyframes = this.ensureAnimation(clip);
    const localTime = Math.max(0, Number(time) || 0);

    const existing = keyframes.find(frame =>
      frame.property === property &&
      Math.abs(frame.time - localTime) < 0.000001
    );

    if (existing) {
      existing.value = value;
      existing.easing = options.easing || existing.easing || "linear";
      existing.id = existing.id || createId("key");
      this.emit("updated", existing, clipId);
      return existing;
    }

    const keyframe = {
      id: createId("key"),
      property,
      time: localTime,
      value,
      easing: options.easing || "linear",
      interpolation: options.interpolation || "bezier",
      inHandle: options.inHandle || null,
      outHandle: options.outHandle || null,
      enabled: true
    };

    keyframes.push(keyframe);
    keyframes.sort((a, b) => a.time - b.time);

    this.emit("added", keyframe, clipId);
    return keyframe;
  }

  update(clipId, keyframeId, changes = {}) {
    const clip = this.getClip(clipId);
    if (!clip) throw new Error("Clip not found");

    const frames = this.ensureAnimation(clip);
    const frame = frames.find(item => item.id === keyframeId);

    if (!frame) throw new Error("Keyframe not found");

    if (
      changes.property &&
      !this.isAnimatable(changes.property)
    ) {
      throw new Error("Unsupported animation property");
    }

    Object.assign(frame, changes);

    frame.time = Math.max(0, Number(frame.time) || 0);

    frames.sort((a, b) => a.time - b.time);

    this.emit("updated", frame, clipId);
    return frame;
  }

  remove(clipId, keyframeId) {
    const clip = this.getClip(clipId);
    if (!clip) return false;

    const frames = this.ensureAnimation(clip);
    const index = frames.findIndex(
      frame => frame.id === keyframeId
    );

    if (index === -1) return false;

    const [removed] = frames.splice(index, 1);

    this.selectedKeyframes.delete(keyframeId);
    this.emit("removed", removed, clipId);

    return true;
  }

  removeProperty(clipId, property) {
    const clip = this.getClip(clipId);
    if (!clip) return 0;

    const frames = this.ensureAnimation(clip);
    const before = frames.length;

    clip.animation.keyframes = frames.filter(
      frame => frame.property !== property
    );

    const removed = before - clip.animation.keyframes.length;

    this.emit("propertyCleared", { property, removed }, clipId);
    return removed;
  }

  getForProperty(clipId, property) {
    const clip = this.getClip(clipId);
    if (!clip) return [];

    return this.ensureAnimation(clip)
      .filter(frame =>
        frame.property === property && frame.enabled !== false
      )
      .sort((a, b) => a.time - b.time);
  }

  getAll(clipId) {
    const clip = this.getClip(clipId);
    if (!clip) return [];

    return [...this.ensureAnimation(clip)]
      .sort((a, b) => a.time - b.time);
  }

  getAtTime(clipId, time, tolerance = 0.02) {
    const frames = this.getAll(clipId);

    return frames.filter(frame =>
      Math.abs(frame.time - time) <= tolerance
    );
  }

  getValueAt(clipId, property, time) {
    const frames = this.getForProperty(clipId, property);

    if (!frames.length) return null;

    const previous = [...frames]
      .reverse()
      .find(frame => frame.time <= time);

    const next = frames.find(frame => frame.time >= time);

    if (!previous) return frames[0].value;
    if (!next) return previous.value;

    if (previous.id === next.id) {
      return previous.value;
    }

    return {
      from: previous.value,
      to: next.value,
      progress: (
        (time - previous.time) /
        (next.time - previous.time)
      ),
      easing: previous.easing || "linear",
      interpolation: previous.interpolation || "bezier"
    };
  }

  select(keyframeId, additive = false) {
    if (!additive) {
      this.selectedKeyframes.clear();
    }

    this.selectedKeyframes.add(keyframeId);
    this.emit("selectionChanged", this.getSelection());
  }

  deselect(keyframeId) {
    this.selectedKeyframes.delete(keyframeId);
    this.emit("selectionChanged", this.getSelection());
  }

  clearSelection() {
    this.selectedKeyframes.clear();
    this.emit("selectionChanged", []);
  }

  getSelection() {
    return [...this.selectedKeyframes];
  }

  copy(clipId, keyframeIds = this.getSelection()) {
    const frames = this.getAll(clipId);

    const selected = frames.filter(frame =>
      keyframeIds.includes(frame.id)
    );

    if (!selected.length) return false;

    const firstTime = Math.min(
      ...selected.map(frame => frame.time)
    );

    this.clipboards.set("keyframes", {
      sourceClipId: clipId,
      frames: selected.map(frame => ({
        ...structuredClone(frame),
        time: frame.time - firstTime
      }))
    });

    this.emit("copied", selected);
    return true;
  }

  paste(clipId, atTime = 0) {
    const clipboard = this.clipboards.get("keyframes");
    if (!clipboard) return [];

    const created = [];

    for (const original of clipboard.frames) {
      const frame = {
        ...structuredClone(original),
        id: createId("key"),
        time: Math.max(0, atTime + original.time)
      };

      const result = this.add(
        clipId,
        frame.property,
        frame.time,
        frame.value,
        {
          easing: frame.easing,
          interpolation: frame.interpolation,
          inHandle: frame.inHandle,
          outHandle: frame.outHandle
        }
      );

      created.push(result);
    }

    this.emit("pasted", created, clipId);
    return created;
  }

  shiftAll(clipId, offset) {
    const clip = this.getClip(clipId);
    if (!clip) return false;

    const frames = this.ensureAnimation(clip);
    const shift = Number(offset) || 0;

    for (const frame of frames) {
      frame.time = Math.max(0, frame.time + shift);
    }

    frames.sort((a, b) => a.time - b.time);

    this.emit("shifted", { offset: shift }, clipId);
    return true;
  }

  emit(action, detail, clipId) {
    eventBus.emit(`keyframe:${action}`, {
      detail,
      clipId
    });

    eventBus.emit("project:changed", {
      reason: `keyframe:${action}`,
      clipId
    });
  }
}

export const keyframes = new KeyframeManager();
