import {
  createTrack,
  touchProject
} from "../project/schema.js";

import { projectManager } from "../project/project-manager.js";
import { eventBus } from "../core/event-bus.js";
import { notifications } from "../core/notifications.js";

const TRACK_TYPES = {
  VIDEO: "video",
  AUDIO: "audio",
  TEXT: "text",
  OVERLAY: "overlay",
  EFFECT: "effect"
};

class TrackManager {
  getProject() {
    const project = projectManager.getCurrent();

    if (!project) {
      throw new Error("No project is currently open");
    }

    if (!Array.isArray(project.tracks)) {
      project.tracks = [];
    }

    return project;
  }

  getTracks() {
    return [...this.getProject().tracks].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );
  }

  getTrack(trackId) {
    return this.getProject().tracks.find(
      track => track.id === trackId
    ) || null;
  }

  create(type, name = null, options = {}) {
    if (!Object.values(TRACK_TYPES).includes(type)) {
      throw new Error(`Unsupported track type: ${type}`);
    }

    const project = this.getProject();

    const sameTypeCount = project.tracks.filter(
      track => track.type === type
    ).length;

    const defaultNames = {
      video: "Video",
      audio: "Audio",
      text: "Text",
      overlay: "Overlay",
      effect: "Effects"
    };

    const trackName = name ||
      `${defaultNames[type]} ${sameTypeCount + 1}`;

    const track = createTrack({
      type,
      name: trackName,
      order: project.tracks.length,
      visible: options.visible !== false,
      locked: Boolean(options.locked),
      muted: Boolean(options.muted),
      solo: false,
      height: options.height || this.getDefaultHeight(type),
      color: options.color || null
    });

    track.clips = Array.isArray(track.clips)
      ? track.clips
      : [];

    track.visible = options.visible !== false;
    track.locked = Boolean(options.locked);
    track.muted = Boolean(options.muted);
    track.solo = false;

    project.tracks.push(track);

    this.changed("track:created", track);

    notifications.success(`${trackName} added`);

    return track;
  }

  createVideoTrack(name, options = {}) {
    return this.create(TRACK_TYPES.VIDEO, name, options);
  }

  createAudioTrack(name, options = {}) {
    return this.create(TRACK_TYPES.AUDIO, name, options);
  }

  createTextTrack(name, options = {}) {
    return this.create(TRACK_TYPES.TEXT, name, options);
  }

  createOverlayTrack(name, options = {}) {
    return this.create(TRACK_TYPES.OVERLAY, name, options);
  }

  createEffectTrack(name, options = {}) {
    return this.create(TRACK_TYPES.EFFECT, name, options);
  }

  getDefaultHeight(type) {
    const heights = {
      video: 76,
      audio: 64,
      text: 54,
      overlay: 60,
      effect: 54
    };

    return heights[type] || 60;
  }

  rename(trackId, name) {
    const track = this.getTrack(trackId);

    if (!track) {
      throw new Error("Track not found");
    }

    const cleanName = String(name || "").trim();

    if (!cleanName) {
      throw new Error("Track name cannot be empty");
    }

    track.name = cleanName;

    this.changed("track:renamed", track);

    return track;
  }

  setVisibility(trackId, visible) {
    const track = this.getTrack(trackId);

    if (!track) return false;

    track.visible = Boolean(visible);

    this.changed("track:visibility-changed", track);

    return track.visible;
  }

  setLocked(trackId, locked) {
    const track = this.getTrack(trackId);

    if (!track) return false;

    track.locked = Boolean(locked);

    this.changed("track:lock-changed", track);

    return track.locked;
  }

  setMuted(trackId, muted) {
    const track = this.getTrack(trackId);

    if (!track || track.type !== TRACK_TYPES.AUDIO) {
      return false;
    }

    track.muted = Boolean(muted);

    this.changed("track:mute-changed", track);

    return track.muted;
  }

  setSolo(trackId, solo) {
    const project = this.getProject();
    const track = this.getTrack(trackId);

    if (!track || track.type !== TRACK_TYPES.AUDIO) {
      return false;
    }

    project.tracks.forEach(item => {
      if (item.type === TRACK_TYPES.AUDIO) {
        item.solo = item.id === trackId && Boolean(solo);
      }
    });

    this.changed("track:solo-changed", {
      trackId,
      solo: Boolean(solo)
    });

    return true;
  }

  setHeight(trackId, height) {
    const track = this.getTrack(trackId);

    if (!track) return false;

    const value = Number(height);

    if (!Number.isFinite(value)) {
      throw new Error("Invalid track height");
    }

    track.height = Math.max(36, Math.min(240, value));

    this.changed("track:height-changed", track);

    return track.height;
  }

  move(trackId, newIndex) {
    const project = this.getProject();
    const tracks = project.tracks;

    const oldIndex = tracks.findIndex(
      track => track.id === trackId
    );

    if (oldIndex === -1) {
      throw new Error("Track not found");
    }

    const targetIndex = Math.max(
      0,
      Math.min(tracks.length - 1, Math.floor(newIndex))
    );

    const [track] = tracks.splice(oldIndex, 1);

    tracks.splice(targetIndex, 0, track);

    this.updateOrder(project);

    this.changed("track:reordered", {
      trackId,
      oldIndex,
      newIndex: targetIndex
    });

    return track;
  }

  moveUp(trackId) {
    const index = this.getTracks().findIndex(
      track => track.id === trackId
    );

    if (index <= 0) return false;

    return this.move(trackId, index - 1);
  }

  moveDown(trackId) {
    const tracks = this.getTracks();

    const index = tracks.findIndex(
      track => track.id === trackId
    );

    if (index === -1 || index >= tracks.length - 1) {
      return false;
    }

    return this.move(trackId, index + 1);
  }

  duplicate(trackId) {
    const project = this.getProject();
    const original = this.getTrack(trackId);

    if (!original) {
      throw new Error("Track not found");
    }

    const copy = createTrack({
      ...original,
      id: undefined,
      name: `${original.name} Copy`,
      order: project.tracks.length
    });

    copy.clips = structuredClone(
      original.clips || []
    );

    copy.visible = original.visible !== false;
    copy.locked = false;
    copy.muted = Boolean(original.muted);
    copy.solo = false;

    project.tracks.push(copy);

    this.changed("track:duplicated", {
      original,
      copy
    });

    return copy;
  }

  remove(trackId, options = {}) {
    const project = this.getProject();

    const index = project.tracks.findIndex(
      track => track.id === trackId
    );

    if (index === -1) return false;

    const track = project.tracks[index];

    if (track.locked && !options.force) {
      throw new Error("Unlock this track before deleting it");
    }

    project.tracks.splice(index, 1);

    this.updateOrder(project);

    this.changed("track:removed", track);

    notifications.info(`${track.name} removed`);

    return true;
  }

  updateOrder(project = this.getProject()) {
    project.tracks.forEach((track, index) => {
      track.order = index;
    });
  }

  getTracksByType(type) {
    return this.getTracks().filter(
      track => track.type === type
    );
  }

  getAudioSoloState() {
    const audioTracks = this.getTracksByType(
      TRACK_TYPES.AUDIO
    );

    return {
      hasSolo: audioTracks.some(track => track.solo),
      soloTrackIds: audioTracks
        .filter(track => track.solo)
        .map(track => track.id)
    };
  }

  canEdit(trackId) {
    const track = this.getTrack(trackId);

    return Boolean(track && !track.locked);
  }

  changed(eventName, detail) {
    const project = this.getProject();

    touchProject(project);

    projectManager.markDirty();

    eventBus.emit(eventName, detail);

    eventBus.emit("timeline:tracks-changed", {
      tracks: project.tracks
    });
  }
}

export const trackManager = new TrackManager();

export { TRACK_TYPES };
