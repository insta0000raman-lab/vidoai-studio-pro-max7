import { APP_CONFIG } from "../config.js";
import { notifications } from "../core/notifications.js";

export class ExportManager {
  constructor(options = {}) {
    this.renderer = options.renderer || null;
    this.videoEncoder = options.videoEncoder || null;
    this.audioEncoder = options.audioEncoder || null;
    this.muxer = options.muxer || null;
    this.ffmpeg = options.ffmpeg || null;

    this.state = "idle";
    this.cancelRequested = false;
    this.currentJob = null;
    this.outputBlob = null;

    this.listeners = new Set();

    this.settings = {
      width: 1080,
      height: 1920,
      fps: 30,
      bitrate: 8000000,
      audioBitrate: 192000,
      format: "mp4",
      includeAudio: true,
      ...options.settings
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(type, details = {}) {
    const event = {
      type,
      state: this.state,
      timestamp: Date.now(),
      ...details
    };

    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error("Export listener error:", error);
      }
    });
  }

  setDependencies(dependencies = {}) {
    Object.assign(this, dependencies);
  }

  updateSettings(settings = {}) {
    this.settings = {
      ...this.settings,
      ...settings
    };

    return { ...this.settings };
  }

  validateSettings(settings = this.settings) {
    const errors = [];

    if (!Number.isInteger(settings.width) || settings.width < 2) {
      errors.push("Invalid export width.");
    }

    if (!Number.isInteger(settings.height) || settings.height < 2) {
      errors.push("Invalid export height.");
    }

    if (!Number.isFinite(settings.fps) || settings.fps <= 0) {
      errors.push("Invalid frame rate.");
    }

    if (!Number.isFinite(settings.bitrate) || settings.bitrate <= 0) {
      errors.push("Invalid video bitrate.");
    }

    if (!["mp4"].includes(settings.format)) {
      errors.push("Unsupported export format.");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async checkCapabilities() {
    const videoSupported =
      typeof VideoEncoder !== "undefined" &&
      typeof VideoFrame !== "undefined";

    const audioSupported =
      typeof AudioEncoder !== "undefined" &&
      typeof AudioData !== "undefined";

    return {
      videoCodecsAvailable: videoSupported,
      audioCodecsAvailable: audioSupported,
      muxerAvailable: Boolean(this.muxer),
      ffmpegAvailable: Boolean(this.ffmpeg),
      primaryExportAvailable:
        videoSupported && Boolean(this.muxer),
      fallbackExportAvailable: Boolean(this.ffmpeg)
    };
  }

  async prepare(settings = {}) {
    const merged = {
      ...this.settings,
      ...settings
    };

    const validation = this.validateSettings(merged);

    if (!validation.valid) {
      throw new Error(validation.errors.join(" "));
    }

    const capabilities = await this.checkCapabilities();

    if (!capabilities.primaryExportAvailable &&
        !capabilities.fallbackExportAvailable) {
      throw new Error(
        "No supported export engine is connected."
      );
    }

    return {
      settings: merged,
      capabilities
    };
  }

  async start(options = {}) {
    if (this.state === "rendering" ||
        this.state === "encoding" ||
        this.state === "finalizing") {
      throw new Error("An export is already running.");
    }

    this.cancelRequested = false;
    this.outputBlob = null;

    const prepared = await this.prepare(options.settings);
    const settings = prepared.settings;

    this.currentJob = {
      id: `export-${Date.now()}`,
      startedAt: Date.now(),
      settings,
      progress: 0,
      stage: "preparing"
    };

    this.state = "preparing";
    this.emit("started", {
      job: this.currentJob,
      capabilities: prepared.capabilities
    });

    try {
      let result;

      if (prepared.capabilities.primaryExportAvailable) {
        result = await this.runPrimaryExport(
          settings,
          options
        );
      } else {
        result = await this.runFallbackExport(
          settings,
          options
        );
      }

      if (this.cancelRequested) {
        throw new Error("Export cancelled.");
      }

      this.outputBlob = result.blob;
      this.state = "completed";

      const completed = {
        success: true,
        blob: result.blob,
        filename: this.createFilename(options.filename),
        duration: Date.now() - this.currentJob.startedAt,
        settings,
        engine: result.engine
      };

      this.emit("completed", completed);
      notifications.success("Export completed.");

      options.onComplete?.(completed);

      return completed;
    } catch (error) {
      const cancelled = this.cancelRequested;

      this.state = cancelled ? "cancelled" : "error";

      this.emit(cancelled ? "cancelled" : "error", {
        message: error.message
      });

      if (!cancelled) {
        notifications.error(`Export failed: ${error.message}`);
      }

      options.onError?.(error);

      throw error;
    } finally {
      this.currentJob = null;
    }
  }

  async runPrimaryExport(settings, options) {
    this.assertDependencies([
      ["renderer", this.renderer],
      ["videoEncoder", this.videoEncoder],
      ["muxer", this.muxer]
    ]);

    this.state = "rendering";
    this.updateStage("rendering");

    const renderResult = await this.renderer.renderAll({
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      signal: options.signal,
      onProgress: progress => {
        this.reportProgress(0.05 + progress * 0.55, {
          stage: "rendering"
        });
      }
    });

    this.checkCancelled();

    if (!renderResult?.frames?.length) {
      throw new Error("Renderer produced no frames.");
    }

    this.state = "encoding";
    this.updateStage("encoding");

    await this.videoEncoder.initialize({
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      bitrate: settings.bitrate
    });

    await this.muxer.initialize({
      width: settings.width,
      height: settings.height,
      frameRate: settings.fps
    });

    this.videoEncoder.onChunk = (chunk, metadata) => {
      this.muxer.addVideoChunk(chunk, metadata);
    };

    const totalFrames = renderResult.frames.length;

    for (let index = 0; index < totalFrames; index++) {
      this.checkCancelled();

      const frame = renderResult.frames[index];

      await this.videoEncoder.encodeFrame(
        frame,
        index / settings.fps
      );

      this.reportProgress(
        0.60 + ((index + 1) / totalFrames) * 0.25,
        { stage: "encoding", frame: index + 1, totalFrames }
      );
    }

    await this.videoEncoder.finalize();

    this.checkCancelled();

    this.state = "finalizing";
    this.updateStage("finalizing");

    await this.muxer.finalize();

    const blob = this.muxer.getBlob?.();

    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("MP4 muxer did not produce a valid file.");
    }

    this.reportProgress(1, { stage: "completed" });

    return {
      blob,
      engine: "webcodecs"
    };
  }

  async runFallbackExport(settings, options) {
    this.assertDependencies([
      ["renderer", this.renderer],
      ["ffmpeg", this.ffmpeg]
    ]);

    this.state = "rendering";
    this.updateStage("rendering");

    const renderResult = await this.renderer.renderAll({
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      signal: options.signal,
      onProgress: progress => {
        this.reportProgress(progress * 0.65, {
          stage: "rendering"
        });
      }
    });

    this.checkCancelled();

    if (!renderResult?.frames?.length) {
      throw new Error("Renderer produced no frames.");
    }

    this.state = "encoding";
    this.updateStage("encoding");

    const result = await this.ffmpeg.encodeFrames(
      renderResult.frames,
      {
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        bitrate: settings.bitrate,
        signal: options.signal,
        onProgress: progress => {
          this.reportProgress(
            0.65 + progress * 0.35,
            { stage: "encoding" }
          );
        }
      }
    );

    this.checkCancelled();

    if (!(result?.blob instanceof Blob) || result.blob.size === 0) {
      throw new Error("FFmpeg did not produce a valid file.");
    }

    return {
      blob: result.blob,
      engine: "ffmpeg"
    };
  }

  assertDependencies(items) {
    for (const [name, dependency] of items) {
      if (!dependency) {
        throw new Error(`${name} is not connected.`);
      }
    }
  }

  checkCancelled() {
    if (this.cancelRequested) {
      throw new Error("Export cancelled.");
    }
  }

  updateStage(stage) {
    if (this.currentJob) {
      this.currentJob.stage = stage;
    }

    this.emit("stage", { stage });
  }

  reportProgress(progress, details = {}) {
    const value = Math.max(0, Math.min(1, progress));

    if (this.currentJob) {
      this.currentJob.progress = value;
    }

    this.emit("progress", {
      progress: value,
      percentage: Math.round(value * 100),
      ...details
    });
  }

  async cancel() {
    if (!this.currentJob) return false;

    this.cancelRequested = true;

    try {
      await this.renderer?.cancel?.();
      await this.videoEncoder?.cancel?.();
      await this.audioEncoder?.cancel?.();
      await this.ffmpeg?.cancel?.();
      await this.muxer?.cancel?.();
    } catch (error) {
      console.warn("Export cancellation cleanup:", error);
    }

    this.emit("cancel-requested");

    return true;
  }

  createFilename(customName) {
    const safeName = (customName || "zero-x-motion")
      .trim()
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-");

    return `${safeName || "zero-x-motion"}.mp4`;
  }

  download(blob, filename = "zero-x-motion.mp4") {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("No valid export file is available.");
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 30000);

    return true;
  }

  getStatus() {
    return {
      state: this.state,
      job: this.currentJob
        ? { ...this.currentJob }
        : null,
      hasOutput: Boolean(this.outputBlob),
      outputSize: this.outputBlob?.size || 0
    };
  }

  destroy() {
    this.cancelRequested = true;
    this.listeners.clear();
    this.currentJob = null;
    this.outputBlob = null;
    this.state = "destroyed";
  }
}

export const exportManager = new ExportManager();

export default exportManager;
