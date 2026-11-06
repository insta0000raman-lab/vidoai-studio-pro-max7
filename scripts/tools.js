/* =========================================================
   VYORA STUDIO — COMPLETE EDITING TOOLS
   File: scripts/tools.js
   ========================================================= */

(() => {
  "use strict";

  const Tools = {
    project: null,
    media: null,
    container: null,
    currentPanel: "media",
    initialized: false,

    panels: [
      { id: "media", label: "Media", icon: "▣" },
      { id: "crop", label: "Crop", icon: "▧" },
      { id: "trim", label: "Trim", icon: "✂" },
      { id: "text", label: "Text", icon: "T" },
      { id: "audio", label: "Audio", icon: "♫" },
      { id: "effects", label: "Effects", icon: "✧" },
      { id: "adjust", label: "Adjust", icon: "☷" },
      { id: "transform", label: "Transform", icon: "↗" }
    ],

    /* ---------- INITIALIZATION ---------- */

    init(options = {}) {
      this.project = options.project || window.VYORAProject;
      this.media = options.media || window.VYORAMedia;
      this.container = options.container ||
        document.getElementById("vyoraToolsContainer");

      if (!this.project || !this.media || !this.container) {
        console.error("VYORA Tools: Required modules are missing.");
        return false;
      }

      this.initialized = true;
      this.render();
      return this;
    },

    getState() {
      return this.project?.data ||
        this.project?.state ||
        {};
    },

    getSelectedClip() {
      if (typeof this.project.getSelectedClip === "function") {
        return this.project.getSelectedClip();
      }

      const state = this.getState();
      const id = state.selectedClipId || state.selectedClip;

      for (const track of state.tracks || []) {
        const clip = (track.clips || []).find(item => item.id === id);
        if (clip) return clip;
      }

      return null;
    },

    notify(message) {
      if (window.VYORA?.showToast) {
        window.VYORA.showToast(message);
      } else {
        console.log("VYORA:", message);
      }
    },

    updateClip(id, changes) {
      if (typeof this.project.updateClip === "function") {
        return this.project.updateClip(id, changes);
      }

      const state = this.getState();

      for (const track of state.tracks || []) {
        const clip = (track.clips || []).find(item => item.id === id);

        if (clip) {
          Object.assign(clip, changes);

          if (typeof this.project.save === "function") {
            this.project.save();
          }

          if (typeof this.project.notify === "function") {
            this.project.notify();
          }

          return clip;
        }
      }

      return null;
    },

    updateProject(changes) {
      if (typeof this.project.update === "function") {
        this.project.update(changes);
        return;
      }

      Object.assign(this.getState(), changes);

      if (typeof this.project.save === "function") {
        this.project.save();
      }
    },

    /* ---------- PANEL CONTROL ---------- */

    setPanel(panel) {
      const exists = this.panels.some(item => item.id === panel);

      if (!exists) return false;

      this.currentPanel = panel;
      this.render();
      return true;
    },

    render() {
      if (!this.container) return;

      this.container.innerHTML = `
        <div class="vyora-tools">

          <div class="vyora-tool-heading">
            <div>
              <div class="vyora-tool-title">EDIT TOOLS</div>
              <div class="vyora-tool-subtitle">Professional controls</div>
            </div>
          </div>

          <div class="vyora-tool-tabs">
            ${this.panels.map(panel => `
              <button
                type="button"
                class="vyora-tool-tab ${
                  this.currentPanel === panel.id ? "active" : ""
                }"
                data-tool-panel="${panel.id}"
              >
                <span>${panel.icon}</span>
                <small>${panel.label}</small>
              </button>
            `).join("")}
          </div>

          <div class="vyora-tool-content" id="vyoraToolContent">
            ${this.getPanelHTML()}
          </div>

        </div>
      `;

      this.addStyles();
      this.bindEvents();
    },

    getPanelHTML() {
      const renderers = {
        media: () => this.mediaPanel(),
        crop: () => this.cropPanel(),
        trim: () => this.trimPanel(),
        text: () => this.textPanel(),
        audio: () => this.audioPanel(),
        effects: () => this.effectsPanel(),
        adjust: () => this.adjustPanel(),
        transform: () => this.transformPanel()
      };

      return renderers[this.currentPanel]?.() || "";
    },

    /* ---------- MEDIA PANEL ---------- */

    mediaPanel() {
      const assets = this.media.getAllAssets();

      return `
        <div class="vyora-panel">
          <h3>Media Library</h3>
          <p class="vyora-muted">Imported videos and audio files</p>

          <div class="vyora-media-actions">
            <button class="vyora-primary-btn" data-action="import-video">
              + Import Video
            </button>

            <button class="vyora-secondary-btn" data-action="import-audio">
              + Import Audio
            </button>
          </div>

          <div class="vyora-asset-list">
            ${assets.length ? assets.map(asset => `
              <div class="vyora-asset">
                <div class="vyora-asset-icon">
                  ${asset.type === "video" ? "▣" : "♫"}
                </div>

                <div class="vyora-asset-info">
                  <strong>${this.escape(asset.name)}</strong>
                  <small>
                    ${this.formatTime(asset.duration)}
                    · ${this.formatSize(asset.size)}
                  </small>
                </div>

                <button
                  data-action="insert-asset"
                  data-id="${asset.id}"
                >+</button>
              </div>
            `).join("") : `
              <div class="vyora-empty">
                No media imported yet.
              </div>
            `}
          </div>
        </div>
      `;
    },

    /* ---------- CROP PANEL ---------- */

    cropPanel() {
      const clip = this.getSelectedClip();
      const crop = clip?.crop || {
        x: 0, y: 0, width: 1, height: 1
      };

      return `
        <div class="vyora-panel">
          <h3>Crop & Frame</h3>
          <p class="vyora-muted">Adjust visible video area</p>

          ${this.rangeControl("crop-x", "Horizontal position", crop.x, 0, 1, 0.01)}
          ${this.rangeControl("crop-y", "Vertical position", crop.y, 0, 1, 0.01)}
          ${this.rangeControl("crop-width", "Width", crop.width, 0.05, 1, 0.01)}
          ${this.rangeControl("crop-height", "Height", crop.height, 0.05, 1, 0.01)}

          <button class="vyora-secondary-btn" data-action="reset-crop">
            Reset Crop
          </button>

          <div class="vyora-note">
            Select a video clip before changing crop settings.
          </div>
        </div>
      `;
    },

    /* ---------- TRIM PANEL ---------- */

    trimPanel() {
      const clip = this.getSelectedClip();

      if (!clip) {
        return this.noSelection("Select a clip to trim.");
      }

      const sourceStart = Number(clip.sourceStart || 0);
      const sourceEnd = Number(
        clip.sourceEnd ?? clip.duration
      );

      return `
        <div class="vyora-panel">
          <h3>Trim Clip</h3>
          <p class="vyora-muted">Set source in and out points</p>

          <div class="vyora-info-card">
            <span>Clip duration</span>
            <strong>${this.formatTime(clip.duration)}</strong>
          </div>

          ${this.numberControl(
            "trim-start",
            "Start time (seconds)",
            sourceStart,
            0,
            Math.max(0, sourceEnd - 0.05)
          )}

          ${this.numberControl(
            "trim-end",
            "End time (seconds)",
            sourceEnd,
            sourceStart + 0.05,
            86400
          )}

          <button class="vyora-primary-btn" data-action="apply-trim">
            Apply Trim
          </button>
        </div>
      `;
    },

    /* ---------- TEXT PANEL ---------- */

    textPanel() {
      const state = this.getState();
      const layers = state.textLayers || [];

      return `
        <div class="vyora-panel">
          <h3>Text Studio</h3>
          <p class="vyora-muted">Create titles and captions</p>

          <label class="vyora-label">Text content</label>

          <textarea
            id="vyoraTextValue"
            class="vyora-input"
            rows="3"
            placeholder="Enter your text..."
          ></textarea>

          <div class="vyora-grid-two">
            <div>
              <label class="vyora-label">Font size</label>
              <input
                id="vyoraTextSize"
                class="vyora-input"
                type="number"
                min="8"
                max="300"
                value="64"
              >
            </div>

            <div>
              <label class="vyora-label">Color</label>
              <input
                id="vyoraTextColor"
                type="color"
                value="#ffffff"
                class="vyora-color"
              >
            </div>
          </div>

          <label class="vyora-label">Font family</label>

          <select id="vyoraTextFont" class="vyora-input">
            <option value="Arial">Arial</option>
            <option value="Inter">Inter</option>
            <option value="Georgia">Georgia</option>
            <option value="Impact">Impact</option>
            <option value="sans-serif">Sans Serif</option>
            <option value="serif">Serif</option>
          </select>

          <label class="vyora-label">Alignment</label>

          <select id="vyoraTextAlign" class="vyora-input">
            <option value="center">Center</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>

          <button class="vyora-primary-btn" data-action="add-text">
            + Add Text Layer
          </button>

          <h4>Text Layers</h4>

          <div class="vyora-layer-list">
            ${layers.length ? layers.map(layer => `
              <div class="vyora-layer">
                <span>${this.escape(layer.text || "Text")}</span>
                <button
                  data-action="delete-text"
                  data-id="${layer.id}"
                >×</button>
              </div>
            `).join("") : `
              <div class="vyora-empty">No text layers yet.</div>
            `}
          </div>
        </div>
      `;
    },

    /* ---------- AUDIO PANEL ---------- */

    audioPanel() {
      const state = this.getState();
      const audioTracks = (state.tracks || []).filter(
        track => track.type === "audio"
      );

      return `
        <div class="vyora-panel">
          <h3>Audio Studio</h3>
          <p class="vyora-muted">Import and manage audio</p>

          <button class="vyora-primary-btn" data-action="import-audio">
            + Import Audio
          </button>

          <label class="vyora-label">Preview volume</label>

          <input
            class="vyora-range"
            type="range"
            id="vyoraAudioVolume"
            min="0"
            max="1"
            step="0.01"
            value="1"
          >

          <label class="vyora-label">Fade in (seconds)</label>
          <input
            class="vyora-input"
            type="number"
            id="vyoraFadeIn"
            min="0"
            max="30"
            value="0"
          >

          <label class="vyora-label">Fade out (seconds)</label>
          <input
            class="vyora-input"
            type="number"
            id="vyoraFadeOut"
            min="0"
            max="30"
            value="0"
          >

          <button class="vyora-secondary-btn" data-action="apply-fades">
            Apply Audio Fades
          </button>

          <h4>Audio Tracks (${audioTracks.length})</h4>
          ${audioTracks.map(track => `
            <div class="vyora-layer">
              <span>${this.escape(track.name || "Audio Track")}</span>
              <small>${(track.clips || []).length} clips</small>
            </div>
          `).join("")}
        </div>
      `;
    },

    /* ---------- EFFECTS PANEL ---------- */

    effectsPanel() {
      const effects = [
        ["blur", "Blur"],
        ["sharpen", "Sharpen"],
        ["grayscale", "Grayscale"],
        ["sepia", "Sepia"],
        ["vintage", "Vintage"],
        ["brightness", "Brightness"],
        ["contrast", "Contrast"],
        ["saturate", "Saturation"],
        ["vignette", "Vignette"]
      ];

      const clip = this.getSelectedClip();

      return `
        <div class="vyora-panel">
          <h3>Effects Library</h3>
          <p class="vyora-muted">Choose an effect for selected clip</p>

          <div class="vyora-effect-grid">
            ${effects.map(([id, name]) => `
              <button
                class="vyora-effect-button"
                data-action="add-effect"
                data-effect="${id}"
              >
                <span>✧</span>
                ${name}
              </button>
            `).join("")}
          </div>

          <h4>Applied Effects</h4>

          <div class="vyora-layer-list">
            ${(clip?.effects || []).map((effect, index) => `
              <div class="vyora-layer">
                <span>${this.escape(
                  typeof effect === "string" ? effect : effect.name
                )}</span>

                <button
                  data-action="remove-effect"
                  data-index="${index}"
                >×</button>
              </div>
            `).join("") || `
              <div class="vyora-empty">No effects applied.</div>
            `}
          </div>

          <div class="vyora-note">
            Effect controls are stored with the clip. Actual rendering
            depends on the preview and export engine.
          </div>
        </div>
      `;
    },

    /* ---------- ADJUST PANEL ---------- */

    adjustPanel() {
      const clip = this.getSelectedClip();
      const settings = clip?.adjustments || {};

      const controls = [
        ["brightness", "Brightness", 0, 200, 100],
        ["contrast", "Contrast", 0, 200, 100],
        ["saturation", "Saturation", 0, 200, 100],
        ["temperature", "Temperature", -100, 100, 0],
        ["exposure", "Exposure", -100, 100, 0]
      ];

      return `
        <div class="vyora-panel">
          <h3>Color & Adjustments</h3>
          <p class="vyora-muted">Fine tune your video appearance</p>

          ${controls.map(([id, label, min, max, defaultValue]) =>
            this.rangeControl(
              "adjust-" + id,
              label,
              settings[id] ?? defaultValue,
              min,
              max,
              1
            )
          ).join("")}

          <button class="vyora-secondary-btn" data-action="reset-adjust">
            Reset Adjustments
          </button>
        </div>
      `;
    },

    /* ---------- TRANSFORM PANEL ---------- */

    transformPanel() {
      const clip = this.getSelectedClip();
      const transform = clip?.transform || {};

      return `
        <div class="vyora-panel">
          <h3>Transform</h3>
          <p class="vyora-muted">Position, scale and rotation</p>

          ${this.rangeControl(
            "transform-scale",
            "Scale (%)",
            transform.scale ?? 100,
            10,
            400,
            1
          )}

          ${this.rangeControl(
            "transform-rotation",
            "Rotation (degrees)",
            transform.rotation ?? 0,
            -180,
            180,
            1
          )}

          ${this.rangeControl(
            "transform-x",
            "Horizontal position",
            transform.x ?? 0,
            -1000,
            1000,
            1
          )}

          ${this.rangeControl(
            "transform-y",
            "Vertical position",
            transform.y ?? 0,
            -1000,
            1000,
            1
          )}

          <button class="vyora-secondary-btn" data-action="reset-transform">
            Reset Transform
          </button>
        </div>
      `;
    },

    /* ---------- INPUT HELPERS ---------- */

    rangeControl(id, label, value, min, max, step) {
      return `
        <div class="vyora-control">
          <div class="vyora-control-heading">
            <label for="${id}">${label}</label>
            <output id="${id}-value">${value}</output>
          </div>

          <input
            class="vyora-range"
            type="range"
            id="${id}"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${value}"
          >
        </div>
      `;
    },

    numberControl(id, label, value, min, max) {
      return `
        <div class="vyora-control">
          <label class="vyora-label" for="${id}">${label}</label>

          <input
            class="vyora-input"
            type="number"
            id="${id}"
            min="${min}"
            max="${max}"
            step="0.01"
            value="${value}"
          >
        </div>
      `;
    },

    noSelection(message) {
      return `
        <div class="vyora-panel">
          <h3>Editing Tools</h3>
          <div class="vyora-empty">${message}</div>
        </div>
      `;
    },

    /* ---------- EVENT BINDING ---------- */

    bindEvents() {
      const root = this.container;

      root.querySelectorAll("[data-tool-panel]").forEach(button => {
        button.addEventListener("click", () => {
          this.setPanel(button.dataset.toolPanel);
        });
      });

      root.querySelectorAll("[data-action]").forEach(button => {
        button.addEventListener("click", () => {
          this.handleAction(button.dataset.action, button);
        });
      });

      root.querySelectorAll('input[type="range"]').forEach(input => {
        input.addEventListener("input", () => {
          const output = root.querySelector(
            "#" + CSS.escape(input.id) + "-value"
          );

          if (output) output.textContent = input.value;

          this.handleRange(input.id, Number(input.value));
        });
      });
    },

    /* ---------- ACTION ROUTER ---------- */

    async handleAction(action, button) {
      try {
        switch (action) {
          case "import-video":
            this.pickFile("video");
            break;

          case "import-audio":
            this.pickFile("audio");
            break;

          case "insert-asset":
            await this.insertAsset(button.dataset.id);
            break;

          case "add-text":
            this.addText();
            break;

          case "delete-text":
            this.deleteText(button.dataset.id);
            break;

          case "reset-crop":
            this.resetCrop();
            break;

          case "apply-trim":
            this.applyTrim();
            break;

          case "add-effect":
            this.addEffect(button.dataset.effect);
            break;

          case "remove-effect":
            this.removeEffect(Number(button.dataset.index));
            break;

          case "reset-adjust":
            this.resetAdjustments();
            break;

          case "reset-transform":
            this.resetTransform();
            break;

          case "apply-fades":
            this.applyFades();
            break;

          default:
            console.warn("Unknown VYORA tool action:", action);
        }
      } catch (error) {
        console.error(error);
        this.notify(this.formatError(error));
      }
    },

/* ---------- FILE PICKER ---------- */

    pickFile(type) {
      const input = document.createElement("input");

      input.type = "file";
      input.accept = type === "video"
        ? "video/*"
        : "audio/*";

      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;

        try {
          let asset;

          if (type === "video") {
            asset = await this.media.loadVideo(file);
          } else {
            asset = await this.media.loadAudio(file);
          }

          if (!asset) {
            throw new Error("Media could not be loaded.");
          }

          this.insertAsset(asset, type);
          this.notify("Media imported successfully.");
          this.refresh();

        } catch (error) {
          console.error("VYORA import error:", error);
          this.notify(this.formatError(error));
        }
      };

      input.click();
    },

    /* ---------- INSERT ASSET ---------- */

    insertAsset(asset, type) {
      if (!asset || !this.project) return;

      let track = this.getTrack(type);

      if (!track) {
        track = this.project.addTrack(
          type,
          type === "video" ? "Video 1" : "Audio 1"
        );
      }

      if (!track) {
        throw new Error("Timeline track could not be created.");
      }

      const duration = Math.max(
        0.1,
        Number(asset.duration) || 5
      );

      const clipId = this.makeId();

      const clip = {
        id: clipId,
        assetId: asset.id,
        name: asset.name || asset.fileName || "Media",
        type,
        start: Number(this.project.data.playhead) || 0,
        duration,
        sourceStart: 0,
        sourceEnd: duration,
        offset: 0
      };

      this.project.addClip(track.id, clip);

      if (type === "video") {
        const video = document.getElementById("vyoraPreviewVideo");

        if (video && this.media.openVideo) {
          this.media.openVideo(asset.id, video).catch(console.error);
        }
      }

      if (this.project.selectClip) {
        this.project.selectClip(clipId);
      }

      this.refresh();
    },

    /* ---------- TRACK HELPERS ---------- */

    getTrack(type) {
      const tracks = this.project?.data?.tracks || [];

      return tracks.find(track => track.type === type) || null;
    },

    makeId() {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }

      return "vyora-" + Date.now() + "-" +
        Math.random().toString(36).slice(2, 10);
    },

    /* ---------- TEXT ---------- */

    addText() {
      const text = {
        id: this.makeId(),
        name: "Text",
        content: "Your Text",
        text: "Your Text",
        start: Number(this.project.data.playhead) || 0,
        duration: 5,
        x: 0.5,
        y: 0.5,
        fontSize: 64,
        fontFamily: "Arial",
        color: "#ffffff",
        opacity: 1,
        rotation: 0,
        bold: false,
        italic: false
      };

      this.project.addText(text);
      this.refresh();
      this.notify("Text layer added.");
    },

    deleteText(id) {
      if (!id) return;

      if (typeof this.project.removeText === "function") {
        this.project.removeText(id);
      }

      this.refresh();
    },

    /* ---------- CROP ---------- */

    resetCrop() {
      const clip = this.getSelectedClip();
      if (!clip) return;

      this.media.resetCrop(clip.assetId);
      this.refresh();
    },

    /* ---------- TRIM ---------- */

    applyTrim() {
      const clip = this.getSelectedClip();
      if (!clip) {
        this.notify("Select a clip first.");
        return;
      }

      const startInput = document.getElementById("vyoraTrimStart");
      const endInput = document.getElementById("vyoraTrimEnd");

      if (!startInput || !endInput) return;

      const sourceStart = Math.max(
        0,
        Number(startInput.value) || 0
      );

      const sourceEnd = Math.max(
        sourceStart,
        Number(endInput.value) || 0
      );

      if (sourceEnd <= sourceStart) {
        this.notify("End time must be greater than start time.");
        return;
      }

      this.project.updateClip(clip.id, {
        sourceStart,
        sourceEnd,
        duration: sourceEnd - sourceStart
      });

      this.refresh();
      this.notify("Trim applied.");
    },

    /* ---------- EFFECTS ---------- */

    addEffect(effectName) {
      const clip = this.getSelectedClip();

      if (!clip) {
        this.notify("Select a clip first.");
        return;
      }

      if (!effectName) return;

      const effects = Array.isArray(clip.effects)
        ? [...clip.effects]
        : [];

      effects.push({
        id: this.makeId(),
        type: effectName,
        enabled: true,
        intensity: 1
      });

      this.project.updateClip(clip.id, { effects });

      this.refresh();
      this.notify("Effect added.");
    },

    removeEffect(index) {
      const clip = this.getSelectedClip();
      if (!clip || !Array.isArray(clip.effects)) return;

      const effects = [...clip.effects];
      if (index < 0 || index >= effects.length) return;

      effects.splice(index, 1);

      this.project.updateClip(clip.id, { effects });
      this.refresh();
    },

    /* ---------- ADJUSTMENTS ---------- */

    resetAdjustments() {
      const clip = this.getSelectedClip();
      if (!clip) return;

      this.project.updateClip(clip.id, {
        adjustments: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          exposure: 0,
          temperature: 0,
          sharpen: 0
        }
      });

      this.refresh();
    },

    /* ---------- TRANSFORM ---------- */

    resetTransform() {
      const clip = this.getSelectedClip();
      if (!clip) return;

      this.project.updateClip(clip.id, {
        transform: {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0
        }
      });

      this.refresh();
    },

    /* ---------- AUDIO FADES ---------- */

    applyFades() {
      const clip = this.getSelectedClip();

      if (!clip) {
        this.notify("Select an audio clip first.");
        return;
      }

      const fadeInInput = document.getElementById("vyoraFadeIn");
      const fadeOutInput = document.getElementById("vyoraFadeOut");

      const fadeIn = Math.max(
        0,
        Number(fadeInInput?.value) || 0
      );

      const fadeOut = Math.max(
        0,
        Number(fadeOutInput?.value) || 0
      );

      if (fadeIn + fadeOut > clip.duration) {
        this.notify("Fade duration is longer than the clip.");
        return;
      }

      this.project.updateClip(clip.id, {
        fadeIn,
        fadeOut
      });

      this.refresh();
      this.notify("Audio fades applied.");
    },

    /* ---------- RANGE INPUTS ---------- */

    handleRange(input) {
      if (!input) return;

      const id = input.id;
      const value = Number(input.value);

      if (!Number.isFinite(value)) return;

      const clip = this.getSelectedClip();

      if (id === "vyoraAudioVolume") {
        this.media.setPreviewVolume(value / 100);
        return;
      }

      if (!clip) return;

      if (id.startsWith("vyoraAdjust")) {
        const key = id.replace("vyoraAdjust", "").toLowerCase();

        const adjustments = {
          ...(clip.adjustments || {}),
          [key]: value
        };

        this.project.updateClip(clip.id, { adjustments });
      }

      if (id.startsWith("vyoraTransform")) {
        const key = id.replace("vyoraTransform", "").toLowerCase();

        const transform = {
          ...(clip.transform || {}),
          [key]: value
        };

        this.project.updateClip(clip.id, { transform });
      }

      this.refresh();
    },

    /* ---------- UTILITIES ---------- */

    formatTime(seconds) {
      const value = Math.max(0, Number(seconds) || 0);
      const minutes = Math.floor(value / 60);
      const remaining = Math.floor(value % 60);

      return String(minutes).padStart(2, "0") + ":" +
        String(remaining).padStart(2, "0");
    },

    formatSize(bytes) {
      const value = Number(bytes) || 0;

      if (value < 1024) return value + " B";
      if (value < 1024 * 1024) {
        return (value / 1024).toFixed(1) + " KB";
      }

      return (value / (1024 * 1024)).toFixed(1) + " MB";
    },

    escape(value) {
      return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]);
    },

    formatError(error) {
      return error?.message || "Something went wrong.";
    },

    refresh() {
      if (typeof this.render === "function") {
        this.render();
      }

      if (this.project && typeof this.project.save === "function") {
        this.project.save();
      }
    },

    /* ---------- STYLES ---------- */

    addStyles() {
      if (document.getElementById("vyora-tools-styles")) return;

      const style = document.createElement("style");
      style.id = "vyora-tools-styles";

      style.textContent = `
        .vyora-tools-panel {
          width: 100%;
          color: #f4f4f7;
          font-family: Arial, sans-serif;
        }

        .vyora-tool-section {
          padding: 14px;
          border-bottom: 1px solid rgba(255,255,255,.08);
        }

        .vyora-tool-section h3 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 700;
        }

        .vyora-tool-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 10px 0;
        }

        .vyora-tool-row label {
          font-size: 12px;
          color: #c5c5d0;
        }

        .vyora-tool-row input[type="range"] {
          width: 55%;
          accent-color: #8b5cf6;
        }

        .vyora-tool-button {
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 9px;
          background: rgba(255,255,255,.07);
          color: #fff;
          padding: 9px 12px;
          cursor: pointer;
        }

        .vyora-tool-button:active {
          transform: scale(.98);
        }

        .vyora-tool-input {
          width: 100%;
          box-sizing: border-box;
          padding: 10px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px;
          background: #17171f;
          color: #fff;
        }

        .vyora-asset-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 10px;
          margin: 7px 0;
          border-radius: 9px;
          background: rgba(255,255,255,.05);
          font-size: 12px;
        }

        .vyora-tool-muted {
          color: #9999a8;
          font-size: 11px;
        }
      `;

      document.head.appendChild(style);
    }
  };

  window.VYORATools = Tools;

})();
