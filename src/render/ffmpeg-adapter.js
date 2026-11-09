export class FFmpegAdapter {
  constructor(options = {}) {
    this.ffmpeg = options.ffmpeg || null;
    this.loadFFmpeg = options.loadFFmpeg || null;
    this.loaded = false;
    this.loading = null;
    this.initialized = false;
    this.state = "idle";
    this.frames = [];
    this.audioFiles = [];
    this.outputName = "zero-x-export.mp4";
    this.listeners = new Set();

    this.config = {
      width: 1080,
      height: 1920,
      fps: 30,
      quality: 23,
      format: "mp4",
      ...options.config
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(type, data = {}) {
    const event = {
      type,
      data,
      timestamp: Date.now()
    };

    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error(error);
      }
    });
  }

  setState(state, details = {}) {
    this.state = state;
    this.emit("state", { state, ...details });
  }

  setConfig(config = {}) {
    this.config = {
      ...this.config,
      ...config
    };

    this.validateConfig();
    return this.config;
  }

  validateConfig() {
    const { width, height, fps, quality } = this.config;

    if (!Number.isInteger(width) || width < 16 || width > 7680) {
      throw new Error("Invalid export width");
    }

    if (!Number.isInteger(height) || height < 16 || height > 7680) {
      throw new Error("Invalid export height");
    }

    if (!Number.isFinite(fps) || fps <= 0 || fps > 120) {
      throw new Error("Invalid export FPS");
    }

    if (!Number.isInteger(quality) || quality < 0 || quality > 51) {
      throw new Error("Invalid video quality value");
    }

    if (width % 2 !== 0 || height % 2 !== 0) {
      throw new Error("H.264 export dimensions must be even");
    }

    return true;
  }

  async load() {
    if (this.loaded) return true;
    if (this.loading) return this.loading;

    if (!this.ffmpeg && !this.loadFFmpeg) {
      throw new Error(
        "FFmpeg.wasm is not connected. Provide a loaded FFmpeg instance or loader."
      );
    }

    this.loading = (async () => {
      this.setState("loading");

      try {
        if (!this.ffmpeg) {
          this.ffmpeg = await this.loadFFmpeg();
        }

        if (!this.ffmpeg) {
          throw new Error("FFmpeg loader returned no instance");
        }

        if (typeof this.ffmpeg.load === "function") {
          if (!this.ffmpeg.loaded) {
            await this.ffmpeg.load();
          }
        }

        if (
          typeof this.ffmpeg.writeFile !== "function" ||
          typeof this.ffmpeg.exec !== "function" ||
          typeof this.ffmpeg.readFile !== "function"
        ) {
          throw new Error("Unsupported FFmpeg API instance");
        }

        this.loaded = true;
        this.setState("loaded");

        return true;
      } catch (error) {
        this.setState("error", { message: error.message });
        throw error;
      } finally {
        this.loading = null;
      }
    })();

    return this.loading;
  }

  async initialize(config = {}) {
    this.setConfig(config);
    await this.load();

    this.frames = [];
    this.audioFiles = [];
    this.initialized = true;

    this.setState("ready");
    return true;
  }

  async addFrame(frame, timestamp) {
    if (!this.initialized) {
      throw new Error("FFmpeg adapter is not initialized");
    }

    if (!(frame instanceof Blob)) {
      throw new Error("Frame must be a Blob");
    }

    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new Error("Invalid frame timestamp");
    }

    if (frame.size === 0) {
      throw new Error("Empty frame received");
    }

    const index = this.frames.length;

    this.frames.push({
      blob: frame,
      timestamp,
      index
    });

    this.emit("frame-added", {
      index,
      timestamp,
      size: frame.size
    });

    return index;
  }

  async addAudio(blob, options = {}) {
    if (!this.initialized) {
      throw new Error("FFmpeg adapter is not initialized");
    }

    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("Valid audio Blob required");
    }

    const item = {
      blob,
      type: blob.type,
      start: options.start || 0,
      volume: options.volume ?? 1,
      id: this.audioFiles.length
    };

    this.audioFiles.push(item);
    return item.id;
  }

  async writeFrames() {
    if (!this.frames.length) {
      throw new Error("No frames available for export");
    }

    const sorted = [...this.frames].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    for (let i = 0; i < sorted.length; i++) {
      const frame = sorted[i];

      const extension =
        frame.blob.type.includes("png") ? "png" : "jpg";

      const filename =
        `frame_${String(i).padStart(8, "0")}.${extension}`;

      const bytes = new Uint8Array(
        await frame.blob.arrayBuffer()
      );

      await this.ffmpeg.writeFile(filename, bytes);

      this.emit("write-progress", {
        current: i + 1,
        total: sorted.length,
        progress: (i + 1) / sorted.length
      });
    }

    return sorted;
  }

  async writeAudio() {
    for (let i = 0; i < this.audioFiles.length; i++) {
      const audio = this.audioFiles[i];
      const extension = audio.type.includes("wav")
        ? "wav"
        : audio.type.includes("ogg")
          ? "ogg"
          : "mp3";

      const filename = `audio_${i}.${extension}`;

      await this.ffmpeg.writeFile(
        filename,
        new Uint8Array(await audio.blob.arrayBuffer())
      );

      audio.filename = filename;
    }
  }

  buildArguments(frameCount) {
    const { width, height, fps, quality } = this.config;

    return [
      "-framerate", String(fps),
      "-i", "frame_%08d.jpg",
      "-vf", `scale=${width}:${height}`,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", String(quality),
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-frames:v", String(frameCount),
      this.outputName
    ];
  }

  async export(options = {}) {
    if (!this.initialized) {
      throw new Error("Initialize the adapter before exporting");
    }

    if (this.state === "encoding") {
      throw new Error("An export is already running");
    }

    this.outputName = options.outputName || this.outputName;

    if (!/^[a-zA-Z0-9._-]+\.mp4$/.test(this.outputName)) {
      throw new Error("Invalid output filename");
    }

    this.validateConfig();
    this.setState("encoding");

    try {
      const sorted = await this.writeFrames();

      if (sorted.some(frame => !frame.blob.type.includes("jpeg"))) {
        throw new Error(
          "This basic adapter currently requires JPEG frames. PNG frame conversion must be added before export."
        );
      }

      await this.writeAudio();

      const args = this.buildArguments(sorted.length);

      this.emit("export-started", {
        frameCount: sorted.length,
        outputName: this.outputName
      });

      await this.ffmpeg.exec(args);

      const output = await this.ffmpeg.readFile(
        this.outputName
      );

      if (!output || output.length === 0) {
        throw new Error("FFmpeg produced an empty output");
      }

      const blob = new Blob(
        [output],
        { type: "video/mp4" }
      );

      this.setState("completed", {
        size: blob.size
      });

      this.emit("export-completed", {
        size: blob.size,
        outputName: this.outputName
      });

      return blob;
    } catch (error) {
      this.setState("error", {
        message: error.message
      });

      this.emit("export-failed", {
        message: error.message
      });

      throw error;
    }
  }

  cancel() {
    if (this.state !== "encoding") return false;

    if (typeof this.ffmpeg?.terminate === "function") {
      this.ffmpeg.terminate();
    }

    this.initialized = false;
    this.loaded = false;
    this.frames = [];
    this.audioFiles = [];

    this.setState("cancelled");
    return true;
  }

  reset() {
    this.frames = [];
    this.audioFiles = [];
    this.initialized = false;
    this.setState("idle");
  }

  getStatus() {
    return {
      state: this.state,
      loaded: this.loaded,
      initialized: this.initialized,
      frameCount: this.frames.length,
      audioCount: this.audioFiles.length
    };
  }

  destroy() {
    this.reset();
    this.listeners.clear();
  }
}

export const ffmpegAdapter = new FFmpegAdapter();
