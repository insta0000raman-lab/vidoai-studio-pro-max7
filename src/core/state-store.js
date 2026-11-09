/* ZERO X MOTION — CENTRAL STATE STORE */

import { eventBus } from "./event-bus.js";
import { APP_EVENTS } from "../config.js";

const initialState = {
  project: null,

  editor: {
    mode: "easy",
    activePanel: "media",
    selectedClipId: null,
    selectedTrackId: null,
    selectedAssetId: null,
    inspectorOpen: false
  },

  playback: {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    muted: false,
    volume: 1,
    playbackRate: 1
  },

  timeline: {
    zoom: 80,
    scrollPosition: 0,
    snapEnabled: true,
    playheadTime: 0,
    selectedMarkerId: null
  },

  preview: {
    ratio: "9:16",
    fit: "contain",
    zoom: 100,
    showSafeArea: false,
    showGrid: false
  },

  export: {
    status: "idle",
    progress: 0,
    error: null,
    output: null
  },

  ui: {
    busy: false,
    activeDialog: null,
    notifications: [],
    leftPanelOpen: true
  }
};

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function getNestedValue(object, path) {
  return path.split(".").reduce((value, key) => {
    return value == null ? undefined : value[key];
  }, object);
}

function setNestedValue(object, path, value) {
  const keys = path.split(".");
  let target = object;

  for (let index = 0; index < keys.length - 1; index++) {
    const key = keys[index];

    if (
      !target[key] ||
      typeof target[key] !== "object"
    ) {
      target[key] = {};
    }

    target = target[key];
  }

  target[keys[keys.length - 1]] = value;
}

class StateStore {
  constructor() {
    this.state = clone(initialState);
    this.subscribers = new Set();
    this.revision = 0;
  }

  getState() {
    return this.state;
  }

  get(path) {
    if (!path) return this.state;
    return getNestedValue(this.state, path);
  }

  set(path, value) {
    if (typeof path !== "string" || !path.trim()) {
      throw new TypeError("State path must be a non-empty string.");
    }

    const previousValue = this.get(path);

    const nextValue =
      typeof value === "function"
        ? value(previousValue)
        : value;

    if (Object.is(previousValue, nextValue)) {
      return nextValue;
    }

    setNestedValue(this.state, path, nextValue);

    this.revision++;

    this.notify({
      path,
      value: nextValue,
      previousValue,
      revision: this.revision
    });

    return nextValue;
  }

  update(path, changes) {
    const current = this.get(path);

    if (!current || typeof current !== "object") {
      throw new TypeError(`Cannot update missing object: ${path}`);
    }

    const updated = {
      ...current,
      ...changes
    };

    this.set(path, updated);

    return updated;
  }

  reset() {
    this.state = clone(initialState);
    this.revision++;

    this.notify({
      path: "*",
      value: this.state,
      previousValue: null,
      revision: this.revision
    });
  }

  setProject(project) {
    this.set("project", project);

    this.set("playback.currentTime", 0);
    this.set("playback.duration", project?.duration || 0);
    this.set("playback.isPlaying", false);

    this.set("editor.selectedClipId", null);
    this.set("editor.selectedTrackId", null);

    eventBus.emit(APP_EVENTS.PROJECT_LOADED, project);
  }

  selectClip(clipId, trackId = null) {
    this.set("editor.selectedClipId", clipId);
    this.set("editor.selectedTrackId", trackId);

    eventBus.emit(APP_EVENTS.CLIP_SELECTED, {
      clipId,
      trackId
    });
  }

  setPlaybackTime(time) {
    const duration = this.get("playback.duration") || 0;

    const safeTime = Math.max(
      0,
      Math.min(Number(time) || 0, duration)
    );

    this.set("playback.currentTime", safeTime);
    this.set("timeline.playheadTime", safeTime);

    eventBus.emit(APP_EVENTS.PLAYBACK_SEEKED, {
      currentTime: safeTime
    });

    return safeTime;
  }

  setPlaying(isPlaying) {
    this.set("playback.isPlaying", Boolean(isPlaying));

    eventBus.emit(
      isPlaying
        ? APP_EVENTS.PLAYBACK_STARTED
        : APP_EVENTS.PLAYBACK_PAUSED
    );
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Subscriber must be a function.");
    }

    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  notify(change) {
    for (const callback of [...this.subscribers]) {
      try {
        callback(this.state, change);
      } catch (error) {
        console.error(
          "[ZERO X MOTION] State subscriber error:",
          error
        );
      }
    }
  }

  getRevision() {
    return this.revision;
  }
}

export const store = new StateStore();

export default store;
