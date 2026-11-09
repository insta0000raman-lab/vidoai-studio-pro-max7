import { renderGraph } from "./render-graph.js";
import { mediaCache } from "../media/media-cache.js";
import { textEngine } from "../text/text-engine.js";
import { colorEngine } from "../effects/color-engine.js";
import { filterEngine } from "../effects/filters.js";

export class PreviewRenderer {
  constructor(options = {}) {
    this.options = {
      background: "#000000",
      smoothing: true,
      maxPixelRatio: 2,
      ...options
    };

    this.canvas = null;
    this.context = null;
    this.project = null;
    this.currentTime = 0;

    this.assets = new Map();
    this.listeners = new Set();

    this.isRendering = false;
    this.destroyed = false;
  }

  initialize(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") {
      throw new Error("A valid preview canvas is required.");
    }

    this.canvas = canvas;
    this.context = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true
    });

    if (!this.context) {
      throw new Error("Canvas 2D context unavailable.");
    }

    this.context.imageSmoothingEnabled =
      this.options.smoothing;

    return true;
  }

  setProject(project) {
    this.project = project;
    this.emit("project-changed");
  }

  registerAsset(assetId, element) {
    if (!assetId || !element) {
      throw new Error("Asset ID and element required.");
    }

    this.assets.set(assetId, element);
  }

  unregisterAsset(assetId) {
    this.assets.delete(assetId);
  }

  getAsset(node) {
    const assetId = node.source?.assetId;

    if (assetId && this.assets.has(assetId)) {
      return this.assets.get(assetId);
    }

    const cached = assetId
      ? mediaCache.get(assetId)
      : null;

    if (cached?.element) {
      return cached.element;
    }

    return null;
  }

  resize(width, height, pixelRatio = 1) {
    if (!this.canvas) return;

    const ratio = Math.min(
      Math.max(1, pixelRatio),
      this.options.maxPixelRatio
    );

    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.context.setTransform(
      ratio, 0, 0, ratio, 0, 0
    );
  }

  render(project = this.project, time = this.currentTime) {
    if (this.destroyed) {
      throw new Error("Preview renderer destroyed.");
    }

    if (!this.context) {
      throw new Error("Initialize the renderer first.");
    }

    if (!project) {
      throw new Error("No project loaded.");
    }

    if (this.isRendering) {
      return false;
    }

    this.isRendering = true;

    try {
      this.project = project;
      this.currentTime = Math.max(0, Number(time) || 0);

      const graph = renderGraph.build(project, {
        time: this.currentTime
      });

      this.prepareCanvas(graph);
      this.drawLayers(graph);

      this.emit("render-complete", {
        time: this.currentTime,
        nodes: graph.nodes.length
      });

      return true;
    } catch (error) {
      this.emit("render-error", {
        message: error.message
      });

      throw error;
    } finally {
      this.isRendering = false;
    }
  }

  prepareCanvas(graph) {
    const width = graph.canvas.width;
    const height = graph.canvas.height;

    this.resize(width, height, 1);

    this.context.clearRect(0, 0, width, height);

    this.context.fillStyle =
      graph.background || this.options.background;

    this.context.fillRect(0, 0, width, height);
  }

  drawLayers(graph) {
    for (const node of graph.layers) {
      if (!node.active) continue;

      this.context.save();

      try {
        if (node.type === "text") {
          this.drawText(node, graph);
        } else {
          this.drawMedia(node, graph);
        }
      } catch (error) {
        this.emit("layer-error", {
          nodeId: node.id,
          message: error.message
        });
      }

      this.context.restore();
    }
  }

  getLayerRect(node, graph) {
    const transform = node.transform;
    const source = this.getAsset(node);

    const sourceWidth =
      source?.videoWidth ||
      source?.naturalWidth ||
      source?.width ||
      graph.canvas.width;

    const sourceHeight =
      source?.videoHeight ||
      source?.naturalHeight ||
      source?.height ||
      graph.canvas.height;

    const width = sourceWidth *
      transform.scale *
      transform.scaleX;

    const height = sourceHeight *
      transform.scale *
      transform.scaleY;

    const x = transform.x;
    const y = transform.y;

    return {
      x: x - width * transform.anchorX,
      y: y - height * transform.anchorY,
      width,
      height
    };
  }

  drawMedia(node, graph) {
    const element = this.getAsset(node);

    if (!element) {
      this.emit("missing-asset", {
        nodeId: node.id,
        assetId: node.source.assetId
      });
      return;
    }

    if (
      element.readyState !== undefined &&
      element.readyState < 2
    ) {
      return;
    }

    if (
      element.complete === false &&
      element.naturalWidth === 0
    ) {
      return;
    }

    const rect = this.getLayerRect(node, graph);
    const transform = node.transform;

    this.context.globalAlpha =
      transform.opacity * node.opacity;

    this.context.globalCompositeOperation =
      node.blendMode || "source-over";

    this.context.translate(
      rect.x + rect.width * transform.anchorX,
      rect.y + rect.height * transform.anchorY
    );

    this.context.rotate(
      transform.rotation * Math.PI / 180
    );

    this.context.translate(
      -rect.width * transform.anchorX,
      -rect.height * transform.anchorY
    );

    const clip = this.project?.tracks
      ?.flatMap(track => track.clips || [])
      .find(item => item.id === node.id);

    const filter = clip
      ? colorEngine.getCSSFilter?.(clip) || "none"
      : "none";

    this.context.filter = filter;

    this.context.drawImage(
      element,
      0,
      0,
      rect.width,
      rect.height
    );

    this.context.filter = "none";

    if (clip?.effects?.length) {
      this.emit("effects-pending", {
        nodeId: node.id,
        effects: clip.effects.map(effect => effect.type)
      });
    }
  }

  drawText(node, graph) {
    const ctx = this.context;
    const style = node.style || {};
    const transform = node.transform;

    const content =
      node.source.text ||
      style.text ||
      "";

    if (!content) return;

    const fontSize = Number(style.fontSize) || 64;
    const fontFamily = style.fontFamily || "Arial";

    ctx.globalAlpha =
      transform.opacity * node.opacity;

    ctx.textAlign = style.align || "center";
    ctx.textBaseline = style.baseline || "middle";

    ctx.font = [
      style.fontWeight || "normal",
      style.fontStyle || "normal",
      `${fontSize}px`,
      `"${fontFamily}"`
    ].join(" ");

    ctx.fillStyle = style.color || "#ffffff";

    ctx.translate(transform.x, transform.y);

    ctx.rotate(
      transform.rotation * Math.PI / 180
    );

    ctx.scale(
      transform.scale * transform.scaleX,
      transform.scale * transform.scaleY
    );

    if (style.shadowColor) {
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = Number(style.shadowBlur) || 0;
      ctx.shadowOffsetX = Number(style.shadowX) || 0;
      ctx.shadowOffsetY = Number(style.shadowY) || 0;
    }

    if (style.strokeColor && style.strokeWidth) {
      ctx.lineWidth = Number(style.strokeWidth);
      ctx.strokeStyle = style.strokeColor;
      ctx.lineJoin = "round";
      ctx.strokeText(content, 0, 0);
    }

    ctx.fillText(
      content,
      0,
      0,
      style.maxWidth || graph.canvas.width * 0.9
    );

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  seek(time) {
    this.currentTime = Math.max(0, Number(time) || 0);

    if (this.project) {
      return this.render(this.project, this.currentTime);
    }

    return false;
  }

  getCanvas() {
    return this.canvas;
  }

  getContext() {
    return this.context;
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(type, detail = {}) {
    for (const callback of this.listeners) {
      callback({ type, detail });
    }
  }

  destroy() {
    this.destroyed = true;
    this.assets.clear();
    this.listeners.clear();
    this.project = null;
    this.canvas = null;
    this.context = null;
  }
}

export const previewRenderer = new PreviewRenderer();
