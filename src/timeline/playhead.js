import { projectManager } from "../project/project-manager.js";
import { store } from "../core/state-store.js";
import { eventBus } from "../core/event-bus.js";

class PlayheadManager {
  constructor() {
    this.time = 0;
    this.playing = false;
    this.playbackRate = 1;
    this.lastTick = null;
    this.animationFrame = null;
    this.listeners = new Set();
  }

  getProject() {
    return projectManager.getCurrent();
  }

  getFPS() {
    const project = this.getProject();

    const fps = Number(
      project?.fps ||
      project?.settings?.fps ||
      30
    );

    return Number.isFinite(fps) && fps > 0
      ? fps
      : 30;
  }

  getDuration() {
    const project = this.getProject();

    const duration = Number(
      project?.duration ||
      project?.settings?.duration ||
      0
    );

    return Number.isFinite(duration) && duration > 0
      ? duration
      : 0;
  }

  getFrameDuration() {
    return 1 / this.getFPS();
  }

  getCurrentTime() {
    return this.time;
  }

  getCurrentFrame() {
    return Math.round(this.time * this.getFPS());
  }

  getState() {
    return {
      time: this.time,
      frame: this.getCurrentFrame(),
      fps: this.getFPS(),
      duration: this.getDuration(),
      playing: this.playing,
      playbackRate: this.playbackRate
    };
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this.listeners.add(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  notify(reason = "update") {
    const state = this.getState();

    this.listeners.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error("Playhead listener error:", error);
      }
    });

    eventBus.emit("playhead:changed", {
      ...state,
      reason
    });
  }

  clampTime(time) {
    const value = Number(time);

    if (!Number.isFinite(value)) {
      throw new Error("Invalid playhead time");
    }

    const duration = this.getDuration();

    return Math.max(
      0,
      duration > 0 ? Math.min(duration, value) : value
    );
  }

  seek(time, options = {}) {
    const wasPlaying = this.playing;

    if (options.pause !== false && wasPlaying) {
      this.pause();
    }

    this.time = this.clampTime(time);

    store.setPlaybackTime(this.time);

    this.notify("seek");

    eventBus.emit("timeline:seek", {
      time: this.time,
      frame: this.getCurrentFrame()
    });

    if (options.resume && wasPlaying) {
      this.play();
    }

    return this.time;
  }

  seekFrame(frame, options = {}) {
    const frameNumber = Number(frame);

    if (!Number.isFinite(frameNumber)) {
      throw new Error("Invalid frame number");
    }

    const targetTime = Math.max(
      0,
      Math.round(frameNumber) / this.getFPS()
    );

    return this.seek(targetTime, options);
  }

  nextFrame() {
    return this.seekFrame(
      this.getCurrentFrame() + 1
    );
  }

  previousFrame() {
    return this.seekFrame(
      this.getCurrentFrame() - 1
    );
  }

  goToStart() {
    return this.seek(0);
  }

  goToEnd() {
    return this.seek(this.getDuration());
  }

  setPlaybackRate(rate) {
    const value = Number(rate);

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Playback rate must be greater than zero");
    }

    this.playbackRate = Math.max(
      0.1,
      Math.min(4, value)
    );

    this.notify("playback-rate");

    eventBus.emit("playhead:rate-changed", {
      rate: this.playbackRate
    });

    return this.playbackRate;
  }

  play() {
    if (this.playing) return;

    const duration = this.getDuration();

    if (duration > 0 && this.time >= duration) {
      this.time = 0;
      store.setPlaybackTime(0);
    }

    this.playing = true;
    this.lastTick = null;

    store.setPlaying(true);

    this.notify("play");

    eventBus.emit("playback:started", this.getState());
  }

  pause() {
    if (!this.playing) return;

    this.playing = false;
    this.lastTick = null;

    store.setPlaying(false);

    this.notify("pause");

    eventBus.emit("playback:paused", this.getState());
  }

  togglePlayback() {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }

    return this.playing;
  }

  tick(timestamp) {
    if (!this.playing) return this.time;

    if (!Number.isFinite(timestamp)) {
      return this.time;
    }

    if (this.lastTick === null) {
      this.lastTick = timestamp;
      return this.time;
    }

    const elapsed = Math.max(
      0,
      (timestamp - this.lastTick) / 1000
    );

    this.lastTick = timestamp;

    const nextTime =
      this.time + elapsed * this.playbackRate;

    const duration = this.getDuration();

    if (duration > 0 && nextTime >= duration) {
      this.time = duration;

      store.setPlaybackTime(this.time);

      this.pause();
      this.notify("playback-ended");

      eventBus.emit("playback:ended", this.getState());

      return this.time;
    }

    this.time = nextTime;

    store.setPlaybackTime(this.time);

    this.notify("tick");

    return this.time;
  }

  reset() {
    this.pause();

    this.time = 0;
    this.playbackRate = 1;
    this.lastTick = null;

    store.setPlaybackTime(0);

    this.notify("reset");

    return this.time;
  }

  destroy() {
    this.pause();
    this.listeners.clear();

    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
}

export const playhead = new PlayheadManager();
