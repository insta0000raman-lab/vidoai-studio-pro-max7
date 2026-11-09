export class EncoderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "EncoderError";
    this.details = details;
  }
}

export class VideoEncoderEngine {
  constructor(options = {}) {
    this.options = {
      bitrate: 8_000_000,
      keyFrameInterval: 2,
      codec: "avc1.42001f",
      outputFormat: "video/mp4",
      ...options
    };

    this.encoder = null;
    this.muxer = null;
    this.ffmpeg = null;

    this.mode = null;
    this.state = "idle";
    this.listeners = new Set();

    this.frameCount = 0;
    this.error = null;
  }

  async detectCapabilities() {
    const webCodecsAvailable =
      typeof VideoEncoder !== "undefined" &&
      typeof VideoFrame !== "undefined";

    let webCodecsSupported = false;

    if (webCodecsAvailable) {
      try {
        const result = await VideoEncoder.isConfigSupported({
          codec: this.options.codec,
          width: 1280,
          height: 720,
          bitrate: this.options.bitrate,
          framerate: 30
        });

        webCodecsSupported = Boolean(result.supported);
      } catch {
        webCodecsSupported = false;
      }
    }

    return {
      webCodecsAvailable,
      webCodecsSupported,
      ffmpegAvailable: Boolean(this.ffmpeg),
      muxerAvailable: Boolean(this.muxer),
      mp4Ready:
        webCodecsSupported && Boolean(this.muxer),
      preferredEngine:
        webCodecsSupported && this.muxer
          ? "webcodecs"
          : this.ffmpeg
            ? "ffmpeg"
            : "unavailable"
    };
  }

  registerMuxer(muxerAdapter) {
    if (
      !muxerAdapter ||
      typeof muxerAdapter.addVideoChunk !== "function" ||
      typeof muxerAdapter.finalize !== "function"
    ) {
      throw new EncoderError(
        "Invalid MP4 muxer adapter."
      );
    }

    this.muxer = muxerAdapter;
  }

  registerFFmpeg(ffmpegAdapter) {
    if (
      !ffmpegAdapter ||
      typeof ffmpegAdapter.initialize !== "function" ||
      typeof ffmpegAdapter.encodeFrames !== "function"
    ) {
      throw new EncoderError(
        "Invalid FFmpeg adapter."
      );
    }

    this.ffmpeg = ffmpegAdapter;
  }

  async initialize(settings = {}) {
    if (this.state === "encoding") {
      throw new EncoderError(
        "Encoder is already running."
      );
    }

    this.settings = {
      width: Number(settings.width),
      height: Number(settings.height),
      fps: Number(settings.fps || 30),
      bitrate: Number(
        settings.bitrate || this.options.bitrate
      ),
      codec: settings.codec || this.options.codec,
      format: settings.format || this.options.outputFormat
    };

    if (
      !Number.isInteger(this.settings.width) ||
      !Number.isInteger(this.settings.height) ||
      this.settings.width <= 0 ||
      this.settings.height <= 0
    ) {
      throw new EncoderError("Invalid video dimensions.");
    }

    if (
      !Number.isFinite(this.settings.fps) ||
      this.settings.fps < 1 ||
      this.settings.fps > 120
    ) {
      throw new EncoderError("Invalid frame rate.");
    }

    this.frameCount = 0;
    this.error = null;

    const capabilities = await this.detectCapabilities();

    if (
      capabilities.webCodecsSupported &&
      this.muxer
    ) {
      await this.initializeWebCodecs();
      this.mode = "webcodecs";
    } else if (this.ffmpeg) {
      await this.ffmpeg.initialize(this.settings);
      this.mode = "ffmpeg";
    } else {
      throw new EncoderError(
        "No complete export engine is available.",
        {
          capabilities,
          reason:
            "WebCodecs needs a muxer. FFmpeg adapter is not connected."
        }
      );
    }

    this.state = "ready";

    this.emit("ready", {
      mode: this.mode,
      settings: this.settings
    });

    return {
      mode: this.mode,
      capabilities
    };
  }

  async initializeWebCodecs() {
    const config = {
      codec: this.settings.codec,
      width: this.settings.width,
      height: this.settings.height,
      bitrate: this.settings.bitrate,
      framerate: this.settings.fps,
      latencyMode: "quality",
      bitrateMode: "variable"
    };

    const support =
      await VideoEncoder.isConfigSupported(config);

    if (!support.supported) {
      throw new EncoderError(
        "Requested WebCodecs configuration is unsupported."
      );
    }

    await this.muxer.initialize?.({
      width: this.settings.width,
      height: this.settings.height,
      fps: this.settings.fps,
      codec: this.settings.codec,
      format: this.settings.format
    });

    this.encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        try {
          this.muxer.addVideoChunk(chunk, metadata);
        } catch (error) {
          this.error = error;
          this.emit("error", {
            message: error.message
          });
        }
      },

      error: error => {
        this.error = error;

        this.emit("error", {
          message: error.message
        });
      }
    });

    this.encoder.configure(config);
  }

  async encodeFrame(frameData) {
    if (this.state !== "ready" &&
        this.state !== "encoding") {
      throw new EncoderError(
        "Encoder is not ready."
      );
    }

    if (this.error) {
      throw this.error;
    }

    if (this.mode === "webcodecs") {
      return this.encodeWebCodecsFrame(frameData);
    }

    if (this.mode === "ffmpeg") {
      return this.ffmpeg.encodeFrames([frameData]);
    }

    throw new EncoderError("Unknown encoder mode.");
  }

  async encodeWebCodecsFrame(frameData) {
    const canvas = frameData.canvas;

    if (!canvas) {
      throw new EncoderError(
        "Frame canvas is missing."
      );
    }

    const timestamp = Math.round(
      frameData.timestamp * 1_000_000
    );

    const duration = Math.round(
      frameData.duration * 1_000_000
    );

    const frame = new VideoFrame(canvas, {
      timestamp,
      duration
    });

    try {
      this.state = "encoding";

      const keyFrame =
        this.frameCount %
        Math.max(
          1,
          Math.round(
            this.settings.fps *
            this.options.keyFrameInterval
          )
        ) === 0;

      this.encoder.encode(frame, {
        keyFrame
      });

      this.frameCount += 1;

      if (this.encoder.encodeQueueSize > 8) {
        await this.encoder.flush();
      }

      this.emit("frame-encoded", {
        frame: this.frameCount,
        timestamp: frameData.timestamp
      });

      return true;
    } finally {
      frame.close();
    }
  }

  async finalize() {
    if (this.error) {
      throw this.error;
    }

    if (this.mode === "webcodecs") {
      if (this.encoder) {
        await this.encoder.flush();
        this.encoder.close();
        this.encoder = null;
      }

      const result = await this.muxer.finalize();

      this.state = "completed";

      this.emit("complete", {
        mode: this.mode,
        frameCount: this.frameCount
      });

      return result;
    }

    if (this.mode === "ffmpeg") {
      const result = await this.ffmpeg.finalize();

      this.state = "completed";

      this.emit("complete", {
        mode: this.mode,
        frameCount: this.frameCount
      });

      return result;
    }

    throw new EncoderError(
      "No active encoder to finalize."
    );
  }

  async cancel() {
    try {
      if (this.encoder) {
        this.encoder.close();
        this.encoder = null;
      }

      await this.muxer?.cancel?.();
      await this.ffmpeg?.cancel?.();
    } finally {
      this.state = "cancelled";
      this.emit("cancelled");
    }
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
    if (this.encoder) {
      this.encoder.close();
      this.encoder = null;
    }

    this.state = "destroyed";
    this.listeners.clear();

    this.muxer = null;
    this.ffmpeg = null;
  }
}

export const videoEncoderEngine =
  new VideoEncoderEngine();
