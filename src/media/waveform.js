const DEFAULT_OPTIONS = {
  samples: 1200,
  channel: 0,
  normalize: true,
  smoothing: 0
};

class WaveformGenerator {
  constructor() {
    this.context = null;
    this.cache = new Map();
    this.pending = new Map();
  }

  async getAudioContext() {
    if (this.context && this.context.state !== "closed") {
      return this.context;
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported");
    }

    this.context = new AudioContextClass();

    return this.context;
  }

  async resumeContext() {
    const context = await this.getAudioContext();

    if (context.state === "suspended") {
      await context.resume();
    }

    return context;
  }

  async generate(file, options = {}) {
    if (!(file instanceof Blob)) {
      throw new TypeError("A valid audio file is required");
    }

    const settings = {
      ...DEFAULT_OPTIONS,
      ...options
    };

    settings.samples = Math.max(
      1,
      Math.min(10000, Math.floor(settings.samples))
    );

    const cacheKey = this.createCacheKey(file, settings);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.pending.has(cacheKey)) {
      return this.pending.get(cacheKey);
    }

    const task = this.decodeAndGenerate(file, settings)
      .then(result => {
        this.cache.set(cacheKey, result);
        return result;
      })
      .finally(() => {
        this.pending.delete(cacheKey);
      });

    this.pending.set(cacheKey, task);

    return task;
  }

  async decodeAndGenerate(file, options) {
    const context = await this.getAudioContext();

    const buffer = await file.arrayBuffer();

    let audioBuffer;

    try {
      audioBuffer = await context.decodeAudioData(buffer.slice(0));
    } catch (error) {
      throw new Error(
        "Could not decode audio. The format may not be supported."
      );
    }

    const channelIndex = Math.max(
      0,
      Math.min(
        audioBuffer.numberOfChannels - 1,
        Math.floor(options.channel)
      )
    );

    const channelData = audioBuffer.getChannelData(channelIndex);

    const samples = this.extractPeaks(
      channelData,
      options.samples,
      options.smoothing
    );

    const maximum = samples.reduce(
      (max, value) => Math.max(max, value),
      0
    );

    const normalized = options.normalize && maximum > 0
      ? samples.map(value => value / maximum)
      : samples;

    return {
      samples: normalized,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
      channel: channelIndex,
      peak: maximum,
      generatedAt: new Date().toISOString()
    };
  }

  extractPeaks(data, count, smoothing = 0) {
    const result = new Float32Array(count);
    const blockSize = data.length / count;

    let previous = 0;

    for (let i = 0; i < count; i++) {
      const start = Math.floor(i * blockSize);
      const end = Math.min(
        data.length,
        Math.floor((i + 1) * blockSize)
      );

      let peak = 0;

      for (let j = start; j < end; j++) {
        const value = Math.abs(data[j]);

        if (value > peak) {
          peak = value;
        }
      }

      const factor = Math.max(
        0,
        Math.min(1, smoothing)
      );

      const smoothed =
        previous * factor + peak * (1 - factor);

      result[i] = smoothed;
      previous = smoothed;
    }

    return result;
  }

  createCacheKey(file, options) {
    return [
      file.name || "audio",
      file.size,
      file.lastModified || 0,
      options.samples,
      options.channel,
      options.normalize,
      options.smoothing
    ].join(":");
  }

  getSampleAt(waveform, progress) {
    if (!waveform?.samples?.length) return 0;

    const position = Math.max(
      0,
      Math.min(1, progress)
    );

    const index = Math.min(
      waveform.samples.length - 1,
      Math.floor(position * waveform.samples.length)
    );

    return waveform.samples[index];
  }

  getRange(waveform, start, end) {
    if (!waveform?.samples?.length) {
      return new Float32Array(0);
    }

    const length = waveform.samples.length;

    const from = Math.max(
      0,
      Math.min(length, Math.floor(start * length))
    );

    const to = Math.max(
      from,
      Math.min(length, Math.ceil(end * length))
    );

    return waveform.samples.slice(from, to);
  }

  clearCache(file = null) {
    if (!file) {
      this.cache.clear();
      return;
    }

    const prefix = [
      file.name || "audio",
      file.size,
      file.lastModified || 0
    ].join(":");

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  getCacheStats() {
    return {
      entries: this.cache.size,
      pending: this.pending.size
    };
  }

  async close() {
    this.cache.clear();
    this.pending.clear();

    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }

    this.context = null;
  }
}

export const waveformGenerator = new WaveformGenerator();

export {
  DEFAULT_OPTIONS
};
