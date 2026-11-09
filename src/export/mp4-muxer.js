export class MP4MuxerAdapter {
  constructor(options = {}) {
    this.Muxer = options.Muxer || null;
    this.ArrayBufferTarget = options.ArrayBufferTarget || null;

    this.muxer = null;
    this.target = null;
    this.initialized = false;
    this.finalized = false;
    this.videoTrack = false;
    this.audioTrack = false;
    this.listeners = new Set();

    this.config = {
      width: 1080,
      height: 1920,
      fps: 30,
      videoCodec: "avc",
      audioCodec: "aac",
      fastStart: "in-memory",
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

  configure(config = {}) {
    if (this.initialized) {
      throw new Error("Cannot configure an active muxer");
    }

    this.config = {
      ...this.config,
      ...config
    };

    return this.config;
  }

  validateConfig() {
    const { width, height, fps } = this.config;

    if (!Number.isInteger(width) || width <= 0) {
      throw new Error("Invalid video width");
    }

    if (!Number.isInteger(height) || height <= 0) {
      throw new Error("Invalid video height");
    }

    if (!Number.isFinite(fps) || fps <= 0 || fps > 120) {
      throw new Error("Invalid frame rate");
    }

    return true;
  }

  async initialize(options = {}) {
    if (this.initialized) {
      throw new Error("Muxer already initialized");
    }

    this.configure(options);
    this.validateConfig();

    if (!this.Muxer || !this.ArrayBufferTarget) {
      throw new Error(
        "MP4 muxer library is not connected. Provide Muxer and ArrayBufferTarget."
      );
    }

    try {
      this.target = new this.ArrayBufferTarget();

      const tracks = [];

      if (options.video !== false) {
        tracks.push({
          codec: this.config.videoCodec,
          width: this.config.width,
          height: this.config.height
        });

        this.videoTrack = true;
      }

      if (options.audio === true) {
        tracks.push({
          codec: this.config.audioCodec,
          numberOfChannels: options.numberOfChannels || 2,
          sampleRate: options.sampleRate || 48000
        });

        this.audioTrack = true;
      }

      if (!tracks.length) {
        throw new Error("At least one MP4 track is required");
      }

      const muxerOptions = {
        target: this.target,
        fastStart: this.config.fastStart,
        video: this.videoTrack ? tracks[0] : undefined,
        audio: this.audioTrack
          ? tracks[this.videoTrack ? 1 : 0]
          : undefined
      };

      this.muxer = new this.Muxer(muxerOptions);

      this.initialized = true;
      this.finalized = false;

      this.emit("initialized", {
        video: this.videoTrack,
        audio: this.audioTrack
      });

      return true;
    } catch (error) {
      this.reset();
      throw error;
    }
  }

  addVideoChunk(chunk, metadata = undefined) {
    this.ensureReady();

    if (!this.videoTrack) {
      throw new Error("Video track is not enabled");
    }

    if (!chunk || typeof chunk.timestamp !== "number") {
      throw new Error("Invalid encoded video chunk");
    }

    this.muxer.addVideoChunk(chunk, metadata);

    this.emit("video-chunk-added", {
      timestamp: chunk.timestamp,
      duration: chunk.duration || 0,
      byteLength: chunk.byteLength || 0
    });
  }

  addAudioChunk(chunk, metadata = undefined) {
    this.ensureReady();

    if (!this.audioTrack) {
      throw new Error("Audio track is not enabled");
    }

    if (!chunk || typeof chunk.timestamp !== "number") {
      throw new Error("Invalid encoded audio chunk");
    }

    this.muxer.addAudioChunk(chunk, metadata);

    this.emit("audio-chunk-added", {
      timestamp: chunk.timestamp,
      duration: chunk.duration || 0,
      byteLength: chunk.byteLength || 0
    });
  }

  addVideoDecoderConfig(config) {
    this.ensureReady();

    if (!this.videoTrack) {
      throw new Error("Video track is not enabled");
    }

    this.muxer.addVideoChunk(
      null,
      { decoderConfig: config }
    );
  }

  addAudioDecoderConfig(config) {
    this.ensureReady();

    if (!this.audioTrack) {
      throw new Error("Audio track is not enabled");
    }

    this.muxer.addAudioChunk(
      null,
      { decoderConfig: config }
    );
  }

  ensureReady() {
    if (!this.initialized || !this.muxer) {
      throw new Error("Muxer is not initialized");
    }

    if (this.finalized) {
      throw new Error("Muxer is already finalized");
    }
  }

  finalize() {
    this.ensureReady();

    try {
      this.muxer.finalize();

      const buffer = this.target.buffer;

      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
        throw new Error("MP4 output is empty or invalid");
      }

      const blob = new Blob(
        [buffer],
        { type: "video/mp4" }
      );

      this.finalized = true;

      this.emit("finalized", {
        size: blob.size,
        type: blob.type
      });

      return blob;
    } catch (error) {
      this.emit("error", {
        message: error.message
      });

      throw error;
    }
  }

  getStatus() {
    return {
      initialized: this.initialized,
      finalized: this.finalized,
      videoTrack: this.videoTrack,
      audioTrack: this.audioTrack,
      size: this.target?.buffer?.byteLength || 0
    };
  }

  reset() {
    this.muxer = null;
    this.target = null;
    this.initialized = false;
    this.finalized = false;
    this.videoTrack = false;
    this.audioTrack = false;
  }

  destroy() {
    this.reset();
    this.listeners.clear();
  }
}

export const mp4Muxer = new MP4MuxerAdapter();
