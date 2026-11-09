import { APP_CONFIG, APP_EVENTS } from "../config.js";
import { store } from "../core/state-store.js";
import { eventBus } from "../core/event-bus.js";
import { projectManager } from "../project/project-manager.js";
import { trackManager } from "./tracks.js";
import { clipManager } from "./clips.js";
import { timelineSnapping } from "./snapping.js";
import { playhead } from "./playhead.js";

class TimelineManager {
  constructor() {
    this.zoom = 80;
    this.minZoom = 10;
    this.maxZoom = 500;
    this.scrollX = 0;
    this.scrollY = 0;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.snapEnabled = true;
    this.pixelsPerSecond = this.zoom;
    this.duration = 60;
    this.listeners = new Set();
    this.bound = false;
  }

  get project() {
    return projectManager.currentProject;
  }

  get tracks() {
    return this.project?.tracks || [];
  }

  get markers() {
    return this.project?.markers || [];
  }

  get clips() {
    return this.tracks.flatMap(track =>
      (track.clips || []).map(clip => ({
        ...clip,
        trackId: track.id,
        trackType: track.type
      }))
    );
  }

  initialize(options = {}) {
    this.viewportWidth = options.width || 0;
    this.viewportHeight = options.height || 0;

    this.calculateDuration();
    this.updateScale();
    this.bindEvents();

    this.emit("initialized", this.getSnapshot());

    return this.getSnapshot();
  }

  bindEvents() {
    if (this.bound) return;

    this.bound = true;

    eventBus.on(APP_EVENTS.PROJECT_UPDATED, () => {
      this.calculateDuration();
      this.emit("updated", this.getSnapshot());
    });

    eventBus.on(APP_EVENTS.CLIP_ADDED, () => {
      this.calculateDuration();
      this.emit("clipsChanged", this.getSnapshot());
    });

    eventBus.on(APP_EVENTS.CLIP_UPDATED, () => {
      this.calculateDuration();
      this.emit("clipsChanged", this.getSnapshot());
    });

    eventBus.on(APP_EVENTS.CLIP_REMOVED, () => {
      this.calculateDuration();
      this.emit("clipsChanged", this.getSnapshot());
    });

    eventBus.on(APP_EVENTS.TRACK_ADDED, () => {
      this.emit("tracksChanged", this.getSnapshot());
    });

    eventBus.on(APP_EVENTS.TRACK_REMOVED, () => {
      this.emit("tracksChanged", this.getSnapshot());
    });
  }

  calculateDuration() {
    let maximum = 0;

    for (const clip of this.clips) {
      const start = Number(clip.startTime || 0);
      const duration = Number(
        clip.duration || clip.endTime - clip.startTime || 0
      );

      maximum = Math.max(maximum, start + duration);
    }

    for (const marker of this.markers) {
      maximum = Math.max(
        maximum,
        Number(marker.time || 0)
      );
    }

    const configured = Number(
      this.project?.duration || 0
    );

    this.duration = Math.max(
      60,
      maximum,
      configured
    );

    return this.duration;
  }

  updateScale() {
    this.pixelsPerSecond = this.zoom;
    return this.pixelsPerSecond;
  }

  setViewport(width, height) {
    this.viewportWidth = Math.max(0, Number(width) || 0);
    this.viewportHeight = Math.max(0, Number(height) || 0);

    this.emit("viewportChanged", {
      width: this.viewportWidth,
      height: this.viewportHeight
    });
  }

  setZoom(value, anchorPixel = null) {
    const next = Math.min(
      this.maxZoom,
      Math.max(this.minZoom, Number(value) || this.zoom)
    );

    if (next === this.zoom) return this.zoom;

    const anchor = anchorPixel ?? this.viewportWidth / 2;
    const anchorTime = this.pixelToTime(
      anchor + this.scrollX
    );

    this.zoom = next;
    this.updateScale();

    this.scrollX = Math.max(
      0,
      this.timeToPixel(anchorTime) - anchor
    );

    this.emit("zoomChanged", this.zoom);
    return this.zoom;
  }

  zoomIn() {
    return this.setZoom(this.zoom * 1.25);
  }

  zoomOut() {
    return this.setZoom(this.zoom / 1.25);
  }

  fitTimeline() {
    if (!this.viewportWidth) return this.zoom;

    const duration = Math.max(1, this.calculateDuration());

    return this.setZoom(
      this.viewportWidth / duration,
      0
    );
  }

  timeToPixel(seconds) {
    return Math.max(0, Number(seconds) || 0) *
      this.pixelsPerSecond;
  }

  pixelToTime(pixel) {
    return Math.max(0, Number(pixel) || 0) /
      this.pixelsPerSecond;
  }

  getVisibleTimeRange() {
    const start = this.pixelToTime(this.scrollX);
    const end = this.pixelToTime(
      this.scrollX + this.viewportWidth
    );

    return {
      start,
      end,
      duration: Math.max(0, end - start)
    };
  }

  scrollTo(pixelX, pixelY = this.scrollY) {
    const maxX = Math.max(
      0,
      this.timeToPixel(this.duration) - this.viewportWidth
    );

    this.scrollX = Math.min(
      maxX,
      Math.max(0, Number(pixelX) || 0)
    );

    this.scrollY = Math.max(0, Number(pixelY) || 0);

    this.emit("scrolled", {
      x: this.scrollX,
      y: this.scrollY
    });

    return {
      x: this.scrollX,
      y: this.scrollY
    };
  }

  scrollToTime(seconds, alignment = "center") {
    const pixel = this.timeToPixel(seconds);
    let target = pixel;

    if (alignment === "center") {
      target -= this.viewportWidth / 2;
    } else if (alignment === "end") {
      target -= this.viewportWidth;
    }

    return this.scrollTo(target);
  }

  seek(seconds) {
    const time = Math.min(
      this.duration,
      Math.max(0, Number(seconds) || 0)
    );

    playhead.seek(time);

    this.emit("seek", time);
    return time;
  }

  seekFromPixel(pixel) {
    return this.seek(
      this.pixelToTime(pixel + this.scrollX)
    );
  }

  stepFrame(direction = 1) {
    return playhead.stepFrame(direction);
  }

  toggleSnap(enabled = !this.snapEnabled) {
    this.snapEnabled = Boolean(enabled);

    this.emit("snapChanged", this.snapEnabled);
    return this.snapEnabled;
  }

  snapTime(time, options = {}) {
    if (!this.snapEnabled) {
      return {
        time,
        snapped: false,
        target: null
      };
    }

    return timelineSnapping.snapTime(time, options);
  }

  getClipPosition(clip) {
    const start = Number(clip.startTime || 0);
    const duration = Number(
      clip.duration || clip.endTime - clip.startTime || 0
    );

    return {
      left: this.timeToPixel(start),
      width: this.timeToPixel(duration),
      start,
      end: start + duration
    };
  }

  getClipAtTime(time, trackId = null) {
    const matches = this.clips.filter(clip => {
      if (trackId && clip.trackId !== trackId) {
        return false;
      }

      const start = Number(clip.startTime || 0);
      const duration = Number(
        clip.duration || clip.endTime - clip.startTime || 0
      );

      return time >= start && time <= start + duration;
    });

    return matches;
  }

  getVisibleClips() {
    const range = this.getVisibleTimeRange();

    return this.clips.filter(clip => {
      const start = Number(clip.startTime || 0);
      const duration = Number(
        clip.duration || clip.endTime - clip.startTime || 0
      );

      const end = start + duration;

      return end >= range.start && start <= range.end;
    });
  }

  getRulerTicks(interval = null) {
    const range = this.getVisibleTimeRange();

    const secondsPerTick = interval || this.getTickInterval();
    const first = Math.floor(range.start / secondsPerTick) *
      secondsPerTick;

    const ticks = [];

    for (
      let time = first;
      time <= range.end + secondsPerTick;
      time += secondsPerTick
    ) {
      ticks.push({
        time,
        pixel: this.timeToPixel(time),
        label: this.formatTime(time)
      });
    }

    return ticks;
  }

  getTickInterval() {
    const choices = [
      0.1, 0.25, 0.5, 1, 2, 5, 10,
      15, 30, 60, 120, 300, 600
    ];

    const minimumPixels = 75;

    return choices.find(interval =>
      interval * this.pixelsPerSecond >= minimumPixels
    ) || 600;
  }

  getMarkerPositions() {
    return this.markers.map(marker => ({
      ...marker,
      pixel: this.timeToPixel(marker.time || 0)
    }));
  }

  formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);

    const minutes = Math.floor(value / 60);
    const remaining = value % 60;

    return `${String(minutes).padStart(2, "0")}:` +
      `${remaining.toFixed(2).padStart(5, "0")}`;
  }

  getSnapshot() {
    return {
      zoom: this.zoom,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      duration: this.duration,
      pixelsPerSecond: this.pixelsPerSecond,
      snapEnabled: this.snapEnabled,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      visibleRange: this.getVisibleTimeRange(),
      trackCount: this.tracks.length,
      clipCount: this.clips.length
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(type, detail = {}) {
    const event = {
      type,
      detail,
      timeline: this.getSnapshot()
    };

    for (const callback of this.listeners) {
      try {
        callback(event);
      } catch (error) {
        console.error("Timeline listener error:", error);
      }
    }

    eventBus.emit(`timeline:${type}`, event);
  }

  destroy() {
    this.listeners.clear();
    this.bound = false;
  }
}

export const timeline = new TimelineManager();
