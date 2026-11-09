import {
  createClip,
  createTextClip,
  touchProject
} from "../project/schema.js";

import { projectManager } from "../project/project-manager.js";
import { trackManager } from "./tracks.js";
import { eventBus } from "../core/event-bus.js";

const MIN_CLIP_DURATION = 1 / 60;

class ClipManager {
  getProject() {
    const project = projectManager.getCurrent();

    if (!project) {
      throw new Error("No project is open");
    }

    if (!Array.isArray(project.tracks)) {
      project.tracks = [];
    }

    return project;
  }

  getTrack(trackId) {
    const track = trackManager.getTrack(trackId);

    if (!track) {
      throw new Error("Track not found");
    }

    if (!Array.isArray(track.clips)) {
      track.clips = [];
    }

    return track;
  }

  getClip(trackId, clipId) {
    const track = this.getTrack(trackId);

    return track.clips.find(
      clip => clip.id === clipId
    ) || null;
  }

  getAllClips() {
    const project = this.getProject();

    return project.tracks.flatMap(track =>
      (track.clips || []).map(clip => ({
        ...clip,
        trackId: track.id
      }))
    );
  }

  addVideo(trackId, asset, options = {}) {
    return this.addMedia(
      trackId,
      asset,
      "video",
      options
    );
  }

  addImage(trackId, asset, options = {}) {
    return this.addMedia(
      trackId,
      asset,
      "image",
      options
    );
  }

  addAudio(trackId, asset, options = {}) {
    return this.addMedia(
      trackId,
      asset,
      "audio",
      options
    );
  }

  addMedia(trackId, asset, type, options = {}) {
    const track = this.getTrack(trackId);

    if (track.locked) {
      throw new Error("Track is locked");
    }

    if (!asset || !asset.id) {
      throw new Error("A valid media asset is required");
    }

    const allowedTrackTypes = {
      video: ["video", "overlay"],
      image: ["video", "overlay"],
      audio: ["audio"]
    };

    if (!allowedTrackTypes[type]?.includes(track.type)) {
      throw new Error(
        `${type} media cannot be added to this track`
      );
    }

    const project = this.getProject();

    const sourceDuration = Number(
      asset.duration || options.duration || 0
    );

    const duration = Math.max(
      MIN_CLIP_DURATION,
      Number(options.duration || sourceDuration || 5)
    );

    const start = Math.max(
      0,
      Number(options.start || 0)
    );

    const sourceIn = Math.max(
      0,
      Number(options.sourceIn || 0)
    );

    const sourceOut = Number.isFinite(Number(options.sourceOut))
      ? Number(options.sourceOut)
      : sourceIn + duration;

    const clip = createClip({
      type,
      assetId: asset.id,
      name: options.name || asset.name || asset.fileName || type,
      start,
      duration: Math.max(MIN_CLIP_DURATION, sourceOut - sourceIn),
      sourceIn,
      sourceOut,
      volume: type === "audio" ? 1 : undefined,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        ...(options.transform || {})
      }
    });

    clip.assetId = asset.id;
    clip.type = type;
    clip.start = start;
    clip.duration = Math.max(
      MIN_CLIP_DURATION,
      sourceOut - sourceIn
    );
    clip.sourceIn = sourceIn;
    clip.sourceOut = sourceOut;

    if (options.transform) {
      clip.transform = {
        ...clip.transform,
        ...options.transform
      };
    }

    track.clips.push(clip);

    this.sortTrack(track);
    this.changed("clip:added", { trackId, clip });

    return clip;
  }

  addText(trackId, text = "New Text", options = {}) {
    const track = this.getTrack(trackId);

    if (track.locked) {
      throw new Error("Track is locked");
    }

    if (track.type !== "text" && track.type !== "overlay") {
      throw new Error("Text requires a text or overlay track");
    }

    const clip = createTextClip({
      text,
      start: Math.max(0, Number(options.start || 0)),
      duration: Math.max(
        MIN_CLIP_DURATION,
        Number(options.duration || 3)
      ),
      style: {
        fontFamily: "Arial",
        fontSize: 64,
        color: "#ffffff",
        alignment: "center",
        ...options.style
      },
      animation: options.animation || null
    });

    clip.type = "text";
    clip.text = text;
    clip.start = Math.max(0, Number(options.start || 0));
    clip.duration = Math.max(
      MIN_CLIP_DURATION,
      Number(options.duration || 3)
    );

    track.clips.push(clip);

    this.sortTrack(track);
    this.changed("clip:text-added", { trackId, clip });

    return clip;
  }

  update(trackId, clipId, changes = {}) {
    const track = this.getTrack(trackId);

    if (track.locked) {
      throw new Error("Track is locked");
    }

    const clip = this.getClip(trackId, clipId);

    if (!clip) {
      throw new Error("Clip not found");
    }

    const protectedKeys = ["id", "assetId"];

    for (const [key, value] of Object.entries(changes)) {
      if (protectedKeys.includes(key)) continue;

      if (key === "start" || key === "duration") {
        if (!Number.isFinite(Number(value))) {
          throw new Error(`Invalid clip ${key}`);
        }

        if (key === "start") {
          clip.start = Math.max(0, Number(value));
        } else {
          clip.duration = Math.max(
            MIN_CLIP_DURATION,
            Number(value)
          );
        }

        continue;
      }

      clip[key] = value;
    }

    if (clip.sourceIn !== undefined && clip.sourceOut !== undefined) {
      if (clip.sourceOut <= clip.sourceIn) {
        throw new Error("Invalid source trim range");
      }
    }

    this.sortTrack(track);
    this.changed("clip:updated", { trackId, clip });

    return clip;
  }

  move(trackId, clipId, newStart, targetTrackId = trackId) {
    const sourceTrack = this.getTrack(trackId);
    const targetTrack = this.getTrack(targetTrackId);

    if (sourceTrack.locked || targetTrack.locked) {
      throw new Error("Unlock the track before moving clips");
    }

    const index = sourceTrack.clips.findIndex(
      clip => clip.id === clipId
    );

    if (index === -1) {
      throw new Error("Clip not found");
    }

    const clip = sourceTrack.clips[index];

    if (sourceTrack.id !== targetTrack.id) {
      const compatible = {
        video: ["video", "overlay"],
        image: ["video", "overlay"],
        audio: ["audio"],
        text: ["text", "overlay"]
      };

      if (!compatible[clip.type]?.includes(targetTrack.type)) {
        throw new Error("This clip cannot be moved to that track");
      }

      sourceTrack.clips.splice(index, 1);
      targetTrack.clips.push(clip);
    }

    clip.start = Math.max(0, Number(newStart));

    this.sortTrack(sourceTrack);
    this.sortTrack(targetTrack);

    this.changed("clip:moved", {
      clip,
      sourceTrackId: trackId,
      targetTrackId,
      start: clip.start
    });

    return clip;
  }

  trimStart(trackId, clipId, newStart) {
    const clip = this.getClip(trackId, clipId);

    if (!clip) throw new Error("Clip not found");

    const track = this.getTrack(trackId);

    if (track.locked) throw new Error("Track is locked");

    const end = clip.start + clip.duration;
    const start = Math.max(0, Number(newStart));

    if (start >= end - MIN_CLIP_DURATION) {
      throw new Error("Trim would make the clip too short");
    }

    const difference = start - clip.start;

    clip.start = start;
    clip.duration = end - start;

    if (clip.sourceIn !== undefined) {
      clip.sourceIn += difference;
    }

    if (clip.sourceOut !== undefined) {
      clip.sourceOut = clip.sourceIn + clip.duration;
    }

    this.changed("clip:trimmed-start", { trackId, clip });

    return clip;
  }

  trimEnd(trackId, clipId, newEnd) {
    const clip = this.getClip(trackId, clipId);

    if (!clip) throw new Error("Clip not found");

    const track = this.getTrack(trackId);

    if (track.locked) throw new Error("Track is locked");

    const end = Number(newEnd);

    if (end <= clip.start + MIN_CLIP_DURATION) {
      throw new Error("Trim would make the clip too short");
    }

    clip.duration = end - clip.start;

    if (clip.sourceOut !== undefined) {
      clip.sourceOut = clip.sourceIn + clip.duration;
    }

    this.changed("clip:trimmed-end", { trackId, clip });

    return clip;
  }

  split(trackId, clipId, splitTime) {
    const track = this.getTrack(trackId);

    if (track.locked) {
      throw new Error("Track is locked");
    }

    const original = this.getClip(trackId, clipId);

    if (!original) {
      throw new Error("Clip not found");
    }

    const point = Number(splitTime);
    const clipStart = original.start;
    const clipEnd = clipStart + original.duration;

    if (
      point <= clipStart + MIN_CLIP_DURATION ||
      point >= clipEnd - MIN_CLIP_DURATION
    ) {
      throw new Error("Split point must be inside the clip");
    }

    const firstDuration = point - clipStart;
    const secondDuration = clipEnd - point;

    const second = structuredClone(original);

    second.id = this.createId();
    second.name = `${original.name || "Clip"} Part 2`;
    second.start = point;
    second.duration = secondDuration;

    original.duration = firstDuration;

    if (original.sourceIn !== undefined) {
      original.sourceOut = original.sourceIn + firstDuration;

      second.sourceIn = original.sourceOut;
      second.sourceOut = second.sourceIn + secondDuration;
    }

    track.clips.push(second);

    this.sortTrack(track);

    this.changed("clip:split", {
      trackId,
      first: original,
      second,
      splitTime: point
    });

    return {
      first: original,
      second
    };
  }

  duplicate(trackId, clipId, options = {}) {
    const track = this.getTrack(trackId);

    if (track.locked) {
      throw new Error("Track is locked");
    }

    const original = this.getClip(trackId, clipId);

    if (!original) {
      throw new Error("Clip not found");
    }

    const copy = structuredClone(original);

    copy.id = this.createId();
    copy.name = `${original.name || "Clip"} Copy`;

    copy.start = options.start !== undefined
      ? Math.max(0, Number(options.start))
      : original.start + original.duration;

    track.clips.push(copy);

    this.sortTrack(track);
    this.changed("clip:duplicated", { trackId, original, copy });

    return copy;
  }

  remove(trackId, clipId) {
    const track = this.getTrack(trackId);

    if (track.locked) {
      throw new Error("Track is locked");
    }

    const index = track.clips.findIndex(
      clip => clip.id === clipId
    );

    if (index === -1) return false;

    const [clip] = track.clips.splice(index, 1);

    this.changed("clip:removed", { trackId, clip });

    return true;
  }

  sortTrack(track) {
    track.clips.sort(
      (a, b) => a.start - b.start
    );
  }

  createId() {
    return globalThis.crypto?.randomUUID?.() ||
      `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  changed(eventName, detail) {
    const project = this.getProject();

    touchProject(project);
    projectManager.markDirty();

    eventBus.emit(eventName, detail);
    eventBus.emit("timeline:clips-changed", {
      tracks: project.tracks
    });
  }
}

export const clipManager = new ClipManager();

export { MIN_CLIP_DURATION };
