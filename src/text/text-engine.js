import { createId } from "../project/schema.js";
import { eventBus } from "../core/event-bus.js";
import { projectManager } from "../project/project-manager.js";
import { keyframes } from "../animation/keyframes.js";

const DEFAULT_TEXT_STYLE = {
  fontFamily: "Arial",
  fontSize: 64,
  fontWeight: 700,
  fontStyle: "normal",
  color: "#ffffff",
  backgroundColor: "transparent",
  textAlign: "center",
  lineHeight: 1.2,
  letterSpacing: 0,
  stroke: {
    color: "#000000",
    width: 0
  },
  shadow: {
    enabled: false,
    color: "#000000",
    blur: 12,
    offsetX: 0,
    offsetY: 4
  },
  glow: {
    enabled: false,
    color: "#8b7cff",
    intensity: 0,
    blur: 20
  },
  opacity: 1
};

const clone = value => structuredClone(value);

export class TextEngine {
  constructor() {
    this.selectedLayerId = null;
    this.listeners = new Set();
    this.fonts = new Set(["Arial", "sans-serif"]);
  }

  get project() {
    return projectManager.currentProject;
  }

  get tracks() {
    return this.project?.tracks || [];
  }

  getTextLayers() {
    return this.tracks.flatMap(track =>
      (track.clips || [])
        .filter(clip =>
          clip.type === "text" ||
          clip.type === "textClip"
        )
        .map(clip => ({
          ...clip,
          trackId: track.id
        }))
    );
  }

  getLayer(layerId) {
    for (const track of this.tracks) {
      const layer = (track.clips || []).find(
        clip => clip.id === layerId
      );

      if (layer) return layer;
    }

    return null;
  }

  createLayer(options = {}) {
    const text = String(options.text ?? "Your Text");

    const layer = {
      id: createId("text"),
      type: "text",
      name: options.name || "Text Layer",
      text,
      startTime: Math.max(0, Number(options.startTime) || 0),
      duration: Math.max(0.1, Number(options.duration) || 5),
      style: {
        ...clone(DEFAULT_TEXT_STYLE),
        ...(options.style || {})
      },
      transform: {
        x: options.x ?? 0,
        y: options.y ?? 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        opacity: 1
      },
      animation: {
        keyframes: []
      },
      visible: true,
      locked: false
    };

    const track = this.tracks.find(
      item => item.type === "text" && !item.locked
    );

    if (!track) {
      throw new Error(
        "Text track not found. Create a text track first."
      );
    }

    track.clips.push(layer);

    this.selectedLayerId = layer.id;
    this.changed("created", layer);

    return layer;
  }

  updateText(layerId, text) {
    const layer = this.requireLayer(layerId);

    layer.text = String(text ?? "");

    this.changed("textUpdated", layer);
    return layer;
  }

  updateStyle(layerId, changes = {}) {
    const layer = this.requireLayer(layerId);

    layer.style = {
      ...layer.style,
      ...changes,
      stroke: {
        ...layer.style.stroke,
        ...(changes.stroke || {})
      },
      shadow: {
        ...layer.style.shadow,
        ...(changes.shadow || {})
      },
      glow: {
        ...layer.style.glow,
        ...(changes.glow || {})
      }
    };

    this.changed("styleUpdated", layer);
    return layer;
  }

  updateTransform(layerId, changes = {}) {
    const layer = this.requireLayer(layerId);

    layer.transform = {
      ...layer.transform,
      ...changes
    };

    this.changed("transformUpdated", layer);
    return layer;
  }

  updateTiming(layerId, startTime, duration) {
    const layer = this.requireLayer(layerId);

    const start = Math.max(0, Number(startTime) || 0);
    const length = Math.max(0.1, Number(duration) || 0.1);

    layer.startTime = start;
    layer.duration = length;

    this.changed("timingUpdated", layer);
    return layer;
  }

  rename(layerId, name) {
    const layer = this.requireLayer(layerId);

    layer.name = String(name || "Text Layer").trim();

    this.changed("renamed", layer);
    return layer;
  }

  duplicate(layerId) {
    const original = this.requireLayer(layerId);
    const track = this.tracks.find(item =>
      (item.clips || []).some(clip => clip.id === layerId)
    );

    if (!track) throw new Error("Text track not found");

    const copy = clone(original);

    copy.id = createId("text");
    copy.name = `${original.name} Copy`;
    copy.startTime += copy.duration;

    track.clips.push(copy);

    this.selectedLayerId = copy.id;
    this.changed("duplicated", copy);

    return copy;
  }

  delete(layerId) {
    for (const track of this.tracks) {
      const index = (track.clips || []).findIndex(
        clip => clip.id === layerId
      );

      if (index !== -1) {
        const [removed] = track.clips.splice(index, 1);

        if (this.selectedLayerId === layerId) {
          this.selectedLayerId = null;
        }

        this.changed("deleted", removed);
        return true;
      }
    }

    return false;
  }

  select(layerId) {
    const layer = this.getLayer(layerId);

    if (!layer) return false;

    this.selectedLayerId = layerId;
    this.emit("selected", layer);

    return layer;
  }

  getSelected() {
    return this.selectedLayerId
      ? this.getLayer(this.selectedLayerId)
      : null;
  }

  setFont(layerId, fontFamily) {
    const font = String(fontFamily || "Arial");

    this.fonts.add(font);

    return this.updateStyle(layerId, {
      fontFamily: font
    });
  }

  registerFont(fontFamily) {
    const font = String(fontFamily || "").trim();

    if (!font) return false;

    this.fonts.add(font);
    this.emit("fontRegistered", font);

    return true;
  }

  getFonts() {
    return [...this.fonts];
  }

  addKeyframe(layerId, property, time, value) {
    const layer = this.requireLayer(layerId);

    return keyframes.add(
      layer.id,
      property,
      time,
      value
    );
  }

  getRenderData(layerId) {
    const layer = this.requireLayer(layerId);

    return {
      id: layer.id,
      text: layer.text,
      style: clone(layer.style),
      transform: clone(layer.transform),
      startTime: layer.startTime,
      duration: layer.duration,
      visible: layer.visible !== false
    };
  }

  requireLayer(layerId) {
    const layer = this.getLayer(layerId);

    if (!layer) {
      throw new Error("Text layer not found");
    }

    if (layer.locked) {
      throw new Error("Text layer is locked");
    }

    return layer;
  }

  changed(action, layer) {
    this.emit(action, layer);

    eventBus.emit("project:changed", {
      reason: `text:${action}`,
      layerId: layer?.id || null
    });
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(type, detail = null) {
    const event = { type, detail };

    for (const callback of this.listeners) {
      try {
        callback(event);
      } catch (error) {
        console.error("Text engine listener error:", error);
      }
    }

    eventBus.emit(`text:${type}`, event);
  }
}

export const textEngine = new TextEngine();
