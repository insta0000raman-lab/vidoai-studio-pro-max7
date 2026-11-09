import { audioEngine } from "./audio-engine.js";
import { eventBus } from "../core/event-bus.js";

class AudioFades {
  constructor() {
    this.automations = new Map();
  }

  getTrack(id) {
    const track = audioEngine.sources.get(id);

    if (!track) {
      throw new Error(`Audio track not found: ${id}`);
    }

    if (!audioEngine.context) {
      throw new Error("Audio engine is not initialized.");
    }

    return track;
  }

  normalizeTime(value) {
    const time = Number(value);

    if (!Number.isFinite(time) || time < 0) {
      throw new Error("Invalid automation time.");
    }

    return time;
  }

  normalizeVolume(value) {
    const volume = Number(value);

    if (!Number.isFinite(volume)) {
      throw new Error("Invalid volume.");
    }

    return Math.max(0, Math.min(1, volume));
  }

  fadeIn(id, duration, options = {}) {
    const track = this.getTrack(id);
    const seconds = this.normalizeTime(duration);
    const startAt = this.normalizeTime(options.startAt ?? 0);
    const target = this.normalizeVolume(track.volume);

    return this.schedule(id, [
      { time: startAt, value: 0 },
      { time: startAt + seconds, value: target }
    ]);
  }

  fadeOut(id, duration, options = {}) {
    const track = this.getTrack(id);
    const seconds = this.normalizeTime(duration);
    const endAt = this.normalizeTime(
      options.endAt ?? track.buffer?.duration ?? 0
    );

    const startAt = Math.max(0, endAt - seconds);
    const volume = this.normalizeVolume(track.volume);

    return this.schedule(id, [
      { time: startAt, value: volume },
      { time: endAt, value: 0 }
    ]);
  }

  fadeBetween(id, from, to, duration, options = {}) {
    const startAt = this.normalizeTime(options.startAt ?? 0);
    const seconds = this.normalizeTime(duration);

    return this.schedule(id, [
      {
        time: startAt,
        value: this.normalizeVolume(from)
      },
      {
        time: startAt + seconds,
        value: this.normalizeVolume(to)
      }
    ]);
  }

  schedule(id, points, options = {}) {
    const track = this.getTrack(id);
    const param = track.gain.gain;
    const context = audioEngine.context;

    if (!Array.isArray(points) || points.length < 2) {
      throw new Error("At least two automation points are required.");
    }

    const normalized = points.map(point => ({
      time: this.normalizeTime(point.time),
      value: this.normalizeVolume(point.value)
    })).sort((a, b) => a.time - b.time);

    for (let i = 1; i < normalized.length; i++) {
      if (normalized[i].time === normalized[i - 1].time) {
        throw new Error("Automation points need unique times.");
      }
    }

    const now = context.currentTime;
    const timelineStart = options.timelineStart ?? 0;
    const playbackPosition = audioEngine.getCurrentPosition();

    param.cancelScheduledValues(now);

    const initial = normalized[0];
    const relativeStart = initial.time - playbackPosition;

    if (relativeStart > 0) {
      param.setValueAtTime(
        param.value,
        now
      );

      param.setValueAtTime(
        initial.value,
        now + relativeStart
      );
    } else {
      param.setValueAtTime(
        initial.value,
        now
      );
    }

    for (let i = 1; i < normalized.length; i++) {
      const point = normalized[i];
      const relativeTime = point.time - playbackPosition;

      if (relativeTime < 0) continue;

      const audioTime = now + relativeTime;

      if (options.curve === "exponential" &&
          point.value > 0) {
        param.exponentialRampToValueAtTime(
          point.value,
          audioTime
        );
      } else if (options.curve === "linear") {
        param.linearRampToValueAtTime(
          point.value,
          audioTime
        );
      } else {
        param.setValueAtTime(
          point.value,
          audioTime
        );
      }
    }

    const automation = {
      id,
      points: normalized,
      curve: options.curve || "linear",
      timelineStart,
      updatedAt: Date.now()
    };

    this.automations.set(id, automation);

    eventBus.emit("AUDIO_AUTOMATION_CHANGED", {
      trackId: id,
      automation
    });

    return automation;
  }

  setKeyframes(id, keyframes, options = {}) {
    if (!Array.isArray(keyframes) || keyframes.length < 2) {
      throw new Error("At least two volume keyframes are required.");
    }

    return this.schedule(
      id,
      keyframes.map(frame => ({
        time: frame.time,
        value: frame.value
      })),
      options
    );
  }

  getAutomation(id) {
    const automation = this.automations.get(id);

    return automation
      ? structuredClone(automation)
      : null;
  }

  removeAutomation(id) {
    const track = this.getTrack(id);
    const param = track.gain.gain;

    param.cancelScheduledValues(
      audioEngine.context.currentTime
    );

    param.setValueAtTime(
      track.volume,
      audioEngine.context.currentTime
    );

    const removed = this.automations.delete(id);

    eventBus.emit("AUDIO_AUTOMATION_REMOVED", {
      trackId: id
    });

    return removed;
  }

  shiftAutomation(id, offset) {
    const automation = this.automations.get(id);

    if (!automation) {
      throw new Error("No automation exists for this track.");
    }

    const shift = Number(offset);

    if (!Number.isFinite(shift)) {
      throw new Error("Invalid time offset.");
    }

    const points = automation.points.map(point => ({
      time: Math.max(0, point.time + shift),
      value: point.value
    }));

    return this.schedule(id, points, {
      curve: automation.curve,
      timelineStart: automation.timelineStart
    });
  }

  clear() {
    for (const id of [...this.automations.keys()]) {
      if (audioEngine.sources.has(id)) {
        this.removeAutomation(id);
      } else {
        this.automations.delete(id);
      }
    }
  }
}

export const audioFades = new AudioFades();
