(() => {
  "use strict";

  const clone = value => {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  };

  const createId = prefix =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  const clamp = (value, min, max) =>
    Math.min(max, Math.max(min, Number(value) || 0));

  class ProjectManager {
    constructor() {
      this.data = this.createDefaultProject();
      this.history = [];
      this.future = [];
      this.listeners = new Set();
      this.maxHistory = 60;
    }

    createDefaultProject() {
      const track = {
        id: createId("track"),
        name: "Video 1",
        type: "video",
        muted: false,
        locked: false,
        visible: true,
        clips: []
      };

      return {
        id: createId("project"),
        name: "Untitled Project",
        version: 1,
        width: 1080,
        height: 1920,
        fps: 30,
        duration: 0,
        playhead: 0,
        zoom: 1,
        selectedTrackId: track.id,
        selectedClipId: null,
        selectedTextId: null,
        tracks: [track],
        textLayers: [],
        effects: [],
        settings: {
          background: "#000000",
          audioVolume: 1
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }

    get state() {
      return this.data;
    }

    getSnapshot() {
      return clone(this.data);
    }

    subscribe(callback) {
      if (typeof callback !== "function") return () => {};
      this.listeners.add(callback);
      callback(this.getSnapshot());

      return () => this.listeners.delete(callback);
    }

    notify(action) {
      const snapshot = this.getSnapshot();

      this.listeners.forEach(callback => {
        try {
          callback(snapshot, action);
        } catch (error) {
          console.error("VYORA listener error:", error);
        }
      });
    }

    saveHistory() {
      this.history.push(clone(this.data));

      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }

      this.future = [];
    }

    update(action, callback) {
      if (typeof callback !== "function") return false;

      this.saveHistory();

      try {
        const result = callback(this.data);
        this.data.updatedAt = Date.now();
        this.notify(action);
        return result === undefined ? true : result;
      } catch (error) {
        this.data = this.history.pop() || this.createDefaultProject();
        console.error("VYORA project update failed:", error);
        this.notify("update-error");
        return false;
      }
    }

    undo() {
      if (!this.history.length) return false;

      this.future.push(clone(this.data));
      this.data = this.history.pop();
      this.notify("undo");
      return true;
    }

    redo() {
      if (!this.future.length) return false;

      this.history.push(clone(this.data));
      this.data = this.future.pop();
      this.notify("redo");
      return true;
    }

    canUndo() {
      return this.history.length > 0;
    }

    canRedo() {
      return this.future.length > 0;
    }

    newProject(name = "Untitled Project") {
      this.saveHistory();
      this.data = this.createDefaultProject();
      this.data.name = String(name || "Untitled Project");
      this.history = [];
      this.future = [];
      this.notify("new-project");
      return this.getSnapshot();
    }

    setProjectName(name) {
      return this.update("project-name", data => {
        data.name = String(name || "Untitled Project").slice(0, 100);
      });
    }

    setCanvas(width, height) {
      width = Math.round(Number(width));
      height = Math.round(Number(height));

      if (!Number.isFinite(width) || !Number.isFinite(height) ||
          width < 1 || height < 1 || width > 7680 || height > 7680) {
        return false;
      }

      return this.update("canvas-size", data => {
        data.width = width;
        data.height = height;
      });
    }

    setFPS(fps) {
      fps = Number(fps);
      if (![24, 25, 30, 50, 60].includes(fps)) return false;

      return this.update("fps", data => {
        data.fps = fps;
      });
    }

    setDuration(duration) {
      duration = Math.max(0, Number(duration) || 0);

      return this.update("duration", data => {
        data.duration = duration;
      });
    }

    setPlayhead(time) {
      time = Math.max(0, Number(time) || 0);

      this.data.playhead = time;
      this.notify("playhead");
      return time;
    }

    setZoom(zoom) {
      zoom = clamp(zoom, 0.1, 10);

      return this.update("zoom", data => {
        data.zoom = zoom;
      });
    }

    addTrack(type, name) {
      const validTypes = ["video", "audio", "text", "overlay"];
      if (!validTypes.includes(type)) return null;

      const track = {
        id: createId("track"),
        name: String(name || type + " track"),
        type,
        muted: false,
        locked: false,
        visible: true,
        clips: []
      };

      this.update("add-track", data => {
        data.tracks.push(track);
        data.selectedTrackId = track.id;
      });

      return clone(track);
    }

    getTrack(trackId) {
      const track = this.data.tracks.find(item => item.id === trackId);
      return track ? clone(track) : null;
    }

    updateTrack(trackId, changes = {}) {
      return this.update("update-track", data => {
        const track = data.tracks.find(item => item.id === trackId);
        if (!track) throw new Error("Track not found.");

        ["name", "muted", "locked", "visible"].forEach(key => {
          if (changes[key] !== undefined) {
            track[key] = changes[key];
          }
        });
      });
    }

    removeTrack(trackId) {
      if (this.data.tracks.length <= 1) return false;

      return this.update("remove-track", data => {
        data.tracks = data.tracks.filter(track => track.id !== trackId);

        if (data.selectedTrackId === trackId) {
          data.selectedTrackId = data.tracks[0]?.id || null;
        }

        const clipIds = data.tracks.flatMap(track =>
          track.clips.map(clip => clip.id)
        );

        if (!clipIds.includes(data.selectedClipId)) {
          data.selectedClipId = null;
        }
      });
    }

    addClip(trackId, clipData = {}) {
      const track = this.data.tracks.find(item => item.id === trackId);
      if (!track || track.locked) return null;

      const start = Math.max(0, Number(clipData.start) || 0);
      const duration = Math.max(0.01, Number(clipData.duration) || 1);

      const clip = {
        id: createId("clip"),
        type: clipData.type || track.type,
        name: String(clipData.name || "Untitled clip"),
        source: clipData.source || null,
        start,
        duration,
        sourceStart: Math.max(0, Number(clipData.sourceStart) || 0),
        sourceEnd: clipData.sourceEnd !== undefined
          ? Number(clipData.sourceEnd)
          : null,
        volume: clamp(clipData.volume ?? 1, 0, 2),
        muted: Boolean(clipData.muted),
        speed: clamp(clipData.speed ?? 1, 0.1, 4),
        opacity: clamp(clipData.opacity ?? 1, 0, 1),
        crop: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          ...(clone(clipData.crop || {}))
        },
        effects: clone(clipData.effects || []),
        metadata: clone(clipData.metadata || {})
      };

      const result = this.update("add-clip", data => {
        const target = data.tracks.find(item => item.id === trackId);
        if (!target || target.locked) {
          throw new Error("Track is locked or missing.");
        }

        target.clips.push(clip);
        target.clips.sort((a, b) => a.start - b.start);
        data.selectedClipId = clip.id;
        data.selectedTrackId = trackId;
      });

      return result === false ? null : clone(clip);
    }

    findClip(clipId) {
      for (const track of this.data.tracks) {
        const clip = track.clips.find(item => item.id === clipId);

        if (clip) {
          return {
            trackId: track.id,
            clip: clone(clip)
          };
        }
      }

      return null;
    }

    getClip(clipId) {
      const found = this.findClip(clipId);
      return found ? found.clip : null;
    }

    updateClip(clipId, changes = {}) {
      return this.update("update-clip", data => {
        let found = null;

        for (const track of data.tracks) {
          found = track.clips.find(item => item.id === clipId);
          if (found) break;
        }

        if (!found) throw new Error("Clip not found.");

        const allowed = [
          "name", "start", "duration", "sourceStart", "sourceEnd",
          "volume", "muted", "speed", "opacity", "source", "type",
          "crop", "effects", "metadata"
        ];

        allowed.forEach(key => {
          if (changes[key] !== undefined) {
            found[key] = clone(changes[key]);
          }
        });

        found.start = Math.max(0, Number(found.start) || 0);
        found.duration = Math.max(0.01, Number(found.duration) || 0.01);
        found.speed = clamp(found.speed, 0.1, 4);
        found.volume = clamp(found.volume, 0, 2);
        found.opacity = clamp(found.opacity, 0, 1);

        for (const track of data.tracks) {
          track.clips.sort((a, b) => a.start - b.start);
        }
      });
    }

    removeClip(clipId) {
      return this.update("remove-clip", data => {
        let removed = false;

        data.tracks.forEach(track => {
          const before = track.clips.length;
          track.clips = track.clips.filter(clip => clip.id !== clipId);
          if (track.clips.length !== before) removed = true;
        });

        if (!removed) throw new Error("Clip not found.");

        if (data.selectedClipId === clipId) {
          data.selectedClipId = null;
        }

        return true;
      });
    }

    selectClip(clipId, trackId = null) {
      const found = this.findClip(clipId);
      if (!found) return false;

      this.data.selectedClipId = clipId;
      this.data.selectedTrackId = trackId || found.trackId;
      this.notify("select-clip");
      return true;
    }

    getSelectedClip() {
      return this.getClip(this.data.selectedClipId);
    }

    moveClip(clipId, newStart, newTrackId = null) {
      const found = this.findClip(clipId);
      if (!found) return false;

      newStart = Math.max(0, Number(newStart) || 0);

      return this.update("move-clip", data => {
        const sourceTrack = data.tracks.find(t => t.id === found.trackId);
        const clip = sourceTrack.clips.find(c => c.id === clipId);
        if (!clip) throw new Error("Clip not found.");

        if (newTrackId && newTrackId !== found.trackId) {
          const targetTrack = data.tracks.find(t => t.id === newTrackId);
          if (!targetTrack || targetTrack.locked) {
            throw new Error("Target track unavailable.");
          }

          sourceTrack.clips = sourceTrack.clips.filter(c => c.id !== clipId);
          targetTrack.clips.push(clip);
          clip.type = targetTrack.type;
        }

        clip.start = newStart;

        data.tracks.forEach(track =>
          track.clips.sort((a, b) => a.start - b.start)
        );

        data.selectedClipId = clipId;
      });
    }

    splitClip(clipId, splitTime) {
      const found = this.findClip(clipId);
      if (!found) return null;

      const original = found.clip;
      const localTime = Number(splitTime) - original.start;

      if (localTime <= 0.01 || localTime >= original.duration - 0.01) {
        return null;
      }

      const firstDuration = localTime;
      const secondDuration = original.duration - localTime;
      const secondSourceStart =
        original.sourceStart + localTime * original.speed;

      const second = {
        ...original,
        id: createId("clip"),
        start: original.start + localTime,
        duration: secondDuration,
        sourceStart: secondSourceStart,
        sourceEnd: original.sourceEnd
      };

      const result = this.update("split-clip", data => {
        const track = data.tracks.find(t => t.id === found.trackId);
        const clip = track?.clips.find(c => c.id === clipId);
        if (!clip) throw new Error("Clip not found.");

        clip.duration = firstDuration;
        clip.sourceEnd = secondSourceStart;
        track.clips.push(second);
        track.clips.sort((a, b) => a.start - b.start);
        data.selectedClipId = second.id;
      });

      return result === false ? null : clone(second);
    }

    addTextLayer(text = "Your text", options = {}) {
      const layer = {
        id: createId("text"),
        text: String(text),
        x: Number(options.x ?? 0.5),
        y: Number(options.y ?? 0.5),
        fontSize: Number(options.fontSize ?? 64),
        fontFamily: String(options.fontFamily || "Arial"),
        color: String(options.color || "#ffffff"),
        background: String(options.background || "transparent"),
        align: options.align || "center",
        bold: Boolean(options.bold),
        italic: Boolean(options.italic),
        start: Math.max(0, Number(options.start) || 0),
        duration: Math.max(0.01, Number(options.duration) || 5),
        opacity: clamp(options.opacity ?? 1, 0, 1),
        rotation: Number(options.rotation) || 0
      };

      const result = this.update("add-text", data => {
        data.textLayers.push(layer);
        data.selectedTextId = layer.id;
      });

      return result === false ? null : clone(layer);
    }

    updateTextLayer(id, changes = {}) {
      return this.update("update-text", data => {
        const layer = data.textLayers.find(item => item.id === id);
        if (!layer) throw new Error("Text layer not found.");

        const allowed = [
          "text", "x", "y", "fontSize", "fontFamily", "color",
          "background", "align", "bold", "italic", "start",
          "duration", "opacity", "rotation"
        ];

        allowed.forEach(key => {
          if (changes[key] !== undefined) {
            layer[key] = changes[key];
          }
        });
      });
    }

    removeTextLayer(id) {
      return this.update("remove-text", data => {
        data.textLayers = data.textLayers.filter(item => item.id !== id);

        if (data.selectedTextId === id) {
          data.selectedTextId = null;
        }
      });
    }

    addEffect(type, options = {}) {
      const effect = {
        id: createId("effect"),
        type: String(type || "brightness"),
        enabled: true,
        intensity: clamp(options.intensity ?? 1, 0, 2),
        options: clone(options)
      };

      const result = this.update("add-effect", data => {
        data.effects.push(effect);
      });

      return result === false ? null : clone(effect);
    }

    updateEffect(id, changes = {}) {
      return this.update("update-effect", data => {
        const effect = data.effects.find(item => item.id === id);
        if (!effect) throw new Error("Effect not found.");

        ["type", "enabled", "intensity", "options"].forEach(key => {
          if (changes[key] !== undefined) {
            effect[key] = clone(changes[key]);
          }
        });
      });
    }

    removeEffect(id) {
      return this.update("remove-effect", data => {
        data.effects = data.effects.filter(item => item.id !== id);
      });
    }

    exportProject() {
      return JSON.stringify(this.data, null, 2);
    }

    importProject(json) {
      let imported;

      try {
        imported = typeof json === "string" ? JSON.parse(json) : clone(json);
      } catch {
        throw new Error("Invalid project JSON.");
      }

      if (!imported || !Array.isArray(imported.tracks)) {
        throw new Error("Invalid project file.");
      }

      const validTracks = imported.tracks.every(track =>
        track &&
        typeof track.id === "string" &&
        ["video", "audio", "text", "overlay"].includes(track.type) &&
        Array.isArray(track.clips)
      );

      if (!validTracks) {
        throw new Error("Project contains invalid tracks.");
      }

      this.saveHistory();

      this.data = {
        ...this.createDefaultProject(),
        ...imported,
        tracks: clone(imported.tracks),
        textLayers: Array.isArray(imported.textLayers)
          ? clone(imported.textLayers)
          : [],
        effects: Array.isArray(imported.effects)
          ? clone(imported.effects)
          : []
      };

      this.notify("import-project");
      return this.getSnapshot();
    }

    clear() {
      return this.newProject();
    }
  }

  window.VYORAProject = new ProjectManager();
})();
        
