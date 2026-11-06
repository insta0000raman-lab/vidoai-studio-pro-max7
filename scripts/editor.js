(() => {
  "use strict";

  const Editor = {
    mount: null,
    project: null,
    media: null,
    timeline: null,
    tools: null,
    preview: null,
    initialized: false,
    opening: false,
    currentAssetId: null,
    unsubscribe: null,
    playbackTimer: null,

    $(selector) {
      return this.mount?.querySelector(selector) || null;
    },

    toast(message) {
      if (window.VYORA?.showToast) {
        window.VYORA.showToast(message);
        return;
      }

      const toast = document.getElementById("toastRegion");
      if (toast) {
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2500);
      } else {
        console.log("VYORA:", message);
      }
    },

    getFile(detail = {}) {
      const state = detail.state || {};
      return (
        detail.videoFile ||
        detail.selectedFile ||
        detail.file ||
        state.videoFile ||
        state.selectedFile ||
        state.file ||
        window.VYORA?.state?.videoFile ||
        window.VYORA?.state?.selectedFile ||
        null
      );
    },

    getSavedClip() {
      const selected = this.project.data.selectedClipId;
      if (selected) {
        const found = this.project.findClip(selected);
        if (found) return found.clip;
      }

      for (const track of this.project.data.tracks) {
        const clip = track.clips.find(item => item.type === "video");
        if (clip) return clip;
      }

      return null;
    },

    async init(detail = {}) {
      if (this.opening) return;
      this.opening = true;

      try {
        this.mount = document.getElementById("editorMount");
        this.project = window.VYORAProject;
        this.media = window.VYORAMedia;

        if (!this.mount || !this.project || !this.media) {
          throw new Error("Editor modules are not ready. Refresh the page.");
        }

        await this.media.initialize();

        if (!this.initialized) {
          this.buildInterface();
          this.connectModules();
          this.bindEvents();
          this.initialized = true;
        }

        this.showEditor();

        const file = this.getFile(detail);

        if (file) {
          await this.importVideo(file);
        } else {
          await this.restoreProjectMedia();
        }

        this.renderProjectInfo();
      } catch (error) {
        console.error("VYORA editor initialization error:", error);
        this.toast(error.message || "Editor could not open.");
      } finally {
        this.opening = false;
      }
    },

    showEditor() {
      document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
      });

      const screen = document.getElementById("editorScreen");
      if (screen) screen.classList.add("active");

      this.mount.style.display = "block";
    },

    buildInterface() {
      this.mount.innerHTML = `
        <div class="editor-workspace vyora-live-editor">

          <header class="editor-topbar">
            <button type="button" data-action="back">← Back</button>
            <div class="editor-project-title">
              <strong>VYORA Studio</strong>
              <input id="vyoraProjectName"
                type="text"
                value="Untitled Project"
                aria-label="Project name">
            </div>
            <div class="editor-top-actions">
              <button type="button" data-action="undo">Undo</button>
              <button type="button" data-action="redo">Redo</button>
              <button type="button" data-action="save">Save</button>
            </div>
          </header>

          <div class="editor-main-layout">

            <aside class="editor-tools-sidebar">
              <div class="editor-tabs">
                <button type="button" data-panel="media">Media</button>
                <button type="button" data-panel="crop">Crop</button>
                <button type="button" data-panel="trim">Trim</button>
                <button type="button" data-panel="text">Text</button>
                <button type="button" data-panel="audio">Audio</button>
                <button type="button" data-panel="effects">Effects</button>
                <button type="button" data-panel="transform">Adjust</button>
              </div>

              <div id="vyoraToolsPanel" class="editor-properties-panel">
                <p>Choose a tool to begin.</p>
              </div>
            </aside>

            <section class="editor-preview-section">
              <div class="editor-preview-heading">
                <span>Preview</span>
                <span id="vyoraPreviewStatus">Ready</span>
              </div>

              <div class="editor-preview-stage">
                <video id="vyoraPreviewVideo"
                  playsinline
                  preload="metadata"
                  muted></video>

                <div id="vyoraPreviewPlaceholder">
                  <strong>VYORA Studio</strong>
                  <span>Your video will appear here</span>
                </div>
              </div>

              <div class="editor-preview-controls">
                <span id="vyoraCurrentTime">00:00</span>
                <input id="vyoraSeek" type="range"
                  min="0" max="100" value="0" step="0.01">
                <span id="vyoraTotalTime">00:00</span>
                <button type="button" data-action="play">Play</button>
              </div>
            </section>

          </div>

          <section class="editor-timeline-section">
            <div class="editor-timeline-toolbar">
              <strong>Timeline</strong>
              <button type="button" data-action="add-video">+ Video</button>
              <button type="button" data-action="add-audio">+ Audio</button>
              <button type="button" data-action="add-text">+ Text</button>
              <button type="button" data-action="split">Split</button>
              <button type="button" data-action="delete">Delete</button>
            </div>

            <div id="vyoraTimelineContainer"
              class="editor-timeline-container"></div>
          </section>

          <section class="editor-export-bar">
            <label>
              Resolution
              <select id="vyoraExportResolution">
                <option value="720p">720p</option>
                <option value="1080p" selected>1080p</option>
                <option value="1440p">2K</option>
                <option value="2160p">4K</option>
              </select>
            </label>

            <label>
              FPS
              <select id="vyoraExportFPS">
                <option>24</option>
                <option selected>30</option>
                <option>60</option>
              </select>
            </label>

            <label>
              Bitrate
              <select id="vyoraExportBitrate">
                <option value="5">5 Mbps</option>
                <option value="10" selected>10 Mbps</option>
                <option value="15">15 Mbps</option>
                <option value="25">25 Mbps</option>
              </select>
            </label>

            <button type="button" data-action="export">
              Start Export
            </button>
          </section>

          <div id="vyoraEditorMessage" role="status"></div>
        </div>
      `;

      this.preview = this.$("#vyoraPreviewVideo");

      this.mount.querySelectorAll("[data-panel]").forEach(button => {
        button.addEventListener("click", () => {
          this.openTool(button.dataset.panel);
        });
      });
    },

    connectModules() {
      if (window.VYORATimeline) {
        this.timeline = window.VYORATimeline;

        try {
          this.timeline.init({
            project: this.project,
            container: this.$("#vyoraTimelineContainer")
          });
        } catch (error) {
          console.error("Timeline initialization failed:", error);
        }
      }

      if (window.VYORATools) {
        this.tools = window.VYORATools;

        try {
          this.tools.init({
            project: this.project,
            media: this.media,
            container: this.$("#vyoraToolsPanel")
          });
        } catch (error) {
          console.error("Tools initialization failed:", error);
        }
      }

      if (this.unsubscribe) this.unsubscribe();

      this.unsubscribe = this.project.subscribe(() => {
        this.renderProjectInfo();
      });

      this.media.attachPreview(this.preview);
    },

    async ensureVideoTrack() {
      let track = this.project.data.tracks.find(item =>
        item.type === "video"
      );

      if (!track) {
        track = this.project.addTrack("video", "Video 1");
      }

      return track;
    },

    async importVideo(file) {
      if (!file) return null;

      if (!this.media.isVideo(file)) {
        throw new Error("Please select a supported video file.");
      }

      this.toast("Importing video...");

      const asset = await this.media.loadVideo(file);
      if (!asset || !asset.id) {
        throw new Error("Video could not be imported.");
      }

      const track = await this.ensureVideoTrack();

      const clip = this.project.addClip(track.id, {
        type: "video",
        name: asset.name,
        assetId: asset.id,
        start: 0,
        duration: asset.duration,
        sourceStart: 0,
        sourceEnd: asset.duration,
        crop: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        },
        effects: [],
        opacity: 1,
        volume: 1
      });

      if (!clip) {
        throw new Error("Video was imported but timeline clip could not be created.");
      }

      this.currentAssetId = asset.id;
      await this.openAsset(asset.id);

      this.project.setDuration(asset.duration);
      this.project.selectClip(clip.id, track.id);

      this.renderProjectInfo();
      this.refreshTimeline();

      this.toast("Video added to timeline.");
      return asset;
    },

    async openAsset(assetId) {
      const asset = this.media.getAsset(assetId);

      if (!asset || asset.type !== "video") {
        throw new Error("Saved video file is not available.");
      }

      await this.media.openVideo(assetId, this.preview);

      this.currentAssetId = assetId;

      const placeholder = this.$("#vyoraPreviewPlaceholder");
      if (placeholder) placeholder.style.display = "none";

      this.preview.style.display = "block";

      const status = this.$("#vyoraPreviewStatus");
      if (status) status.textContent = asset.name;

      this.renderProjectInfo();
      return true;
    },

    async restoreProjectMedia() {
      const assets = this.media.getAllAssets();
      const clip = this.getSavedClip();

      if (!clip) {
        this.toast("No saved video clip found.");
        return;
      }

      const asset = assets.find(item => item.id === clip.assetId);

      if (!asset) {
        this.toast("Saved clip found, but its media file is missing.");
        return;
      }

      await this.openAsset(asset.id);
      this.project.selectClip(clip.id);

      // Restore the last saved playhead position.
      const savedTime = Number(this.project.data.playhead) || 0;
      this.media.seek(savedTime);
    },

    openTool(panel) {
      if (!this.tools) {
        this.toast("Tools module is not available.");
        return;
      }

      if (typeof this.tools.setPanel === "function") {
        this.tools.setPanel(panel);
      }

      this.mount.querySelectorAll("[data-panel]").forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.panel === panel
        );
      });
    },

    bindEvents() {
      this.mount.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const action = button.dataset.action;

        switch (action) {
          case "back":
            this.goBack();
            break;
          case "undo":
            this.project.undo();
            break;
          case "redo":
            this.project.redo();
            break;
          case "save":
            this.saveProject();
            break;
          case "play":
            this.togglePlayback();
            break;
          case "add-video":
            this.chooseMedia("video");
            break;
          case "add-audio":
            this.chooseMedia("audio");
            break;
          case "add-text":
            this.addText();
            break;
          case "split":
            this.splitSelectedClip();
            break;
          case "delete":
            this.deleteSelectedClip();
            break;
          case "export":
            this.exportProject();
            break;
        }
      });

      this.$("#vyoraProjectName").addEventListener("change", event => {
        this.project.setProjectName(event.target.value);
      });

      this.preview.addEventListener("timeupdate", () => {
        this.updatePlaybackDisplay();
        this.project.setPlayhead(this.preview.currentTime);
      });

      this.preview.addEventListener("loadedmetadata", () => {
        this.renderProjectInfo();
      });

      this.preview.addEventListener("ended", () => {
        this.updatePlaybackButton();
      });

      this.$("#vyoraSeek").addEventListener("input", event => {
        const value = Number(event.target.value);
        const duration = this.preview.duration || 0;
        if (duration > 0) {
          this.media.seek(duration * value / 100);
        }
      });

      this.$("#vyoraExportFPS").addEventListener("change", event => {
        this.project.setFPS(Number(event.target.value));
      });

      this.$("#vyoraExportResolution").addEventListener("change", () => {
        this.project.data.settings.resolution =
          this.$("#vyoraExportResolution").value;
        this.project.scheduleSave();
      });

      this.$("#vyoraExportBitrate").addEventListener("change", () => {
        this.project.data.settings.bitrate =
          Number(this.$("#vyoraExportBitrate").value);
        this.project.scheduleSave();
      });

      this.preview.addEventListener("error", () => {
        this.toast("Video preview could not be loaded.");
      });
    },

    chooseMedia(type) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = type === "video"
        ? "video/*"
        : "audio/*";

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
          if (type === "video") {
            await this.importVideo(file);
          } else {
            const asset = await this.media.loadAudio(file);
            const track = this.project.data.tracks.find(t =>
              t.type === "audio"
            ) || this.project.addTrack("audio", "Audio");

            this.project.addClip(track.id, {
              type: "audio",
              name: asset.name,
              assetId: asset.id,
              start: this.project.data.playhead || 0,
              duration: asset.duration,
              sourceStart: 0,
              sourceEnd: asset.duration,
              volume: 1
            });

            this.toast("Audio added to timeline.");
            this.refreshTimeline();
          }
        } catch (error) {
          console.error(error);
          this.toast(error.message || "Import failed.");
        }
      };

      input.click();
    },

    async togglePlayback() {
      if (!this.currentAssetId) {
        this.toast("Import a video first.");
        return;
      }

      if (this.preview.paused) {
        await this.media.playVideo();
      } else {
        this.media.pauseVideo();
      }

      this.updatePlaybackButton();
    },

    updatePlaybackButton() {
      const button = this.$('[data-action="play"]');
      if (button) {
        button.textContent = this.preview.paused ? "Play" : "Pause";
      }
    },

    updatePlaybackDisplay() {
      const current = this.$("#vyoraCurrentTime");
      const total = this.$("#vyoraTotalTime");
      const seek = this.$("#vyoraSeek");

      const format = seconds => {
        seconds = Math.max(0, Number(seconds) || 0);
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);

        return String(mins).padStart(2, "0") + ":" +
          String(secs).padStart(2, "0");
      };

      const duration = Number.isFinite(this.preview.duration)
        ? this.preview.duration : 0;

      if (current) current.textContent = format(this.preview.currentTime);
      if (total) total.textContent = format(duration);

      if (seek) {
        seek.value = duration
          ? (this.preview.currentTime / duration) * 100
          : 0;
      }

      this.updatePlaybackButton();
    },

    addText() {
      if (!this.tools || typeof this.tools.addText !== "function") {
        this.toast("Text tool is not available.");
        return;
      }

      this.openTool("text");
      this.tools.addText();
      this.refreshTimeline();
    },

    splitSelectedClip() {
      const clipId = this.project.data.selectedClipId;
      if (!clipId) {
        this.toast("Select a timeline clip first.");
        return;
      }

      const time = this.preview.currentTime;
      const result = this.project.splitClip(clipId, time);

      if (!result) {
        this.toast("Move the playhead inside the selected clip.");
        return;
      }

      this.refreshTimeline();
      this.toast("Clip split.");
    },

    deleteSelectedClip() {
      const clipId = this.project.data.selectedClipId;
      if (!clipId) {
        this.toast("Select a clip first.");
        return;
      }

      this.project.removeClip(clipId);
      this.refreshTimeline();
      this.toast("Clip deleted.");
    },

    refreshTimeline() {
      if (this.timeline && typeof this.timeline.render === "function") {
        this.timeline.render();
      }
    },

    renderProjectInfo() {
      if (!this.mount) return;

      const name = this.$("#vyoraProjectName");
      if (name && document.activeElement !== name) {
        name.value = this.project.data.name || "Untitled Project";
      }

      const duration = this.preview?.duration || this.project.data.duration || 0;
      const total = this.$("#vyoraTotalTime");

      if (total) {
        const mins = Math.floor(duration / 60);
        const secs = Math.floor(duration % 60);
        total.textContent =
          String(mins).padStart(2, "0") + ":" +
          String(secs).padStart(2, "0");
      }

      this.updatePlaybackDisplay();
    },

    saveProject() {
      const saved = this.project.saveNow();

      if (saved) {
        this.toast("Project saved on this device.");
      } else {
        this.toast("Project could not be saved. Check device storage.");
      }
    },

    async exportProject() {
      const exporter = window.VYORAExporter;

      if (!exporter) {
        this.toast("Export module is not available yet.");
        return;
      }

      const settings = {
        resolution: this.$("#vyoraExportResolution").value,
        fps: Number(this.$("#vyoraExportFPS").value),
        bitrate: Number(this.$("#vyoraExportBitrate").value)
      };

      try {
        if (typeof exporter.exportVideo === "function") {
          await exporter.exportVideo(settings);
        } else if (typeof exporter.exportProject === "function") {
          await exporter.exportProject(settings);
        } else {
          this.toast("Export function is not connected yet.");
        }
      } catch (error) {
        console.error("VYORA export error:", error);
        this.toast(error.message || "Export failed.");
      }
    },

    goBack() {
      this.saveProject();

      const editorScreen = document.getElementById("editorScreen");
      const homeScreen = document.getElementById("homeScreen");
            if (editorScreen) editorScreen.classList.remove("active");
      if (homeScreen) homeScreen.classList.add("active");
    }
  };

  window.VYORAEditor = Editor;

  window.addEventListener("vyora:open-editor", event => {
    Editor.init(event.detail || {});
  });

  window.addEventListener("vyora:media-ready", () => {
    if (Editor.initialized && !Editor.currentAssetId) {
      Editor.restoreProjectMedia().catch(console.error);
    }
  });

})();
