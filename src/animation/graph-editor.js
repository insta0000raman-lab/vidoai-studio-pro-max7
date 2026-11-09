import { keyframes } from "./keyframes.js";
import { interpolation } from "./interpolation.js";
import { easing } from "./easing.js";

export class GraphEditor {
  constructor() {
    this.clipId = null;
    this.property = null;
    this.selectedKeyframeId = null;
    this.range = {
      start: 0,
      end: 5
    };
    this.valueRange = {
      min: 0,
      max: 100
    };
    this.sampleCount = 100;
    this.listeners = new Set();
  }

  open(clipId, property) {
    if (!clipId || !property) {
      throw new Error("Clip and property are required");
    }

    this.clipId = clipId;
    this.property = property;

    const frames = this.getFrames();

    if (frames.length) {
      this.range.start = Math.min(
        0,
        ...frames.map(frame => frame.time)
      );

      this.range.end = Math.max(
        5,
        ...frames.map(frame => frame.time)
      );

      const values = frames
        .map(frame => Number(frame.value))
        .filter(Number.isFinite);

      if (values.length) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const padding = Math.max(1, (max - min) * 0.1);

        this.valueRange = {
          min: min - padding,
          max: max + padding
        };
      }
    }

    this.emit("opened");
    return this.getGraphData();
  }

  close() {
    this.clipId = null;
    this.property = null;
    this.selectedKeyframeId = null;
    this.emit("closed");
  }

  getFrames() {
    if (!this.clipId || !this.property) return [];

    return keyframes.getForProperty(
      this.clipId,
      this.property
    );
  }

  setTimeRange(start, end) {
    start = Number(start);
    end = Number(end);

    if (!Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start) {
      throw new Error("Invalid graph time range");
    }

    this.range = { start, end };
    this.emit("rangeChanged");

    return this.range;
  }

  setValueRange(min, max) {
    min = Number(min);
    max = Number(max);

    if (!Number.isFinite(min) ||
        !Number.isFinite(max) ||
        max <= min) {
      throw new Error("Invalid graph value range");
    }

    this.valueRange = { min, max };
    this.emit("rangeChanged");

    return this.valueRange;
  }

  setSampleCount(count) {
    this.sampleCount = Math.max(
      10,
      Math.min(1000, Math.floor(Number(count) || 100))
    );

    return this.sampleCount;
  }

  timeToX(time, width) {
    const duration = this.range.end - this.range.start;

    return ((time - this.range.start) / duration) * width;
  }

  xToTime(x, width) {
    const progress = Math.max(0, Math.min(1, x / width));

    return this.range.start +
      progress * (this.range.end - this.range.start);
  }

  valueToY(value, height) {
    const span = this.valueRange.max - this.valueRange.min;

    return height -
      ((value - this.valueRange.min) / span) * height;
  }

  yToValue(y, height) {
    const progress = Math.max(0, Math.min(1, 1 - y / height));

    return this.valueRange.min +
      progress * (this.valueRange.max - this.valueRange.min);
  }

  getGraphData() {
    if (!this.clipId || !this.property) {
      return {
        points: [],
        curve: [],
        range: this.range,
        valueRange: this.valueRange
      };
    }

    const frames = this.getFrames();

    const points = frames.map(frame => ({
      id: frame.id,
      time: frame.time,
      value: Number(frame.value),
      easing: frame.easing,
      interpolation: frame.interpolation,
      selected: frame.id === this.selectedKeyframeId
    }));

    return {
      points,
      curve: this.generateCurve(),
      range: { ...this.range },
      valueRange: { ...this.valueRange }
    };
  }

  generateCurve() {
    const frames = this.getFrames();

    if (!frames.length) return [];

    const result = [];
    const total = this.sampleCount;

    for (let i = 0; i <= total; i++) {
      const progress = i / total;
      const time = this.range.start +
        progress * (this.range.end - this.range.start);

      const value = this.getValueAt(time);

      if (Number.isFinite(value)) {
        result.push({ time, value });
      }
    }

    return result;
  }

  getValueAt(time) {
    const frames = this.getFrames();

    return interpolation.interpolateKeyframes(
      frames,
      time,
      null
    );
  }

  selectKeyframe(id) {
    const frame = this.getFrames().find(item => item.id === id);

    if (!frame) return false;

    this.selectedKeyframeId = id;
    this.emit("keyframeSelected", frame);

    return frame;
  }

  moveKeyframe(id, time, value) {
    const frame = this.getFrames().find(item => item.id === id);

    if (!frame) {
      throw new Error("Keyframe not found");
    }

    const updated = keyframes.update(
      this.clipId,
      id,
      {
        time: Math.max(0, Number(time) || 0),
        value: Number(value)
      }
    );

    this.emit("keyframeMoved", updated);

    return updated;
  }

  setKeyframeEasing(id, easingName) {
    const frame = this.getFrames().find(item => item.id === id);

    if (!frame) {
      throw new Error("Keyframe not found");
    }

    const preset = easing.getPreset(easingName);

    return keyframes.update(this.clipId, id, {
      easing: easingName,
      interpolation: "bezier",
      outHandle: {
        x1: preset[0],
        y1: preset[1],
        x2: preset[2],
        y2: preset[3]
      }
    });
  }

  addKeyframe(time, value) {
    if (!this.clipId || !this.property) {
      throw new Error("Graph editor is not open");
    }

    const frame = keyframes.add(
      this.clipId,
      this.property,
      time,
      value
    );

    this.selectedKeyframeId = frame.id;
    this.emit("keyframeAdded", frame);

    return frame;
  }

  deleteSelected() {
    if (!this.selectedKeyframeId) return false;

    const removed = keyframes.remove(
      this.clipId,
      this.selectedKeyframeId
    );

    this.selectedKeyframeId = null;
    this.emit("keyframeDeleted");

    return removed;
  }

  getEasingOptions() {
    return easing.listPresets();
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(type, detail = null) {
    const event = {
      type,
      detail,
      graph: this.getGraphData()
    };

    for (const callback of this.listeners) {
      try {
        callback(event);
      } catch (error) {
        console.error("Graph editor listener error:", error);
      }
    }
  }
}

export const graphEditor = new GraphEditor();
