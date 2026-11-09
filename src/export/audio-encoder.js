export class AudioEncoderEngine {
  constructor(options = {}) {
    this.encoder = null;
    this.state = "idle";
    this.config = {
      codec: options.codec || "mp4a.40.2",
      sampleRate: options.sampleRate || 48000,
      numberOfChannels: options.numberOfChannels || 2,
      bitrate: options.bitrate || 192000
    };

    this.onChunk = options.onChunk || (() => {});
    this.onError = options.onError || (() => {});
    this.encodedChunks = 0;
    this.timestampOffset = 0;
  }

  static isSupported() {
    return typeof AudioEncoder !== "undefined" &&
      typeof AudioData !== "undefined";
  }

  async checkSupport(config = this.config) {
    if (!AudioEncoderEngine.isSupported()) {
      return {
        supported: false,
        reason: "WebCodecs AudioEncoder is unavailable."
      };
    }

    try {
      const result = await AudioEncoder.isConfigSupported({
        codec: config.codec,
        sampleRate: config.sampleRate,
        numberOfChannels: config.numberOfChannels,
        bitrate: config.bitrate
      });

      return {
        supported: Boolean(result.supported),
        config: result.config || null,
        reason: result.supported
          ? null
          : "This AAC configuration is unsupported."
      };
    } catch (error) {
      return {
        supported: false,
        reason: error.message
      };
    }
  }

  async initialize(options = {}) {
    if (this.state === "encoding" || this.state === "ready") {
      await this.close();
    }

    this.config = {
      ...this.config,
      ...options
    };

    const support = await this.checkSupport(this.config);

    if (!support.supported) {
      throw new Error(support.reason);
    }

    this.encoder = new AudioEncoder({
      output: (chunk, metadata) => {
        this.encodedChunks++;

        try {
          this.onChunk(chunk, metadata);
        } catch (error) {
          this.onError(error);
        }
      },

      error: error => {
        this.state = "error";
        this.onError(error);
      }
    });

    this.encoder.configure({
      codec: this.config.codec,
      sampleRate: this.config.sampleRate,
      numberOfChannels: this.config.numberOfChannels,
      bitrate: this.config.bitrate
    });

    this.state = "ready";
    this.encodedChunks = 0;
    this.timestampOffset = 0;

    return {
      success: true,
      config: this.config
    };
  }

  async encodeAudioBuffer(audioBuffer, options = {}) {
    if (this.state !== "ready" && this.state !== "encoding") {
      throw new Error("Audio encoder is not ready.");
    }

    if (!(audioBuffer instanceof AudioBuffer)) {
      throw new TypeError("A valid AudioBuffer is required.");
    }

    if (audioBuffer.length === 0) {
      return false;
    }

    const channels = Math.min(
      audioBuffer.numberOfChannels,
      this.config.numberOfChannels
    );

    const frames = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    const planarData = new Float32Array(frames * channels);

    for (let channel = 0; channel < channels; channel++) {
      const source = audioBuffer.getChannelData(channel);

      planarData.set(
        source,
        channel * frames
      );
    }

    const timestamp = Math.round(
      (options.timestamp ?? this.timestampOffset) * 1000000
    );

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp,
      data: planarData
    });

    try {
      this.encoder.encode(audioData);
      this.state = "encoding";

      this.timestampOffset =
        (timestamp / 1000000) + (frames / sampleRate);

      return true;
    } finally {
      audioData.close();
    }
  }

  async encodeFromAudioBuffer(audioBuffer, options = {}) {
    const chunkSeconds = options.chunkSeconds || 1;
    const sampleRate = audioBuffer.sampleRate;
    const framesPerChunk = Math.max(
      1,
      Math.floor(sampleRate * chunkSeconds)
    );

    let frameOffset = 0;
    let chunkCount = 0;

    while (frameOffset < audioBuffer.length) {
      if (options.signal?.aborted) {
        throw new Error("Audio encoding cancelled.");
      }

      const length = Math.min(
        framesPerChunk,
        audioBuffer.length - frameOffset
      );

      const channels = audioBuffer.numberOfChannels;
      const part = new AudioBuffer({
        length,
        numberOfChannels: channels,
        sampleRate
      });

      for (let channel = 0; channel < channels; channel++) {
        const source = audioBuffer.getChannelData(channel);

        part.copyTo
          ? null
          : part.getChannelData(channel).set(
              source.subarray(frameOffset, frameOffset + length)
            );
      }

      await this.encodeAudioBuffer(part, {
        timestamp: options.startTime
          ? options.startTime + frameOffset / sampleRate
          : frameOffset / sampleRate
      });

      frameOffset += length;
      chunkCount++;

      options.onProgress?.({
        progress: frameOffset / audioBuffer.length,
        processedFrames: frameOffset,
        totalFrames: audioBuffer.length,
        chunks: chunkCount
      });

      if (this.encoder?.encodeQueueSize > 8) {
        await this.waitForQueue();
      }
    }

    return {
      success: true,
      chunks: chunkCount,
      duration: audioBuffer.duration
    };
  }

  async waitForQueue() {
    if (!this.encoder) return;

    while (
      this.encoder.state === "configured" &&
      this.encoder.encodeQueueSize > 4
    ) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async flush() {
    if (!this.encoder) return false;

    if (this.encoder.state === "configured") {
      await this.encoder.flush();
    }

    this.state = "ready";

    return {
      success: true,
      encodedChunks: this.encodedChunks
    };
  }

  async finalize() {
    if (!this.encoder) {
      return {
        success: false,
        reason: "Encoder was not initialized."
      };
    }

    try {
      await this.flush();

      this.encoder.close();
      this.encoder = null;
      this.state = "closed";

      return {
        success: true,
        encodedChunks: this.encodedChunks
      };
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }

  async cancel() {
    if (this.encoder) {
      try {
        this.encoder.reset();
        this.encoder.close();
      } catch {}
    }

    this.encoder = null;
    this.state = "cancelled";
    this.encodedChunks = 0;
    this.timestampOffset = 0;

    return true;
  }

  async close() {
    if (!this.encoder) {
      this.state = "closed";
      return;
    }

    try {
      if (this.encoder.state === "configured") {
        await this.encoder.flush();
      }
    } finally {
      this.encoder.close();
      this.encoder = null;
      this.state = "closed";
    }
  }

  getStatus() {
    return {
      state: this.state,
      encodedChunks: this.encodedChunks,
      queueSize: this.encoder?.encodeQueueSize ?? 0,
      config: { ...this.config }
    };
  }
}

export default AudioEncoderEngine;
