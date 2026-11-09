import { eventBus } from "../core/event-bus.js";
import { mediaCache } from "../media/media-cache.js";

class AudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.sources = new Map();
    this.buffers = new Map();
    this.playing = false;
    this.muted = false;
    this.masterVolume = 1;
    this.startTime = 0;
    this.timelinePosition = 0;
    this.animationFrame = null;
    this.listeners = new Set();
  }

  async initialize() {
    if (this.context) {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      return this.context;
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported.");
    }

    this.context = new AudioContextClass();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.context.destination);

    await this.context.resume();

    eventBus.emit("AUDIO_ENGINE_READY");
    return this.context;
  }

  async loadAudio(id, fileOrUrl) {
    await this.initialize();

    let arrayBuffer;

    if (fileOrUrl instanceof Blob) {
      arrayBuffer = await fileOrUrl.arrayBuffer();
    } else {
      const response = await fetch(fileOrUrl);

      if (!response.ok) {
        throw new Error("Audio file could not be loaded.");
      }

      arrayBuffer = await response.arrayBuffer();
    }

    const buffer = await this.context.decodeAudioData(
      arrayBuffer.slice(0)
    );

    this.buffers.set(id, buffer);

    eventBus.emit("AUDIO_BUFFER_LOADED", {
      id,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels
    });

    return buffer;
  }

  addTrack(id, options = {}) {
    if (!this.context) {
      throw new Error("Initialize audio engine first.");
    }

    if (this.sources.has(id)) {
      this.removeTrack(id);
    }

    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();

    gain.gain.value = this.normalizeVolume(
      options.volume ?? 1
    );

    pan.pan.value = Math.max(
      -1,
      Math.min(1, Number(options.pan) || 0)
    );

    gain.connect(pan);
    pan.connect(this.masterGain);

    this.sources.set(id, {
      gain,
      pan,
      buffer: this.buffers.get(id) || null,
      source: null,
      offset: 0,
      startAt: 0,
      duration: 0,
      muted: false,
      volume: options.volume ?? 1,
      panValue: options.pan ?? 0,
      fadeIn: 0,
      fadeOut: 0
    });

    return id;
  }

  setBuffer(id, buffer) {
    const track = this.sources.get(id);

    if (!track) {
      throw new Error("Audio track not found.");
    }

    if (!buffer || typeof buffer.duration !== "number") {
      throw new Error("Invalid audio buffer.");
    }

    track.buffer = buffer;
    this.buffers.set(id, buffer);
    track.duration = buffer.duration;

    return true;
  }

  createSource(id, offset = 0) {
    const track = this.sources.get(id);

    if (!track || !track.buffer) {
      throw new Error("Audio buffer is not available.");
    }

    const source = this.context.createBufferSource();
    source.buffer = track.buffer;

    source.connect(track.gain);

    source.onended = () => {
      if (track.source === source) {
        track.source = null;
        eventBus.emit("AUDIO_TRACK_ENDED", { id });
      }
    };

    track.source = source;
    track.offset = Math.max(
      0,
      Math.min(offset, track.buffer.duration)
    );

    return source;
  }

  async play(position = this.timelinePosition) {
    await this.initialize();

    if (this.playing) {
      this.pause();
    }

    const currentPosition = Math.max(0, Number(position) || 0);
    this.timelinePosition = currentPosition;

    for (const [id, track] of this.sources) {
      if (!track.buffer) continue;

      const source = this.createSource(id, currentPosition);

      if (track.muted || this.muted) {
        track.gain.gain.setValueAtTime(
          0,
          this.context.currentTime
        );
      } else {
        this.applyTrackVolume(track);
      }

      const duration = track.buffer.duration - currentPosition;

      if (duration <= 0) {
        track.source = null;
        continue;
      }

      track.startAt = currentPosition;

      source.start(
        0,
        currentPosition,
        duration
      );
    }

    this.playing = true;
    this.startTime = this.context.currentTime;
    this.startPosition = currentPosition;

    this.startClock();

    eventBus.emit("AUDIO_PLAY", {
      position: currentPosition
    });
  }

  pause() {
    if (!this.context || !this.playing) return;

    this.timelinePosition = this.getCurrentPosition();
    this.stopSources();

    this.playing = false;
    this.stopClock();

    eventBus.emit("AUDIO_PAUSE", {
      position: this.timelinePosition
    });
  }

  stop() {
    this.stopSources();

    this.playing = false;
    this.timelinePosition = 0;

    this.stopClock();

    eventBus.emit("AUDIO_STOP");
  }

  seek(position) {
    const nextPosition = Math.max(0, Number(position) || 0);
    const wasPlaying = this.playing;

    if (wasPlaying) {
      this.stopSources();
      this.playing = false;
      this.stopClock();
    }

    this.timelinePosition = nextPosition;

    if (wasPlaying) {
      this.play(nextPosition).catch(error => {
        eventBus.emit("AUDIO_ERROR", {
          message: error.message
        });
      });
    }

    eventBus.emit("AUDIO_SEEK", {
      position: nextPosition
    });

    return nextPosition;
  }

  stopSources() {
    for (const track of this.sources.values()) {
      if (track.source) {
        const source = track.source;
        track.source = null;

        try {
          source.stop();
          source.disconnect();
        } catch (_) {
          // Source may already have stopped.
        }
      }
    }
  }

  setVolume(id, volume) {
    const track = this.sources.get(id);

    if (!track) throw new Error("Track not found.");

    track.volume = this.normalizeVolume(volume);
    this.applyTrackVolume(track);

    eventBus.emit("AUDIO_VOLUME_CHANGED", {
      id,
      volume: track.volume
    });
  }

  setMasterVolume(volume) {
    this.masterVolume = this.normalizeVolume(volume);

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume,
        this.context.currentTime,
        0.015
      );
    }
  }

  applyTrackVolume(track) {
    const volume = track.muted || this.muted
      ? 0
      : track.volume;

    track.gain.gain.setTargetAtTime(
      volume,
      this.context.currentTime,
      0.015
    );
  }

  muteTrack(id, muted = true) {
    const track = this.sources.get(id);

    if (!track) return false;

    track.muted = Boolean(muted);
    this.applyTrackVolume(track);

    return true;
  }

  muteAll(muted = true) {
    this.muted = Boolean(muted);

    for (const track of this.sources.values()) {
      this.applyTrackVolume(track);
    }

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume,
        this.context.currentTime,
        0.015
      );
    }
  }

  setPan(id, value) {
    const track = this.sources.get(id);

    if (!track) throw new Error("Track not found.");

    track.panValue = Math.max(
      -1,
      Math.min(1, Number(value) || 0)
    );

    track.pan.pan.setTargetAtTime(
      track.panValue,
      this.context.currentTime,
      0.015
    );
  }

  setFade(id, fadeIn = 0, fadeOut = 0) {
    const track = this.sources.get(id);

    if (!track) throw new Error("Track not found.");

    track.fadeIn = Math.max(0, Number(fadeIn) || 0);
    track.fadeOut = Math.max(0, Number(fadeOut) || 0);
  }

  normalizeVolume(value) {
    return Math.max(
      0,
      Math.min(1, Number(value) || 0)
    );
  }

  getCurrentPosition() {
    if (!this.playing || !this.context) {
      return this.timelinePosition;
    }

    return this.startPosition +
      (this.context.currentTime - this.startTime);
  }

  startClock() {
    this.stopClock();

    const tick = () => {
      if (!this.playing) return;

      this.timelinePosition = this.getCurrentPosition();

      eventBus.emit("AUDIO_TIME_UPDATE", {
        position: this.timelinePosition
      });

      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  stopClock() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  removeTrack(id) {
    const track = this.sources.get(id);

    if (!track) return false;

    if (track.source) {
      try {
        track.source.stop();
      } catch (_) {}
    }

    track.gain.disconnect();
    track.pan.disconnect();

    this.sources.delete(id);
    this.buffers.delete(id);

    eventBus.emit("AUDIO_TRACK_REMOVED", { id });

    return true;
  }

  getTrackInfo(id) {
    const track = this.sources.get(id);

    if (!track) return null;

    return {
      id,
      duration: track.buffer?.duration || 0,
      volume: track.volume,
      muted: track.muted,
      pan: track.panValue,
      fadeIn: track.fadeIn,
      fadeOut: track.fadeOut
    };
  }

  destroy() {
    this.stop();
    this.sources.forEach(track => {
      track.gain.disconnect();
      track.pan.disconnect();
    });

    this.sources.clear();
    this.buffers.clear();

    if (this.context) {
      this.context.close();
      this.context = null;
    }

    this.masterGain = null;
  }
}

export const audioEngine = new AudioEngine();
