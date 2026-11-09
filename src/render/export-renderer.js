import { renderGraph } from "./render-graph.js";
import { PreviewRenderer } from "./preview-renderer.js";

export class ExportRenderer {
  constructor(options = {}) {
    this.options = {
      frameBatchSize: 4,
      maxWidth: 3840,
      maxHeight: 2160,
      ...options
    };

    this.renderer = new PreviewRenderer({
      smoothing: true,
      maxPixelRatio: 1
    });

    this.canvas = null;
    this.project = null;
    this.settings = null;

    this.cancelled = false;
    this.running = false;
    this.listeners = new Set();
  }

  initialize() {
    if (this.canvas) return this.canvas;

    this.canvas = document.createElement("canvas");

    this.renderer.initialize(this.canvas);

    return this.canvas;
  }

  validateSettings(project, settings) {
    if (!project) {
      throw new Error("No project available.");
    }

    const width = Number(settings.width);
    const height = Number(settings.height);
    const fps = Number(settings.fps);

    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1
    ) {
      throw new Error("Invalid export resolution.");
    }

    if (
      width > this.options.maxWidth ||
      height > this.options.maxHeight
    ) {
      throw new Error("Export resolution exceeds device limit.");
    }

    if (
      !Number.isFinite(fps) ||
      fps < 1 ||
      fps > 120
    ) {
      throw new Error("Invalid export frame rate.");
    }

    const duration = Number(
      settings.duration ?? project.duration
    );

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Invalid export duration.");
    }

    return {
      width,
      height,
      fps,
      duration,
      format: settings.format || "video/mp4"
    };
  }

  async prepare(project, settings = {}) {
    if (this.running) {
      throw new Error("Export preparation already running.");
    }

    this.project = project;
    this.settings = this.validateSettings(
      project,
      settings
    );

    this.cancelled = false;

    this.initialize();

    this.canvas.width = this.settings.width;
    this.canvas.height = this.settings.height;

    this.renderer.resize(
      this.settings.width,
      this.settings.height,
      1
    );

    this.renderer.setProject(project);

    this.emit("prepared", {
      width: this.settings.width,
      height: this.settings.height,
      fps: this.settings.fps,
      duration: this.settings.duration
    });

    return {
      canvas: this.canvas,
      settings: { ...this.settings }
    };
  }

  getFrameCount() {
    return Math.ceil(
      this.settings.duration * this.settings.fps
    );
  }

  getFrameTimestamp(frameIndex) {
    if (
      !Number.isInteger(frameIndex) ||
      frameIndex < 0
    ) {
      throw new Error("Invalid frame index.");
    }

    return frameIndex / this.settings.fps;
  }

  async renderFrame(frameIndex) {
    if (!this.project || !this.settings) {
      throw new Error("Prepare export first.");
    }

    if (this.cancelled) {
      throw new Error("Export cancelled.");
    }

    const totalFrames = this.getFrameCount();

    if (frameIndex >= totalFrames) {
      throw new Error("Frame index exceeds export range.");
    }

    const timestamp = this.getFrameTimestamp(frameIndex);

    const graph = renderGraph.build(this.project, {
      time: timestamp
    });

    this.renderer.render(this.project, timestamp);

    const frame = {
      index: frameIndex,
      timestamp,
      duration: 1 / this.settings.fps,
      canvas: this.canvas,
      graph
    };

    this.emit("frame-rendered", {
      index: frameIndex,
      timestamp,
      totalFrames
    });

    return frame;
  }

  async renderAll(onFrame = null) {
    if (this.running) {
      throw new Error("Export is already running.");
    }

    if (!this.project || !this.settings) {
      throw new Error("Prepare export first.");
    }

    this.running = true;
    this.cancelled = false;

    const totalFrames = this.getFrameCount();

    try {
      for (
        let start = 0;
        start < totalFrames;
        start += this.options.frameBatchSize
      ) {
        if (this.cancelled) {
          throw new Error("Export cancelled.");
        }

        const batchEnd = Math.min(
          start + this.options.frameBatchSize,
          totalFrames
        );

        for (
          let index = start;
          index < batchEnd;
          index += 1
        ) {
          if (this.cancelled) {
            throw new Error("Export cancelled.");
          }

          const frame = await this.renderFrame(index);

          if (onFrame) {
            await onFrame(frame);
          }

          this.emit("progress", {
            completed: index + 1,
            total: totalFrames,
            percentage: Math.round(
              ((index + 1) / totalFrames) * 100
            )
          });
        }

        await new Promise(resolve =>
          setTimeout(resolve, 0)
        );
      }

      this.emit("complete", {
        totalFrames,
        duration: this.settings.duration
      });

      return {
        success: true,
        totalFrames,
        duration: this.settings.duration
      };
    } catch (error) {
      this.emit("error", {
        message: error.message
      });

      throw error;
    } finally {
      this.running = false;
    }
  }

  cancel() {
    this.cancelled = true;

    this.emit("cancelled");
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
    this.cancel();

    this.renderer.destroy();

    this.canvas = null;
    this.project = null;
    this.settings = null;

    this.listeners.clear();
  }
}

export const exportRenderer = new ExportRenderer();
