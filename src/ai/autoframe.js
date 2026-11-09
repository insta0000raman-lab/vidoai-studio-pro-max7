import { objectTracker } from "./tracking.js";

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

function normalizeBox(box, width, height) {
  return {
    x: box.x / width,
    y: box.y / height,
    width: box.width / width,
    height: box.height / height
  };
}

function getTargetCenter(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

function getCanvasSize(ratio, customSize = null) {
  if (customSize?.width && customSize?.height) {
    return {
      width: customSize.width,
      height: customSize.height
    };
  }

  const sizes = {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 }
  };

  return sizes[ratio] || sizes["9:16"];
}

export class AutoFrameEngine {
  constructor(options = {}) {
    this.options = {
      padding: options.padding ?? 0.18,
      maxZoom: options.maxZoom ?? 3,
      minZoom: options.minZoom ?? 1,
      horizontalBias: options.horizontalBias ?? 0,
      verticalBias: options.verticalBias ?? 0,
      safeArea: options.safeArea ?? 0.05
    };

    this.lastFrame = null;
    this.history = [];
    this.listeners = new Set();
  }

  calculate(input) {
    const {
      sourceWidth,
      sourceHeight,
      targetBox,
      ratio = "9:16",
      customSize = null,
      timestamp = 0,
      trackId = null
    } = input;

    if (
      !sourceWidth ||
      !sourceHeight ||
      !targetBox ||
      sourceWidth <= 0 ||
      sourceHeight <= 0
    ) {
      throw new Error("Invalid AutoFrame input.");
    }

    const box = {
      x: Number(targetBox.x),
      y: Number(targetBox.y),
      width: Number(targetBox.width),
      height: Number(targetBox.height)
    };

    if (
      !Object.values(box).every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0
    ) {
      throw new Error("Invalid target bounding box.");
    }

    const canvas = getCanvasSize(ratio, customSize);

    const target = getTargetCenter(box);

    const padding = clamp(
      this.options.padding,
      0,
      0.8
    );

    const safeArea = clamp(
      this.options.safeArea,
      0,
      0.3
    );

    const availableWidth =
      canvas.width * (1 - safeArea * 2);

    const availableHeight =
      canvas.height * (1 - safeArea * 2);

    const requiredWidth =
      box.width * (1 + padding * 2);

    const requiredHeight =
      box.height * (1 + padding * 2);

    const fitScale = Math.min(
      availableWidth / requiredWidth,
      availableHeight / requiredHeight
    );

    const zoom = clamp(
      fitScale,
      this.options.minZoom,
      this.options.maxZoom
    );

    const displayWidth = sourceWidth * zoom;
    const displayHeight = sourceHeight * zoom;

    const targetX =
      target.x + this.options.horizontalBias * box.width;

    const targetY =
      target.y + this.options.verticalBias * box.height;

    const desiredX = canvas.width / 2 - targetX * zoom;
    const desiredY = canvas.height / 2 - targetY * zoom;

    const minX = canvas.width - displayWidth;
    const minY = canvas.height - displayHeight;

    const positionX = clamp(
      desiredX,
      Math.min(0, minX),
      0
    );

    const positionY = clamp(
      desiredY,
      Math.min(0, minY),
      0
    );

    const result = {
      id: `autoframe-${Date.now()}`,
      trackId,
      timestamp,

      source: {
        width: sourceWidth,
        height: sourceHeight
      },

      output: canvas,
      ratio,

      targetBox: box,
      normalizedTarget: normalizeBox(
        box,
        sourceWidth,
        sourceHeight
      ),

      transform: {
        scale: zoom,
        x: positionX,
        y: positionY,
        rotation: 0
      },

      confidence: input.confidence ?? null,
      status: input.status || "suggested",
      method: "object-centered-fit"
    };

    this.lastFrame = result;
    this.history.push(result);

    this.emit(result);

    return structuredClone(result);
  }

  calculateFromTrack(input) {
    const {
      trackId,
      timestamp,
      sourceWidth,
      sourceHeight,
      ratio,
      customSize
    } = input;

    const track = objectTracker.getTrack(trackId);

    if (!track) {
      throw new Error("Object track not found.");
    }

    if (track.status === "lost") {
      throw new Error(
        "Selected object is currently lost."
      );
    }

    const targetBox = objectTracker.getPositionAt(
      trackId,
      timestamp
    ) || track.lastReliableBox;

    if (!targetBox) {
      throw new Error("No reliable object position.");
    }

    return this.calculate({
      sourceWidth,
      sourceHeight,
      targetBox,
      ratio,
      customSize,
      timestamp,
      trackId,
      confidence: track.confidence,
      status: track.status
    });
  }

  calculateForScene(input) {
    const {
      trackId,
      startTime,
      endTime,
      sourceWidth,
      sourceHeight,
      ratio,
      customSize
    } = input;

    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      endTime <= startTime
    ) {
      throw new Error("Invalid scene time range.");
    }

    const middleTime = startTime +
      (endTime - startTime) / 2;

    const frame = this.calculateFromTrack({
      trackId,
      timestamp: middleTime,
      sourceWidth,
      sourceHeight,
      ratio,
      customSize
    });

    return {
      id: `scene-frame-${Date.now()}`,
      trackId,
      startTime,
      endTime,

      keyframeMode: "static",
      transform: { ...frame.transform },

      targetBox: { ...frame.targetBox },
      confidence: frame.confidence,

      needsReview:
        frame.status === "temporarily-missing",

      source: frame.source,
      output: frame.output,
      ratio
    };
  }

  updateOptions(options = {}) {
    this.options = {
      ...this.options,
      ...options
    };

    return { ...this.options };
  }

  setManualPosition(frame, changes = {}) {
    if (!frame?.transform) {
      throw new Error("Invalid frame data.");
    }

    const updated = structuredClone(frame);

    updated.transform = {
      ...updated.transform,
      ...changes
    };

    updated.status = "manually-adjusted";
    updated.method = "manual";

    this.emit(updated);

    return updated;
  }

  getHistory() {
    return structuredClone(this.history);
  }

  clearHistory() {
    this.history = [];
    this.lastFrame = null;
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(data) {
    for (const callback of this.listeners) {
      callback(structuredClone(data));
    }
  }

  destroy() {
    this.clearHistory();
    this.listeners.clear();
  }
}

export const autoFrameEngine = new AutoFrameEngine();
