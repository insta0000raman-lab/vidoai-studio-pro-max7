import { eventBus } from "../core/event-bus.js";

class ObjectDetection {
  constructor() {
    this.model = null;
    this.loading = false;
    this.ready = false;
    this.threshold = 0.35;
    this.maxDetections = 50;

    this.supportedLabels = new Set([
      "person",
      "dog",
      "cat",
      "cow",
      "horse",
      "sheep",
      "elephant",
      "bear",
      "zebra",
      "giraffe",
      "bird",
      "car",
      "motorcycle",
      "bus",
      "truck",
      "bicycle",
      "boat",
      "bottle",
      "cup",
      "wine glass",
      "bowl",
      "chair",
      "couch",
      "bed",
      "dining table",
      "laptop",
      "cell phone",
      "book",
      "clock",
      "handbag",
      "backpack",
      "umbrella",
      "sports ball",
      "suitcase"
    ]);
  }

  async initialize(modelLoader) {
    if (this.ready) return true;

    if (this.loading) {
      throw new Error("Object detection model is loading.");
    }

    if (typeof modelLoader !== "function") {
      throw new Error(
        "A real object detection model loader is required."
      );
    }

    this.loading = true;

    try {
      this.model = await modelLoader();

      if (!this.model ||
          typeof this.model.detect !== "function") {
        throw new Error(
          "Model must provide a detect(image) method."
        );
      }

      this.ready = true;

      eventBus.emit("OBJECT_MODEL_READY");

      return true;
    } catch (error) {
      this.model = null;
      this.ready = false;

      eventBus.emit("OBJECT_MODEL_ERROR", {
        message: error.message
      });

      throw error;
    } finally {
      this.loading = false;
    }
  }

  configure(options = {}) {
    if (options.threshold !== undefined) {
      this.threshold = Math.max(
        0,
        Math.min(1, Number(options.threshold))
      );
    }

    if (options.maxDetections !== undefined) {
      this.maxDetections = Math.max(
        1,
        Math.min(200, Number(options.maxDetections))
      );
    }
  }

  createCanvas(source) {
    const width =
      source.videoWidth ||
      source.naturalWidth ||
      source.width;

    const height =
      source.videoHeight ||
      source.naturalHeight ||
      source.height;

    if (!width || !height) {
      throw new Error("Invalid detection source.");
    }

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });

    if (!context) {
      throw new Error("Canvas is unavailable.");
    }

    context.drawImage(source, 0, 0, width, height);

    return {
      canvas,
      width,
      height
    };
  }

  async detect(source, options = {}) {
    if (!this.ready || !this.model) {
      throw new Error(
        "Object detection model is not initialized."
      );
    }

    if (!source) {
      throw new Error("Detection source is required.");
    }

    this.configure(options);

    const frame = this.createCanvas(source);

    const predictions = await this.model.detect(
      frame.canvas
    );

    if (!Array.isArray(predictions)) {
      throw new Error("Invalid model prediction output.");
    }

    const detections = predictions
      .map(prediction =>
        this.normalizePrediction(
          prediction,
          frame.width,
          frame.height
        )
      )
      .filter(Boolean)
      .filter(item =>
        item.confidence >= this.threshold
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.maxDetections);

    const result = {
      width: frame.width,
      height: frame.height,
      detections,
      detectedAt: Date.now()
    };

    eventBus.emit("OBJECTS_DETECTED", result);

    return result;
  }

  normalizePrediction(prediction, width, height) {
    const label = String(
      prediction.class ||
      prediction.label ||
      prediction.category ||
      "unknown"
    ).toLowerCase();

    const confidence = Number(
      prediction.score ??
      prediction.confidence ??
      0
    );

    if (!Number.isFinite(confidence)) return null;

    const box = prediction.bbox ||
      prediction.box ||
      prediction.boundingBox;

    if (!box) return null;

    let x, y, w, h;

    if (Array.isArray(box)) {
      [x, y, w, h] = box;
    } else {
      x = box.x ?? box.left;
      y = box.y ?? box.top;
      w = box.width;
      h = box.height;
    }

    if (![x, y, w, h].every(Number.isFinite)) {
      return null;
    }

    const normalized = {
      x: Math.max(0, Math.min(width, x)),
      y: Math.max(0, Math.min(height, y)),
      width: Math.max(0, Math.min(width - x, w)),
      height: Math.max(0, Math.min(height - y, h))
    };

    if (!normalized.width || !normalized.height) {
      return null;
    }

    return {
      id: this.createId(),
      label,
      confidence: Math.max(0, Math.min(1, confidence)),
      box: normalized,
      center: {
        x: normalized.x + normalized.width / 2,
        y: normalized.y + normalized.height / 2
      },
      isKnownLabel: this.supportedLabels.has(label)
    };
  }

  findByLabel(detections, label) {
    const target = String(label).toLowerCase();

    return (detections || []).filter(item =>
      item.label === target
    );
  }

  findBest(detections, label = null) {
    let items = detections || [];

    if (label) {
      items = this.findByLabel(items, label);
    }

    return [...items].sort(
      (a, b) => b.confidence - a.confidence
    )[0] || null;
  }

  getAvailableLabels() {
    return [...this.supportedLabels];
  }

  setThreshold(value) {
    this.threshold = Math.max(
      0,
      Math.min(1, Number(value))
    );

    return this.threshold;
  }

  createId() {
    return `object_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  destroy() {
    if (this.model?.dispose) {
      this.model.dispose();
    }

    this.model = null;
    this.ready = false;
    this.loading = false;

    eventBus.emit("OBJECT_MODEL_DESTROYED");
  }
}

export const objectDetection = new ObjectDetection();
