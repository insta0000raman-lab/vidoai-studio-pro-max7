
(() => {
  "use strict";

  const Tools = {
    project: null,
    media: null,
    activePanel: "crop",
    selectedClipId: null,
    selectedTextId: null,
    container: null,
    listeners: new Set(),

    init(options = {}) {
      this.project = options.project || window.VYORAProject;
      this.media = options.media || window.VYORAMedia;
      this.container =
        typeof options.container === "string"
          ? document.querySelector(options.container)
          : options.container || null;

      if (!this.project) {
        console.error("VYORA project system not found.");
        return false;
      }

      this.render();
      return true;
    },

    subscribe(callback) {
      if (typeof callback !== "function") return () => {};

      this.listeners.add(callback);

      return () => this.listeners.delete(callback);
    },

    emit(action, detail = {}) {
      const eventData = { action, ...detail };

      this.listeners.forEach(callback => {
        try {
          callback(eventData);
        } catch (error) {
          console.error("VYORA tools listener:", error);
        }
      });

      window.dispatchEvent(
        new CustomEvent("vyora:tool-action", {
          detail: eventData
        })
      );
    },

    getState() {
      return this.project?.getState() || null;
    },

    getSelectedClip() {
      const state = this.getState();
      const id = this.selectedClipId || state?.selectedClipId;

      return id ? this.project.findClip(id) : null;
    },

    selectClip(clipId) {
      const found = this.project.findClip(clipId);
      if (!found) return false;

      this.selectedClipId = clipId;
      this.selectedTextId = null;
      this.project.selectClip(clipId);
      this.render();

      return true;
    },

    setPanel(panel) {
      const allowed = [
        "crop",
        "trim",
        "text",
        "audio",
        "effects",
        "transform"
      ];

      if (!allowed.includes(panel)) return false;

      this.activePanel = panel;
      this.render();

      this.emit("panel-change", { panel });

      return true;
    },

    render() {
      if (!this.container) return;

      this.container.innerHTML = `
        <div class="vyora-tools">
          <div class="vyora-tools-tabs">
            ${this.renderTab("crop", "Crop")}
            ${this.renderTab("trim", "Trim")}
            ${this.renderTab("text", "Text")}
            ${this.renderTab("audio", "Audio")}
            ${this.renderTab("effects", "Effects")}
            ${this.renderTab("transform", "Transform")}
          </div>

          <div class="vyora-tools-content">
            ${this.renderPanel()}
          </div>
        </div>
      `;

      this.injectStyles();
      this.bindEvents();

      if (window.lucide) {
        window.lucide.createIcons();
      }
    },

    renderTab(id, label) {
      return `
        <button type="button"
          class="vyora-tool-tab ${this.activePanel === id ? "active" : ""}"
          data-panel="${id}">
          ${label}
        </button>
      `;
    },

    renderPanel() {
      const panels = {
        crop: () => this.renderCrop(),
        trim: () => this.renderTrim(),
        text: () => this.renderText(),
        audio: () => this.renderAudio(),
        effects: () => this.renderEffects(),
        transform: () => this.renderTransform()
      };

      return panels[this.activePanel]?.() || "";
    },

    renderNoClip(message = "Select a clip to use this tool.") {
      return `
        <div class="vyora-tool-empty">
          <span class="vyora-tool-empty-icon">✦</span>
          <p>${this.escapeHTML(message)}</p>
        </div>
      `;
    },

    renderCrop() {
      const found = this.getSelectedClip();
      if (!found) return this.renderNoClip();

      const crop = found.clip.crop || {};

      return `
        <div class="vyora-tool-section">
          <h3>Crop & Frame</h3>
          <p class="vyora-tool-description">
            Adjust the visible area of your selected clip.
          </p>

          <div class="vyora-crop-presets">
            <button data-crop-preset="0">Reset</button>
            <button data-crop-preset="5">5%</button>
            <button data-crop-preset="10">10%</button>
            <button data-crop-preset="20">20%</button>
          </div>

          ${this.renderSlider("Top", "crop-top", crop.top || 0, 0, 95)}
          ${this.renderSlider("Bottom", "crop-bottom", crop.bottom || 0, 0, 95)}
          ${this.renderSlider("Left", "crop-left", crop.left || 0, 0, 95)}
          ${this.renderSlider("Right", "crop-right", crop.right || 0, 0, 95)}

          <button class="vyora-tool-primary" data-action="crop-equal">
            Equal top & bottom
          </button>
        </div>
      `;
    },

    renderTrim() {
      const found = this.getSelectedClip();
      if (!found) return this.renderNoClip();

      const clip = found.clip;

      return `
        <div class="vyora-tool-section">
          <h3>Trim Clip</h3>
          <p class="vyora-tool-description">
            Set the start and end points of your clip.
          </p>

          <div class="vyora-tool-number">
            <label>Timeline start (seconds)</label>
            <input type="number" min="0" step="0.01"
              data-value="clip-start" value="${clip.start}">
          </div>

          <div class="vyora-tool-number">
            <label>Clip duration (seconds)</label>
            <input type="number" min="0.01" step="0.01"
              data-value="clip-duration" value="${clip.duration}">
          </div>

          <div class="vyora-tool-number">
            <label>Source start (seconds)</label>
            <input type="number" min="0" step="0.01"
              data-value="source-start" value="${clip.sourceStart || 0}">
          </div>

          <button class="vyora-tool-primary" data-action="apply-trim">
            Apply trim
          </button>
        </div>
      `;
    },

    renderText() {
      const state = this.getState();
      const layers = state?.textLayers || [];

      return `
        <div class="vyora-tool-section">
          <h3>Text Studio</h3>
          <p class="vyora-tool-description">
            Create and style text overlays.
          </p>

          <button class="vyora-tool-primary" data-action="add-text">
            + Add text layer
          </button>

          <div class="vyora-text-list">
            ${layers.length
              ? layers.map(layer => `
                <button class="vyora-text-item ${this.selectedTextId === layer.id ? "selected" : ""}"
                  data-text-id="${this.escapeHTML(layer.id)}">
                  <span>${this.escapeHTML(layer.text)}</span>
                  <small>${this.escapeHTML(layer.style)}</small>
                </button>
              `).join("")
              : `<p class="vyora-tool-muted">No text layers yet.</p>`
            }
          </div>

          ${this.selectedTextId
            ? this.renderTextProperties()
            : ""
          }
        </div>
      `;
    },

    renderTextProperties() {
      const state = this.getState();
      const layer = state.textLayers.find(
        item => item.id === this.selectedTextId
      );

      if (!layer) return "";

      return `
        <div class="vyora-tool-divider"></div>
        <h4>Edit selected text</h4>

        <label class="vyora-tool-label">Text</label>
        <textarea data-value="text-content">${this.escapeHTML(layer.text)}</textarea>

        <label class="vyora-tool-label">Style</label>
        <select data-value="text-style">
          ${["clean", "bold", "neon", "cinematic", "outline"]
            .map(style => `
              <option value="${style}" ${layer.style === style ? "selected" : ""}>
                ${style[0].toUpperCase() + style.slice(1)}
              </option>
            `).join("")}
        </select>

        <label class="vyora-tool-label">Font size</label>
        <input type="range" min="12" max="220"
          data-value="text-size" value="${layer.fontSize}">

        <label class="vyora-tool-label">Text color</label>
        <input type="color" data-value="text-color"
          value="${this.isColor(layer.color) ? layer.color : "#ffffff"}">

        ${this.renderSlider("Horizontal position", "text-x", layer.x, 0, 100)}
        ${this.renderSlider("Vertical position", "text-y", layer.y, 0, 100)}
        ${this.renderSlider("Opacity", "text-opacity", layer.opacity * 100, 0, 100)}

        <button class="vyora-tool-danger" data-action="delete-text">
          Delete text layer
        </button>
      `;
    },

    renderAudio() {
      const found = this.getSelectedClip();

      if (!found || found.clip.type !== "audio") {
        return this.renderNoClip(
          "Select an audio clip from the timeline."
        );
      }

      const clip = found.clip;

      return `
        <div class="vyora-tool-section">
          <h3>Audio Controls</h3>
          <p class="vyora-tool-description">
            Control the selected audio clip.
          </p>

          ${this.renderSlider("Volume", "audio-volume", clip.volume * 100, 0, 200)}

          ${this.renderSlider("Playback speed", "audio-speed", clip.speed * 100, 25, 400)}

          <label class="vyora-tool-checkbox">
            <input type="checkbox" data-value="audio-muted"
              ${clip.muted ? "checked" : ""}>
            Mute this clip
          </label>

          <div class="vyora-tool-number">
            <label>Fade in (seconds)</label>
            <input type="number" min="0" max="${clip.duration / 2}"
              step="0.1" data-value="audio-fade-in" value="0">
          </div>

          <div class="vyora-tool-number">
            <label>Fade out (seconds)</label>
            <input type="number" min="0" max="${clip.duration / 2}"
              step="0.1" data-value="audio-fade-out" value="0">
          </div>

          <button class="vyora-tool-primary" data-action="apply-audio">
            Apply audio settings
          </button>
        </div>
      `;
    },

    renderEffects() {
      const state = this.getState();
      const effects = state?.effects || [];

      const presets = [
        ["brightness", "Brightness"],
        ["contrast", "Contrast"],
        ["saturation", "Saturation"],
        ["sharpen", "Sharpen"],
        ["blur", "Blur"],
        ["vignette", "Vignette"],
        ["warmth", "Warmth"],
        ["grain", "Film grain"]
      ];

      return `
        <div class="vyora-tool-section">
          <h3>Effects Library</h3>
          <p class="vyora-tool-description">
            Add effects to your project.
          </p>

          <div class="vyora-effect-grid">
            ${presets.map(([type, label]) => `
              <button data-effect="${type}">
                <span>✦</span>
                ${label}
              </button>
            `).join("")}
          </div>

          <div class="vyora-tool-divider"></div>
          <h4>Applied effects</h4>

          <div class="vyora-effect-list">
            ${effects.length
              ? effects.map(effect => `
                <div class="vyora-effect-item">
                  <div>
                    <strong>${this.escapeHTML(effect.name)}</strong>
                    <small>${effect.intensity}% intensity</small>
                  </div>
                  <button data-effect-toggle="${effect.id}">
                    ${effect.enabled ? "On" : "Off"}
                  </button>
                  <button data-effect-delete="${effect.id}">×</button>
                </div>
              `).join("")
              : `<p class="vyora-tool-muted">No effects applied.</p>`
            }
          </div>
        </div>
      `;
    },

    renderTransform() {
      const state = this.getState();
      const settings = state.settings;

      return `
        <div class="vyora-tool-section">
          <h3>Project Transform</h3>
          <p class="vyora-tool-description">
            Change your project canvas settings.
          </p>

          <div class="vyora-tool-number">
            <label>Width</label>
            <input type="number" min="16" max="7680"
              data-value="project-width" value="${settings.width}">
          </div>

          <div class="vyora-tool-number">
            <label>Height</label>
            <input type="number" min="16" max="7680"
              data-value="project-height" value="${settings.height}">
          </div>

          <div class="vyora-tool-number">
            <label>Frame rate</label>
            <select data-value="project-fps">
              ${[24, 25, 30, 48, 50, 60, 120]
                .map(fps => `
                  <option value="${fps}" ${settings.fps === fps ? "selected" : ""}>
                    ${fps} FPS
                  </option>
                `).join("")}
            </select>
          </div>

          <div class="vyora-tool-number">
            <label>Background</label>
            <input type="color" data-value="project-background"
              value="${this.isColor(settings.background) ? settings.background : "#08090d"}">
          </div>

          <button class="vyora-tool-primary" data-action="apply-transform">
            Apply project settings
          </button>
        </div>
      `;
    },

    renderSlider(label, key, value, min, max) {
      return `
        <div class="vyora-tool-slider">
          <div>
            <label>${label}</label>
            <output data-output="${key}">${Number(value).toFixed(0)}%</output>
          </div>
          <input type="range"
            min="${min}" max="${max}" step="1"
            data-value="${key}" value="${value}">
        </div>
      `;
    },

    bindEvents() {
      if (!this.container) return;

      this.container.addEventListener("click", event => {
        const tab = event.target.closest("[data-panel]");

        if (tab) {
          this.setPanel(tab.dataset.panel);
          return;
        }

        const textItem = event.target.closest("[data-text-id]");

        if (textItem) {
          this.selectedTextId = textItem.dataset.textId;
          this.render();
          return;
        }

        const effectButton = event.target.closest("[data-effect]");

        if (effectButton) {
          this.addEffect(effectButton.dataset.effect);
          return;
        }

        const toggle = event.target.closest("[data-effect-toggle]");

        if (toggle) {
          const state = this.getState();
          const effect = state.effects.find(
            item => item.id === toggle.dataset.effectToggle
          );

          if (effect) {
            this.project.updateEffect(effect.id, {
              enabled: !effect.enabled
            });

            this.render();
          }

          return;
        }

        const deleteEffect = event.target.closest("[data-effect-delete]");

        if (deleteEffect) {
          this.project.removeEffect(deleteEffect.dataset.effectDelete);
          this.render();
          return;
        }

        const preset = event.target.closest("[data-crop-preset]");

        if (preset) {
          this.applyCropPreset(Number(preset.dataset.cropPreset));
          return;
        }

        const action = event.target.closest("[data-action]");

        if (action) {
          this.handleAction(action.dataset.action);
        }
      });

      this.container.addEventListener("input", event => {
        const input = event.target;

        if (!input.dataset.value) return;

        const key = input.dataset.value;

        if (key.startsWith("crop-")) {
          const side = key.replace("crop-", "");
          const value = Number(input.value);

          const output = this.container.querySelector(
            `[data-output="${key}"]`
          );

          if (output) output.textContent = value + "%";

          this.updateCrop(side, value);
          return;
        }

        if (key.startsWith("text-")) {
          this.updateTextProperty(key, input.value);
          return;
        }

        if (key === "audio-volume") {
          this.updateAudioProperty("volume", Number(input.value) / 100);
        }

        if (key === "audio-speed") {
          this.updateAudioProperty("speed", Number(input.value) / 100);
        }

        if (key === "text-content") {
          this.updateTextProperty(key, input.value);
        }

        if (key === "text-size") {
          this.updateTextProperty(key, Number(input.value));
        }

        if (key === "text-color") {
          this.updateTextProperty(key, input.value);
        }

        if (key === "text-style") {
          this.updateTextProperty(key, input.value);
        }
      });

      this.container.addEventListener("change", event => {
        const input = event.target;
        const key = input.dataset.value;

        if (!key) return;

        if (key === "audio-muted") {
          this.updateAudioProperty("muted", input.checked);
        }

        if (key === "project-width" || key === "project-height") {
          this.applyTransformFromInputs();
        }

        if (
          key === "project-fps" ||
          key === "project-background"
        ) {
          this.applyTransformFromInputs();
        }

        if (
          key === "clip-start" ||
          key === "clip-duration" ||
          key === "source-start"
        ) {
          this.applyTrimFromInputs();
        }
      });
    },

    handleAction(action) {
      switch (action) {
        case "crop-equal":
          this.applyEqualCrop();
          break;

        case "apply-trim":
          this.applyTrimFromInputs();
          break;

        case "add-text":
          this.addText();
          break;

        case "delete-text":
          this.deleteText();
          break;

        case "apply-audio":
          this.applyAudioSettings();
          break;

        case "apply-transform":
          this.applyTransformFromInputs();
          break;
      }
    },

    applyCropPreset(value) {
      const found = this.getSelectedClip();
      if (!found) return false;

      const success = this.project.setCrop(found.clip.id, {
        top: value,
        bottom: value,
        left: 0,
        right: 0
      });

      if (success) {
        this.emit("crop-preset", { value });
        this.render();
      }

      return success;
    },

    applyEqualCrop() {
      const found = this.getSelectedClip();
      if (!found) return false;

      const topInput = this.container.querySelector(
        '[data-value="crop-top"]'
      );

      const value = Number(topInput?.value || 0);

      const success = this.project.setCrop(found.clip.id, {
        top: value,
        bottom: value
      });

      if (success) this.render();

      return success;
    },

    updateCrop(side, value) {
      const found = this.getSelectedClip();
      if (!found) return false;

      if (!["top", "bottom", "left", "right"].includes(side)) {
        return false;
      }

      const success = this.project.setCrop(found.clip.id, {
        [side]: Number(value)
      });

      if (success) {
        this.emit("crop-change", {
          clipId: found.clip.id,
          side,
          value: Number(value)
        });
      }

      return success;
    },

    applyTrimFromInputs() {
      const found = this.getSelectedClip();
      if (!found) return false;

      const start = Number(
        this.container.querySelector('[data-value="clip-start"]')?.value
      );

      const duration = Number(
        this.container.querySelector('[data-value="clip-duration"]')?.value
      );

      const sourceStart = Number(
        this.container.querySelector('[data-value="source-start"]')?.value
      );

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(duration) ||
        !Number.isFinite(sourceStart) ||
        start < 0 ||
        duration <= 0 ||
        sourceStart < 0
      ) {
                throw new Error("Invalid clip timing values.");
      }

      const clip = this.state.tracks
        .flatMap(track => track.clips || [])
        .find(item => item.id === clipId);

      if (!clip) {
        throw new Error("Clip not found.");
      }

      clip.start = start;
      clip.duration = duration;
      clip.sourceStart = sourceStart;

      return clip;
    });
  }

  splitClip(clipId, splitAt) {
    return this.update("Split clip", () => {
      const track = this.state.tracks.find(item =>
        (item.clips || []).some(clip => clip.id === clipId)
      );

      if (!track) throw new Error("Clip not found.");

      const index = track.clips.findIndex(clip => clip.id === clipId);
      const clip = track.clips[index];
      const offset = Number(splitAt) - Number(clip.start);

      if (
        !Number.isFinite(offset) ||
        offset <= 0 ||
        offset >= Number(clip.duration)
      ) {
        throw new Error("Invalid split position.");
      }

      const secondClip = this.clone(clip);
      secondClip.id = this.createId("clip");
      secondClip.start = Number(clip.start) + offset;
      secondClip.duration = Number(clip.duration) - offset;
      secondClip.sourceStart = Number(clip.sourceStart || 0) + offset;

      clip.duration = offset;

      track.clips.splice(index + 1, 0, secondClip);

      return secondClip;
    });
  }

  removeClip(clipId) {
    return this.update("Remove clip", () => {
      for (const track of this.state.tracks) {
        const index = track.clips.findIndex(clip => clip.id === clipId);

        if (index !== -1) {
          const removed = track.clips.splice(index, 1)[0];

          if (this.state.selectedClipId === clipId) {
            this.state.selectedClipId = null;
          }

          return removed;
        }
      }

      return null;
    });
  }

  selectClip(clipId) {
    return this.update("Select clip", () => {
      this.state.selectedClipId = clipId || null;
      return this.state.selectedClipId;
    }, { history: false });
  }

  getSelectedClip() {
    const id = this.state.selectedClipId;

    for (const track of this.state.tracks) {
      const clip = track.clips.find(item => item.id === id);
      if (clip) return clip;
    }

    return null;
  }

  addTextLayer(data = {}) {
    return this.update("Add text", () => {
      const layer = {
        id: this.createId("text"),
        text: data.text || "Your text",
        start: Number(data.start) || 0,
        duration: Number(data.duration) || 5,
        x: Number(data.x ?? 50),
        y: Number(data.y ?? 50),
        fontSize: Number(data.fontSize) || 48,
        color: data.color || "#ffffff",
        style: data.style || "clean",
        opacity: Number(data.opacity ?? 100),
        rotation: Number(data.rotation) || 0
      };

      this.state.textLayers.push(layer);
      return layer;
    });
  }

  updateTextLayer(id, changes = {}) {
    return this.update("Update text", () => {
      const layer = this.state.textLayers.find(item => item.id === id);
      if (!layer) throw new Error("Text layer not found.");

      Object.assign(layer, changes);
      return layer;
    });
  }

  removeTextLayer(id) {
    return this.update("Remove text", () => {
      const index = this.state.textLayers.findIndex(item => item.id === id);
      if (index === -1) return null;

      return this.state.textLayers.splice(index, 1)[0];
    });
  }

  addEffect(data = {}) {
    return this.update("Add effect", () => {
      const effect = {
        id: this.createId("effect"),
        type: data.type || "brightness",
        value: Number(data.value ?? 100),
        enabled: data.enabled !== false,
        clipId: data.clipId || null
      };

      this.state.effects.push(effect);
      return effect;
    });
  }

  updateEffect(id, changes = {}) {
    return this.update("Update effect", () => {
      const effect = this.state.effects.find(item => item.id === id);
      if (!effect) throw new Error("Effect not found.");

      Object.assign(effect, changes);
      return effect;
    });
  }

  removeEffect(id) {
    return this.update("Remove effect", () => {
      const index = this.state.effects.findIndex(item => item.id === id);
      if (index === -1) return null;

      return this.state.effects.splice(index, 1)[0];
    });
  }

  exportProject() {
    return JSON.stringify(this.state, null, 2);
  }

  importProject(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;

    if (!data || !Array.isArray(data.tracks)) {
      throw new Error("Invalid project file.");
    }

    return this.update("Import project", () => {
      this.state = {
        ...this.state,
        ...this.clone(data)
      };

      return this.state;
    });
  }
}

window.VYORAProject = new ProjectManager();

})();
