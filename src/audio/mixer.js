import { audioEngine } from "./audio-engine.js";
import { eventBus } from "../core/event-bus.js";

class AudioMixer {
  constructor() {
    this.channels = new Map();
    this.master = {
      volume: 1,
      muted: false,
      soloId: null
    };

    this.listeners = new Set();
  }

  registerChannel(id, options = {}) {
    if (!id) throw new Error("Channel ID is required.");

    if (this.channels.has(id)) {
      this.removeChannel(id);
    }

    const channel = {
      id,
      name: options.name || `Audio ${this.channels.size + 1}`,
      volume: this.normalize(options.volume ?? 1),
      pan: this.normalizePan(options.pan ?? 0),
      muted: Boolean(options.muted),
      solo: false,
      locked: false,
      color: options.color || "#45dfba"
    };

    this.channels.set(id, channel);

    audioEngine.addTrack(id, {
      volume: channel.volume,
      pan: channel.pan
    });

    this.applyAll();
    this.emit("channel-added", channel);

    return { ...channel };
  }

  removeChannel(id) {
    const channel = this.channels.get(id);
    if (!channel) return false;

    audioEngine.removeTrack(id);
    this.channels.delete(id);

    if (this.master.soloId === id) {
      this.master.soloId = null;
    }

    this.applyAll();
    this.emit("channel-removed", { id });

    return true;
  }

  getChannel(id) {
    const channel = this.channels.get(id);
    return channel ? { ...channel } : null;
  }

  getAllChannels() {
    return [...this.channels.values()].map(channel => ({
      ...channel
    }));
  }

  setVolume(id, value) {
    const channel = this.requireChannel(id);
    channel.volume = this.normalize(value);

    audioEngine.setVolume(id, channel.volume);
    this.emit("volume-changed", channel);

    return channel.volume;
  }

  setPan(id, value) {
    const channel = this.requireChannel(id);
    channel.pan = this.normalizePan(value);

    audioEngine.setPan(id, channel.pan);
    this.emit("pan-changed", channel);

    return channel.pan;
  }

  setMuted(id, muted = true) {
    const channel = this.requireChannel(id);
    channel.muted = Boolean(muted);

    this.applyChannel(channel);
    this.emit("mute-changed", channel);

    return channel.muted;
  }

  toggleMute(id) {
    const channel = this.requireChannel(id);
    return this.setMuted(id, !channel.muted);
  }

  setSolo(id, solo = true) {
    const channel = this.requireChannel(id);

    channel.solo = Boolean(solo);

    if (channel.solo) {
      this.master.soloId = id;
    } else if (this.master.soloId === id) {
      this.master.soloId = null;
    }

    this.applyAll();
    this.emit("solo-changed", channel);

    return channel.solo;
  }

  toggleSolo(id) {
    const channel = this.requireChannel(id);
    return this.setSolo(id, !channel.solo);
  }

  setMasterVolume(value) {
    this.master.volume = this.normalize(value);

    audioEngine.setMasterVolume(
      this.master.muted ? 0 : this.master.volume
    );

    this.emit("master-volume-changed", {
      volume: this.master.volume
    });

    return this.master.volume;
  }

  setMasterMute(muted = true) {
    this.master.muted = Boolean(muted);
    audioEngine.muteAll(this.master.muted);

    this.emit("master-mute-changed", {
      muted: this.master.muted
    });

    return this.master.muted;
  }

  applyChannel(channel) {
    const soloActive = this.master.soloId !== null;
    const shouldMute =
      channel.muted ||
      (soloActive && !channel.solo);

    audioEngine.muteTrack(channel.id, shouldMute);
    audioEngine.setVolume(channel.id, channel.volume);
    audioEngine.setPan(channel.id, channel.pan);
  }

  applyAll() {
    for (const channel of this.channels.values()) {
      this.applyChannel(channel);
    }

    audioEngine.setMasterVolume(
      this.master.muted ? 0 : this.master.volume
    );
  }

  normalize(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;

    return Math.max(0, Math.min(1, number));
  }

  normalizePan(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;

    return Math.max(-1, Math.min(1, number));
  }

  requireChannel(id) {
    const channel = this.channels.get(id);

    if (!channel) {
      throw new Error(`Audio channel not found: ${id}`);
    }

    if (channel.locked) {
      throw new Error("This audio channel is locked.");
    }

    return channel;
  }

  setLocked(id, locked = true) {
    const channel = this.requireChannel(id);
    channel.locked = Boolean(locked);

    this.emit("lock-changed", channel);
    return channel.locked;
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(type, data = {}) {
    const payload = {
      type,
      data: { ...data },
      timestamp: Date.now()
    };

    this.listeners.forEach(callback => {
      try {
        callback(payload);
      } catch (error) {
        console.error("Mixer listener error:", error);
      }
    });

    eventBus.emit("MIXER_CHANGED", payload);
  }

  getState() {
    return {
      master: { ...this.master },
      channels: this.getAllChannels()
    };
  }

  reset() {
    for (const id of [...this.channels.keys()]) {
      this.removeChannel(id);
    }

    this.master = {
      volume: 1,
      muted: false,
      soloId: null
    };

    audioEngine.setMasterVolume(1);
    audioEngine.muteAll(false);

    this.emit("reset");
  }
}

export const audioMixer = new AudioMixer();
