(() => {
  "use strict";

  const DEFAULT_PROJECT = {
    id: createId("project"),
    name: "Untitled Project",
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),

    settings: {
      width: 1080,
      height: 1920,
      fps: 30,
      background: "#08090d",
      duration: 0,
      aspectRatio: "9:16"
    },

    tracks: [
      {
        id: "video-track-1",
        name: "Video",
        type: "video",
        muted: false,
        locked: false,
        visible: true,
        clips: []
      },
      {
        id: "audio-track-1",
        name: "Audio",
        type: "audio",
        muted: false,
        locked: false,
        visible: true,
        clips: []
      },
      {
        id: "text-track-1",
        name: "Text",
        type: "text",
        muted: false,
        locked: false,
        visible: true,
        clips: []
      }
    ],

    textLayers: [],
    effects: [],
    selectedClipId: null,
    selectedTrackId: "video-track-1",
    playhead: 0,
    zoom: 1
  };

  function createId(prefix = "item") {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 9)
    );
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isNumber(value) {
    return Number.isFinite(Number(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  class ProjectManager {
    constructor() {
      this.data = clone(DEFAULT_PROJECT);
      this.undoStack = [];
      this.redoStack = [];
      this.historyLimit = 80;
      this.listeners = new Set();
      this.transactionDepth = 0;
      this.transactionSnapshot = null;
    }

    getState() {
      return clone(this.data);
    }

    get settings() {
      return clone(this.data.settings);
    }

    get tracks() {
      return clone(this.data.tracks);
    }

    get duration() {
      let max = 0;

      this.data.tracks.forEach(track => {
        track.clips.forEach(clip => {
          max = Math.max(max, clip.start + clip.duration);
        });
      });

      return max;
    }

    subscribe(callback) {
      if (typeof callback !== "function") {
        throw new TypeError("Listener must be a function.");
      }

      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    emit(action = "update") {
      const state = this.getState();

      this.listeners.forEach(callback => {
        try {
          callback(state, action);
        } catch (error) {
          console.error("VYORA project listener error:", error);
        }
      });

      window.dispatchEvent(
        new CustomEvent("vyora:project-change", {
          detail: {
            action,
            project: state
          }
        })
      );
    }

    saveHistory() {
      if (this.transactionDepth > 0) return;

      this.undoStack.push(clone(this.data));

      if (this.undoStack.length > this.historyLimit) {
        this.undoStack.shift();
      }

      this.redoStack = [];
    }

    updateTimestamp() {
      this.data.updatedAt = Date.now();
    }

    update(action, callback) {
      if (typeof callback !== "function") return false;

      this.saveHistory();

      try {
        callback(this.data);
        this.updateTimestamp();
        this.emit(action);
        return true;
      } catch (error) {
        console.error("VYORA project update failed:", error);
        return false;
      }
    }

    transaction(action, callback) {
      if (typeof callback !== "function") return false;

      if (this.transactionDepth === 0) {
        this.transactionSnapshot = clone(this.data);
        this.saveHistory();
      }

      this.transactionDepth++;

      try {
        callback(this.data);
        this.transactionDepth--;

        if (this.transactionDepth === 0) {
          this.transactionSnapshot = null;
          this.updateTimestamp();
          this.emit(action);
        }

        return true;
      } catch (error) {
        this.transactionDepth = 0;

        if (this.transactionSnapshot) {
          this.data = this.transactionSnapshot;
        }

        this.transactionSnapshot = null;

        console.error("VYORA transaction failed:", error);
        this.emit("transaction-error");
        return false;
      }
    }

    undo() {
      if (!this.undoStack.length) return false;

      this.redoStack.push(clone(this.data));
      this.data = this.undoStack.pop();

      this.updateTimestamp();
      this.emit("undo");

      return true;
    }

    redo() {
      if (!this.redoStack.length) return false;

      this.undoStack.push(clone(this.data));
      this.data = this.redoStack.pop();

      this.updateTimestamp();
      this.emit("redo");

      return true;
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    newProject(name = "Untitled Project") {
      this.saveHistory();

      this.data = clone(DEFAULT_PROJECT);
      this.data.id = createId("project");
      this.data.name = String(name).trim() || "Untitled Project";
      this.data.createdAt = Date.now();
      this.data.updatedAt = Date.now();

      this.undoStack = [];
      this.redoStack = [];

      this.emit("new-project");

      return this.getState();
    }

    setName(name) {
      const cleanName = String(name || "").trim();

      if (!cleanName) return false;

      return this.update("rename-project", data => {
        data.name = cleanName.slice(0, 80);
      });
    }

    setSettings(settings = {}) {
      const allowed = [
        "width",
        "height",
        "fps",
        "background",
        "aspectRatio"
      ];

      return this.update("project-settings", data => {
        allowed.forEach(key => {
          if (settings[key] === undefined) return;

          if (key === "width" || key === "height") {
            const value = Number(settings[key]);

            if (isNumber(value) && value >= 16 && value <= 7680) {
              data.settings[key] = Math.round(value);
            }
          } else if (key === "fps") {
            const value = Number(settings[key]);

            if ([24, 25, 30, 48, 50, 60, 120].includes(value)) {
              data.settings.fps = value;
            }
          } else if (key === "background") {
            data.settings.background = String(settings[key]);
          } else if (key === "aspectRatio") {
            data.settings.aspectRatio = String(settings[key]);
          }
        });
      });
    }

    setPlayhead(time) {
      if (!isNumber(time)) return false;

      this.data.playhead = clamp(Number(time), 0, this.duration);
      this.emit("playhead");
      return true;
    }

    setZoom(value) {
      if (!isNumber(value)) return false;

      this.data.zoom = clamp(Number(value), 0.25, 8);
      this.emit("zoom");
      return true;
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
        sourceEnd:
          clipData.sourceEnd !== undefined
            ? Number(clipData.sourceEnd)
            : null,
        volume: clamp(Number(clipData.volume ?? 1), 0, 2),
        muted: Boolean(clipData.muted),
        speed: clamp(Number(clipData.speed ?? 1), 0.1, 4),
        opacity: clamp(Number(clipData.opacity ?? 1), 0, 1),
        crop: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0
        },
        effects: [],
        metadata: clone(clipData.metadata || {})
      };

      this.update("add-clip", data => {
        const target = data.tracks.find(item => item.id === trackId);

        if (!target || target.locked) {
          throw new Error("Track is locked or missing.");
        }

        target.clips.push(clip);
        target.clips.sort((a, b) => a.start - b.start);

        data.selectedClipId = clip.id;
        data.selectedTrackId = trackId;
      });

      return clone(clip);
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

    updateClip(clipId, changes = {}) {
      return this.update("update-clip", data => {
        let found = false;

        data.tracks.forEach(track => {
          const clip = track.clips.find(item => item.id === clipId);
          if (!clip) return;

          if (track.locked) {
            throw new Error("Track is locked.");
          }

          const allowed = [
            "name",
            "start",
            "duration",
            "sourceStart",
            "sourceEnd",
            "volume",
            "muted",
            "speed",
            "opacity",
            "source",
            "metadata"
          ];

          allowed.forEach(key => {
            if (changes[key] !== undefined) {
              clip[key] = changes[key];
            }
          });

          if (changes.start !== undefined) {
            clip.start = Math.max(0, Number(clip.start) || 0);
          }

          if (changes.duration !== undefined) {
            clip.duration = Math.max(0.01, Number(clip.duration) || 0.01);
          }

          if (changes.volume !== undefined) {
            clip.volume = clamp(Number(clip.volume), 0, 2);
          }

          if (changes.speed !== undefined) {
            clip.speed = clamp(Number(clip.speed), 0.1, 4);
          }

          if (changes.opacity !== undefined) {
            clip.opacity = clamp(Number(clip.opacity), 0, 1);
          }

          found = true;
        });

        if (!found) throw new Error("Clip not found.");

        data.tracks.forEach(track => {
          track.clips.sort((a, b) => a.start - b.start);
        });
      });
    }

    removeClip(clipId) {
      return this.update("remove-clip", data => {
        let removed = false;

        data.tracks.forEach(track => {
          const before = track.clips.length;

          track.clips = track.clips.filter(
            clip => clip.id !== clipId
          );

          if (track.clips.length !== before) {
            removed = true;
          }
        });

        if (!removed) throw new Error("Clip not found.");

        if (data.selectedClipId === clipId) {
          data.selectedClipId = null;
        }
      });
    }

    moveClip(clipId, targetTrackId, newStart) {
      const found = this.findClip(clipId);
      const target = this.data.tracks.find(
        track => track.id === targetTrackId
      );

      if (!found || !target || target.locked) return false;

      return this.transaction("move-clip", data => {
        const sourceTrack = data.tracks.find(
          track => track.id === found.trackId
        );

        const sourceIndex = sourceTrack.clips.findIndex(
          clip => clip.id === clipId
        );

        if (sourceIndex < 0) throw new Error("Clip not found.");

        const [clip] = sourceTrack.clips.splice(sourceIndex, 1);

        clip.start = Math.max(0, Number(newStart) || 0);

        const destination = data.tracks.find(
          track => track.id === targetTrackId
        );

        destination.clips.push(clip);
        destination.clips.sort((a, b) => a.start - b.start);

        data.selectedClipId = clipId;
        data.selectedTrackId = targetTrackId;
      });
    }

    splitClip(clipId, splitTime) {
      const found = this.findClip(clipId);
      if (!found) return null;

      const clip = found.clip;
      const localTime = Number(splitTime) - clip.start;

      if (localTime <= 0.01 || localTime >= clip.duration - 0.01) {
        return null;
      }

      const firstDuration = localTime;
      const secondDuration = clip.duration - localTime;

      const first = {
        ...clip,
        duration: firstDuration
      };

      const second = {
        ...clip,
        id: createId("clip"),
        start: clip.start + localTime,
        duration: secondDuration,
        sourceStart: clip.sourceStart + localTime * clip.speed
      };

      this.update("split-clip", data => {
        const track = data.tracks.find(
          item => item.id === found.trackId
        );

        const index = track.clips.findIndex(
          item => item.id === clipId
        );

        if (index < 0 || track.locked) {
          throw new Error("Clip cannot be split.");
        }

        track.clips.splice(index, 1, first, second);
        data.selectedClipId = second.id;
      });

      return {
        first: clone(first),
        second: clone(second)
      };
    }

    setCrop(clipId, crop = {}) {
      const allowed = ["top", "bottom", "left", "right"];

      return this.update("crop-clip", data => {
        let found = false;

        data.tracks.forEach(track => {
          const clip = track.clips.find(item => item.id === clipId);
          if (!clip) return;

          allowed.forEach(side => {
            if (crop[side] !== undefined) {
              clip.crop[side] = clamp(
                Number(crop[side]) || 0,
                0,
                95
              );
            }
          });

          found = true;
        });

        if (!found) throw new Error("Clip not found.");
      });
    }

    selectClip(clipId) {
      const found = this.findClip(clipId);
      if (!found) return false;

      this.data.selectedClipId = clipId;
      this.data.selectedTrackId = found.trackId;

      this.emit("select-clip");
      return true;
    }

    selectTrack(trackId) {
      if (!this.data.tracks.some(track => track.id === trackId)) {
        return false;
      }

      this.data.selectedTrackId = trackId;
      this.emit("select-track");
      return true;
    }

    addTextLayer(textData = {}) {
      const layer = {
        id: createId("text"),
        text: String(textData.text || "Your text"),
        x: Number(textData.x ?? 50),
        y: Number(textData.y ?? 50),
        width: Number(textData.width ?? 80),
        fontSize: Number(textData.fontSize ?? 64),
        fontFamily: textData.fontFamily || "Arial",
        fontWeight: textData.fontWeight || "700",
        color: textData.color || "#ffffff",
        background: textData.background || "transparent",
        align: textData.align || "center",
        style: textData.style || "clean",
        start: Math.max(0, Number(textData.start) || 0),
        duration: Math.max(0.1, Number(textData.duration) || 5),
        opacity: clamp(Number(textData.opacity ?? 1), 0, 1),
        rotation: Number(textData.rotation || 0),
        animation: textData.animation || "none"
      };

      this.update("add-text", data => {
        data.textLayers.push(layer);
      });

      return clone(layer);
    }

    updateTextLayer(layerId, changes = {}) {
      const allowed = [
        "text",
        "x",
        "y",
        "width",
        "fontSize",
        "fontFamily",
        "fontWeight",
        "color",
        "background",
        "align",
        "style",
        "start",
        "duration",
        "opacity",
        "rotation",
        "animation"
      ];

      return this.update("update-text", data => {
        const layer = data.textLayers.find(
          item => item.id === layerId
        );

        if (!layer) throw new Error("Text layer not found.");

        allowed.forEach(key => {
          if (changes[key] !== undefined) {
            layer[key] = changes[key];
          }
        });

        layer.x = clamp(Number(layer.x) || 0, 0, 100);
        layer.y = clamp(Number(layer.y) || 0, 0, 100);
        layer.opacity = clamp(Number(layer.opacity) || 0, 0, 1);
        layer.fontSize = clamp(Number(layer.fontSize) || 1, 1, 500);
      });
    }

    removeTextLayer(layerId) {
      return this.update("remove-text", data => {
        const before = data.textLayers.length;

        data.textLayers = data.textLayers.filter(
          layer => layer.id !== layerId
        );

        if (before === data.textLayers.length) {
          throw new Error("Text layer not found.");
        }
      });
    }

    addEffect(effectData = {}) {
      const effect = {
        id: createId("effect"),
        name: String(effectData.name || "Effect"),
        type: String(effectData.type || "basic"),
        enabled: true,
        intensity: clamp(
          Number(effectData.intensity ?? 50),
          0,
          100
        ),
        settings: clone(effectData.settings || {}),
        clipId: effectData.clipId || null
      };

      this.update("add-effect", data => {
        data.effects.push(effect);
      });

      return clone(effect);
    }

    updateEffect(effectId, changes = {}) {
      return this.update("update-effect", data => {
        const effect = data.effects.find(
          item => item.id === effectId
        );

        if (!effect) throw new Error("Effect not found.");

        if (changes.name !== undefined) {
          effect.name = String(changes.name);
        }

        if (changes.enabled !== undefined) {
          effect.enabled = Boolean(changes.enabled);
        }

        if (changes.intensity !== undefined) {
          effect.intensity = clamp(
            Number(changes.intensity) || 0,
            0,
            100
          );
        }

        if (changes.settings !== undefined) {
          effect.settings = clone(changes.settings);
        }
      });
    }

    removeEffect(effectId) {
      return this.update("remove-effect", data => {
        const before = data.effects.length;

        data.effects = data.effects.filter(
          effect => effect.id !== effectId
        );

        if (before === data.effects.length) {
          throw new Error("Effect not found.");
        }
      });
    }

    exportProject() {
      const project = this.getState();

      return {
        format: "vyora-project",
        version: 1,
        exportedAt: new Date().toISOString(),
        project
      };
    }

    importProje
