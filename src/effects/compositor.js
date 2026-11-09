import { colorEngine } from "./color-engine.js";
import { filterEngine } from "./filters.js";
import { eventBus } from "../core/event-bus.js";

class Compositor {
  constructor() {
    this.canvas = null;
    this.context = null;
    this.width = 1080;
    this.height = 1920;
    this.frameCount = 0;
  }

  initialize(canvas, options = {}) {
    if (!canvas) {
      throw new Error("Compositor canvas is required.");
    }

    this.canvas = canvas;
    this.context = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true
    });

    if (!this.context) {
      throw new Error("Canvas 2D context unavailable.");
    }

    this.resize(
      options.width || this.width,
      options.height || this.height
    );

    return true;
  }

  resize(width, height) {
    if (!this.canvas) return;

    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";
  }

  clear(color = "#000000") {
    if (!this.context) return;

    const ctx = this.context;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  renderFrame(layers, options = {}) {
    if (!this.context) {
      throw new Error("Initialize compositor first.");
    }

    const ctx = this.context;
    const time = Math.max(0, Number(options.time) || 0);

    this.clear(options.background || "#000000");

    const orderedLayers = [...(layers || [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );

    for (const layer of orderedLayers) {
      if (layer.visible === false || layer.enabled === false) {
        continue;
      }

      if (!this.isLayerActive(layer, time)) continue;

      try {
        this.renderLayer(layer, time);
      } catch (error) {
        eventBus.emit("COMPOSITOR_LAYER_ERROR", {
          layerId: layer.id,
          error: error.message
        });
      }
    }

    this.frameCount++;

    eventBus.emit("COMPOSITOR_FRAME_RENDERED", {
      frame: this.frameCount,
      time,
      width: this.width,
      height: this.height
    });

    return this.canvas;
  }

  isLayerActive(layer, time) {
    const start = Number(layer.startTime || 0);
    const end = layer.endTime;

    if (time < start) return false;
    if (end !== null && end !== undefined && time > end) {
      return false;
    }

    return true;
  }

  renderLayer(layer, time) {
    const source = this.resolveSource(layer, time);

    if (!source) return false;

    const ctx = this.context;
    const transform = layer.transform || {};

    const x = Number(transform.x ?? layer.x ?? 0);
    const y = Number(transform.y ?? layer.y ?? 0);
    const scaleX = Number(transform.scaleX ?? 1);
    const scaleY = Number(transform.scaleY ?? 1);
    const rotation = Number(transform.rotation ?? 0);
    const opacity = Math.min(
      1,
      Math.max(0, Number(layer.opacity ?? 1))
    );

    const width = Number(
      transform.width || source.videoWidth ||
      source.naturalWidth || source.width || this.width
    );

    const height = Number(
      transform.height || source.videoHeight ||
      source.naturalHeight || source.height || this.height
    );

    if (!width || !height) return false;

    const anchorX = Number(transform.anchorX ?? 0.5);
    const anchorY = Number(transform.anchorY ?? 0.5);

    ctx.save();

    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation =
      this.getBlendMode(layer.blendMode);

    ctx.translate(x, y);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-width * anchorX, -height * anchorY);

    this.drawSource(source, layer, width, height);

    ctx.restore();

    return true;
  }

  resolveSource(layer, time) {
    if (typeof layer.getFrame === "function") {
      return layer.getFrame(time);
    }

    if (layer.source) return layer.source;
    if (layer.element) return layer.element;
    if (layer.canvas) return layer.canvas;

    return null;
  }

  drawSource(source, layer, width, height) {
    const ctx = this.context;

    if (layer.type === "text" || layer.text !== undefined) {
      this.drawText(layer, width, height);
      return;
    }

    if (
      source.readyState !== undefined &&
      source.readyState < 2
    ) {
      return;
    }

    if (
      source.complete === false &&
      source.naturalWidth !== undefined
    ) {
      return;
    }

    const crop = layer.crop || null;

    if (crop) {
      const sx = crop.x || 0;
      const sy = crop.y || 0;
      const sw = crop.width || source.videoWidth ||
        source.naturalWidth || source.width;
      const sh = crop.height || source.videoHeight ||
        source.naturalHeight || source.height;

      ctx.drawImage(
        source,
        sx, sy, sw, sh,
        0, 0, width, height
      );
    } else {
      ctx.drawImage(source, 0, 0, width, height);
    }
  }

  drawText(layer, width, height) {
    const ctx = this.context;
    const style = layer.style || {};

    const text = String(layer.text ?? "");
    const fontSize = Number(style.fontSize || 64);
    const fontFamily = style.fontFamily || "Arial";

    ctx.font = `${style.fontWeight || "normal"} ${fontSize}px "${fontFamily}"`;
    ctx.textAlign = style.textAlign || "center";
    ctx.textBaseline = style.textBaseline || "middle";

    const color = style.color || "#ffffff";

    if (style.shadow) {
      ctx.shadowColor = style.shadow.color || "#000000";
      ctx.shadowBlur = Number(style.shadow.blur || 0);
      ctx.shadowOffsetX = Number(style.shadow.x || 0);
      ctx.shadowOffsetY = Number(style.shadow.y || 0);
    }

    if (style.stroke) {
      ctx.lineWidth = Number(style.stroke.width || 2);
      ctx.strokeStyle = style.stroke.color || "#000000";
      ctx.strokeText(text, width / 2, height / 2);
    }

    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, height / 2);

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  getBlendMode(mode) {
    const supported = [
      "source-over",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
      "hard-light",
      "soft-light",
      "difference",
      "exclusion"
    ];

    return supported.includes(mode) ? mode : "source-over";
  }

  applyClipEffects(clip) {
    if (!this.canvas || !clip) return;

    const ctx = this.context;

    const colorEffects = [
      "brightness", "contrast", "saturation",
      "exposure", "temperature", "tint",
      "highlights", "shadows"
    ];

    const hasColorEffects = (clip.effects || []).some(
      effect => effect.enabled &&
        colorEffects.includes(effect.type)
    );

    if (hasColorEffects) {
      const imageData = ctx.getImageData(
        0, 0, this.width, this.height
      );

      colorEngine.applyPixelEffects(imageData, clip);
      ctx.putImageData(imageData, 0, 0);
    }

    filterEngine.apply(ctx, this.canvas, clip);

    const vignette = colorEngine.getVignetteAmount(clip);

    if (vignette > 0) {
      colorEngine.applyVignette(
        ctx,
        this.width,
        this.height,
        vignette
      );
    }
  }

  exportFrame(type = "image/png", quality = 0.92) {
    if (!this.canvas) {
      throw new Error("Compositor is not initialized.");
    }

    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error("Frame export failed."));
            return;
          }

          resolve(blob);
        },
        type,
        quality
      );
    });
  }

  destroy() {
    this.canvas = null;
    this.context = null;
    this.frameCount = 0;
  }
}

export const compositor = new Compositor();
