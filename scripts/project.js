
(() => {
  "use strict";

  const STORAGE_KEY = "vyora_studio_project_v2";

  class ProjectManager {
    constructor() {
      this.listeners = new Set();
      this.history = [];
      this.future = [];
      this.maxHistory = 60;
      this.saveTimer = null;
      this.data = this.loadSavedProject() || this.createDefaultProject();

      // Keep a compatibility alias for older modules.
      Object.defineProperty(this, "state", {
        configurable: true,
        get: () => this.data
      });

      this.saveNow();
    }

    createDefaultProject() {
      return {
        id: this.createId("project"),
        name: "Untitled Project",
        version: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        canvas: {
          width: 1080,
          height: 1920,
          ratio: "9:16"
        },
        fps: 30,
        duration: 0,
        playhead: 0,
        zoom: 1,
        selectedClipId: null,
        selectedTrackId: null,
        tracks: [
          {
            id: this.createId("track"),
            type: "video",
            name: "Video 1",
            muted: false,
            hidden: false,
            locked: false,
            clips: []
          },
          {
            id: this.createId("track"),
            type: "audio",
            name: "Audio",
            muted: false,
            hidden: false,
            locked: false,
            clips: []
          },
          {
            id: this.createId("track"),
            type: "text",
            name: "Text",
            muted: false,
            hidden: false,
            locked: false,
            clips: []
          }
        ],
        textLayers: [],
        effects: [],
        settings: {
          background: "#000000",
          resolution: "1080p",
          exportFPS: 30,
          bitrate: 10
        }
      };
    }

    createId(prefix = "item") {
      return prefix + "_" + Date.now().toString(36) +
        "_" + Math.random().toString(36).slice(2, 9);
    }

    clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    loadSavedProject() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const saved = JSON.parse(raw);
        if (!saved || !Array.isArray(saved.tracks)) return null;

        // Repair missing fields from older project versions.
        const defaults = this.createDefaultProject();

        saved.canvas = saved.canvas || defaults.canvas;
        saved.settings = saved.settings || defaults.settings;
        saved.textLayers = Array.isArray(saved.textLayers)
          ? saved.textLayers : [];
        saved.effects = Array.isArray(saved.effects)
          ? saved.effects : [];
        saved.tracks = saved.tracks.map((track) => ({
          id: track.id || this.createId("track"),
          type: track.type || "video",
          name: track.name || "Track",
          muted: !!track.muted,
          hidden: !!track.hidden,
          locked: !!track.locked,
          clips: Array.isArray(track.clips) ? track.clips : []
        }));

        return saved;
      } catch (error) {
        console.error("VYORA project restore failed:", error);
        return null;
      }
    }

    saveNow() {
      try {
        this.data.updatedAt = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        return true;
      } catch (error) {
        console.error("VYORA project save failed:", error);
        this.emit("save-error", error);
        return false;
      }
    }

    scheduleSave() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        this.saveNow();
      }, 250);
    }

    getSnapshot() {
      return this.clone(this.data);
    }

    subscribe(callback) {
      if (typeof callback !== "function") return () => {};
      this.listeners.add(callback);
      callback(this.getSnapshot());

      return () => this.listeners.delete(callback);
    }

    notify() {
      this.scheduleSave();
      const snapshot = this.getSnapshot();

      this.listeners.forEach((callback) => {
        try {
          callback(snapshot);
        } catch (error) {
          console.error("VYORA subscriber error:", error);
        }
      });
    }

    emit(name, detail = {}) {
      window.dispatchEvent(new CustomEvent("vyora:project-" + name, {
        detail
      }));
    }

    saveHistory() {
      this.history.push(this.clone(this.data));
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.future = [];
    }

    update(callback, saveHistory = true) {
      if (typeof callback !== "function") return false;

      if (saveHistory) this.saveHistory();

      try {
        callback(this.data);
        this.notify();
        return true;
      } catch (error) {
        console.error("VYORA project update failed:", error);
        return false;
      }
    }

    undo() {
      if (!this.history.length) return false;

      this.future.push(this.clone(this.data));
      this.data = this.history.pop();
      this.notify();
      return true;
    }

    redo() {
      if (!this.future.length) return false;

      this.history.push(this.clone(this.data));
      this.data = this.future.pop();
      this.notify();
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
      const fresh = this.createDefaultProject();
      fresh.name = name;
      this.data = fresh;
      this.notify();
      return this.getSnapshot();
    }

    setProjectName(name) {
      return this.update((state) => {
        state.name = String(name || "Untitled Project").slice(0, 100);
      });
    }

    setCanvas(width, height, ratio = "Custom") {
      width = Math.max(1, Math.round(Number(width) || 1080));
      height = Math.max(1, Math.round(Number(height) || 1920));

      return this.update((state) => {
        state.canvas = { width, height, ratio };
      });
    }

    setFPS(fps) {
      fps = Math.max(1, Math.min(120, Number(fps) || 30));
      return this.update((state) => {
        state.fps = fps;
        state.settings.exportFPS = fps;
      });
    }

    setDuration(duration) {
      duration = Math.max(0, Number(duration) || 0);
      return this.update((state) => {
        state.duration = duration;
      }, false);
    }

    setPlayhead(time) {
      this.data.playhead = Math.max(0, Number(time) || 0);
      this.scheduleSave();
      this.emit("playhead", { time: this.data.playhead });
      return this.data.playhead;
    }

    setZoom(zoom) {
      this.data.zoom = Math.max(0.1, Math.min(10, Number(zoom) || 1));
      this.scheduleSave();
      this.emit("zoom", { zoom: this.data.zoom });
      return this.data.zoom;
    }

    addTrack(type = "video", name) {
      const allowed = ["video", "audio", "text", "overlay"];
      if (!allowed.includes(type)) type = "video";

      const track = {
        id: this.createId("track"),
        type,
        name: name || (
          type.charAt(0).toUpperCase() + type.slice(1) +
          " " + (this.data.tracks.filter(t => t.type === type).length + 1)
        ),
        muted: false,
        hidden: false,
        locked: false,
        clips: []
      };

      this.update((state) => {
        state.tracks.push(track);
      });

      return track;
    }

    getTrack(trackId) {
      return this.data.tracks.find(track => track.id === trackId) || null;
    }

    updateTrack(trackId, changes = {}) {
      return this.update((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (track) Object.assign(track, changes);
      });
    }

    removeTrack(trackId) {
      return this.update((state) => {
        state.tracks = state.tracks.filter(t => t.id !== trackId);
      });
    }

    addClip(trackId, clipData = {}) {
      const track = this.getTrack(trackId);
      if (!track) return null;

      const duration = Math.max(0, Number(clipData.duration) || 0);
      const clip = {
        id: clipData.id || this.createId("clip"),
        type: clipData.type || track.type,
        name: clipData.name || "Clip",
        assetId: clipData.assetId || null,
        start: Math.max(0, Number(clipData.start) || 0),
        duration,
        sourceStart: Math.max(0, Number(clipData.sourceStart) || 0),
        sourceEnd: Number.isFinite(Number(clipData.sourceEnd))
          ? Number(clipData.sourceEnd)
          : duration,
        crop: clipData.crop || {
          top: 0, right: 0, bottom: 0, left: 0
        },
        effects: Array.isArray(clipData.effects)
          ? clipData.effects : [],
        opacity: Number.isFinite(Number(clipData.opacity))
          ? Math.max(0, Math.min(1, Number(clipData.opacity)))
          : 1,
        volume: Number.isFinite(Number(clipData.volume))
          ? Math.max(0, Math.min(2, Number(clipData.volume)))
          : 1,
        ...clipData
      };

      this.update((state) => {
        const target = state.tracks.find(t => t.id === trackId);
        if (target) target.clips.push(clip);
        state.selectedClipId = clip.id;
        state.selectedTrackId = trackId;
        state.duration = Math.max(
          state.duration,
          clip.start + clip.duration
        );
      });

      return clip;
    }

    findClip(clipId) {
      for (const track of this.data.tracks) {
        const clip = track.clips.find(c => c.id === clipId);
        if (clip) return { track, clip };
      }
      return null;
    }

    getClip(clipId) {
      const found = this.findClip(clipId);
      return found ? found.clip : null;
    }

    updateClip(clipId, changes = {}) {
      return this.update(() => {
        const found = this.findClip(clipId);
        if (found) Object.assign(found.clip, changes);
      });
    }

    removeClip(clipId) {
      return this.update((state) => {
        state.tracks.forEach((track) => {
          track.clips = track.clips.filter(c => c.id !== clipId);
        });

        if (state.selectedClipId === clipId) {
          state.selectedClipId = null;
        }
      });
    }

    selectClip(clipId, trackId = null) {
      this.data.selectedClipId = clipId || null;
      this.data.selectedTrackId = trackId ||
        (clipId && this.findClip(clipId)?.track.id) || null;

      this.scheduleSave();
      this.emit("selection", {
        clipId: this.data.selectedClipId,
        trackId: this.data.selectedTrackId
      });
    }

    getSelectedClip() {
      return this.getClip(this.data.selectedClipId);
    }

    moveClip(clipId, newStart, newTrackId = null) {
      const found = this.findClip(clipId);
      if (!found) return false;

      newStart = Math.max(0, Number(newStart) || 0);

      return this.update((state) => {
        const sourceTrack = state.tracks.find(t =>
          t.clips.some(c => c.id === clipId)
        );
        const clip = sourceTrack?.clips.find(c => c.id === clipId);
        if (!clip) return;

        sourceTrack.clips = sourceTrack.clips.filter(c => c.id !== clipId);
        clip.start = newStart;

        const destination = newTrackId
          ? state.tracks.find(t => t.id === newTrackId)
          : sourceTrack;

        if (destination) destination.clips.push(clip);
        else sourceTrack.clips.push(clip);
      });
    }

    splitClip(clipId, splitAt) {
      const found = this.findClip(clipId);
      if (!found) return null;

      const clip = found.clip;
      const localTime = Number(splitAt) - clip.start;

      if (localTime <= 0.05 || localTime >= clip.duration - 0.05) {
        return null;
      }

      let secondClip = null;

      this.update(() => {
        const firstDuration = localTime;
        const originalDuration = clip.duration;
        const sourceStart = Number(clip.sourceStart) || 0;

        secondClip = {
          ...this.clone(clip),
          id: this.createId("clip"),
          start: clip.start + firstDuration,
          duration: originalDuration - firstDuration,
          sourceStart: sourceStart + firstDuration
        };

        clip.duration = firstDuration;
        clip.sourceEnd = sourceStart + firstDuration;
        found.track.clips.push(secondClip);
      });

      return secondClip;
    }

    addTextLayer(textData = {}) {
      const layer = {
        id: this.createId("text"),
        text: "Your text",
        start: 0,
        duration: 5,
        x: 0.5,
        y: 0.5,
        fontSize: 64,
        fontFamily: "Arial",
        color: "#ffffff",
        align: "center",
        bold: false,
        italic: false,
        ...textData
      };

      this.update((state) => {
        state.textLayers.push(layer);
      });

      return layer;
    }

    updateTextLayer(id, changes = {}) {
      return this.update((state) => {
        const layer = state.textLayers.find(item => item.id === id);
        if (layer) Object.assign(layer, changes);
      });
    }

    removeTextLayer(id) {
      return this.update((state) => {
        state.textLayers = state.textLayers.filter(item => item.id !== id);
      });
    }

    addEffect(effectData = {}) {
      const effect = {
        id: this.createId("effect"),
        type: "brightness",
        value: 1,
        enabled: true,
        ...effectData
      };

      this.update((state) => {
        state.effects.push(effect);
      });

      return effect;
    }

    updateEffect(id, changes = {}) {
      return this.update((state) => {
        const effect = state.effects.find(item => item.id === id);
        if (effect) Object.assign(effect, changes);
      });
    }

    removeEffect(id) {
      return this.update((state) => {
        state.effects = state.effects.filter(item => item.id !== id);
      });
    }

    exportProject() {
      return JSON.stringify(this.data, null, 2);
    }

    importProject(json) {
      try {
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        if (!parsed || !Array.isArray(parsed.tracks)) {
          throw new Error("Invalid project file");
        }

        this.saveHistory();
        this.data = parsed;
        this.notify();
        return true;
      } catch (error) {
        console.error("VYORA import failed:", error);
        return false;
      }
    }

    clear() {
      clearTimeout(this.saveTimer);
      localStorage.removeItem(STORAGE_KEY);
      this.history = [];
      this.future = [];
      this.data = this.createDefaultProject();
      this.notify();
    }

    destroy() {
      clearTimeout(this.saveTimer);
      this.saveNow();
      this.listeners.clear();
    }
  }

  window.VYORAProject = new ProjectManager();

  // Save immediately when the page is being closed or refreshed.
  window.addEventListener("pagehide", () => {
    window.VYORAProject.saveNow();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      window.VYORAProject.saveNow();
    }
  });

})();
