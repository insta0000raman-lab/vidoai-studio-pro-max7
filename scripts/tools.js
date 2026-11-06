
(() => {
  "use strict";

  const Tools = {
    project: null,
    media: null,
    container: null,
    activePanel: "crop",
    selectedClipId: null,
    selectedTextId: null,

    init(options = {}) {
      this.project = options.project || window.VYORAProject;
      this.media = options.media || window.VYORAMedia;

      this.container =
        typeof options.container === "string"
          ? document.querySelector(options.container)
          : options.container || null;

      if (!this.project || !this.container) {
        console.error("VYORA Tools: Project or container missing.");
        return false;
      }

      this.render();
      return this;
    },

    get state() {
      return this.project?.state || {};
    },

    get clips() {
      return this.state.clips || [];
    },

    get selectedClip() {
      return this.clips.find(
        clip => clip.id === this.selectedClipId
      ) || this.clips[0] || null;
    },

    updateProject(label, callback) {
      if (typeof this.project.update === "function") {
        return this.project.update(label, callback);
      }

      return callback();
    },

    updateClip(label, changes) {
      const clip = this.selectedClip;
      if (!clip) {
        this.toast("Pehle timeline mein clip select karo.");
        return;
      }

      this.updateProject(label, () => {
        Object.assign(clip, changes);
      });

      this.render();
    },

    toast(message) {
      if (typeof window.VYORA?.toast === "function") {
        window.VYORA.toast(message);
      } else {
        console.log(message);
      }
    },

    setPanel(panel) {
      const allowed = [
        "crop", "trim", "text", "audio",
        "effects", "transform"
      ];

      if (!allowed.includes(panel)) return;

      this.activePanel = panel;
      this.render();
    },

    addText() {
      if (!this.project?.addTextLayer) {
        this.toast("Text system available nahi hai.");
        return;
      }

      const layer = this.project.addTextLayer({
        text: "Your Text",
        start: this.state.playhead || 0,
        duration: 5,
        style: "clean",
        x: 50,
        y: 50,
        fontSize: 48,
        color: "#ffffff"
      });

      if (layer?.id) {
        this.selectedTextId = layer.id;
      }

      this.setPanel("text");
    },

    getSelectedText() {
      const layers = this.state.textLayers || this.state.texts || [];

      return layers.find(
        item => item.id === this.selectedTextId
      ) || layers[0] || null;
    },

    render() {
      if (!this.container) return;

      const tabs = [
        ["crop", "Crop"],
        ["trim", "Trim"],
        ["text", "Text"],
        ["audio", "Audio"],
        ["effects", "Effects"],
        ["transform", "Adjust"]
      ];

      this.container.innerHTML = `
        <div class="vyora-tools">

          <div class="vyora-tools-tabs">
            ${tabs.map(([id, title]) => `
              <button
                type="button"
                class="vyora-tool-tab ${this.activePanel === id ? "active" : ""}"
                data-panel="${id}">
                ${title}
              </button>
            `).join("")}
          </div>

          <div class="vyora-tools-content">
            ${this.renderPanel()}
          </div>

        </div>
      `;

      this.bindEvents();
    },

    renderPanel() {
      const clip = this.selectedClip;

      if (this.activePanel !== "text" && !clip) {
        return `
          <div class="vyora-tool-empty">
            Timeline mein pehle video clip select karo.
          </div>
        `;
      }

      switch (this.activePanel) {
        case "crop":
          return this.renderCrop(clip);
        case "trim":
          return this.renderTrim(clip);
        case "text":
          return this.renderText();
        case "audio":
          return this.renderAudio(clip);
        case "effects":
          return this.renderEffects(clip);
        case "transform":
          return this.renderTransform(clip);
        default:
          return "";
      }
    },

    renderCrop(clip) {
      const crop = clip?.crop || {};

      return `
        <h3>Crop Video</h3>
        <p class="vyora-tool-description">
          Video ke edges adjust karo.
        </p>

        <div class="vyora-tool-buttons">
          ${[0, 5, 10, 20].map(value => `
            <button type="button"
              data-crop-preset="${value}">
              ${value}%
            </button>
          `).join("")}
        </div>

        ${this.rangeControl("Top", "crop-top", crop.top ?? 0, 0, 45)}
        ${this.rangeControl("Bottom", "crop-bottom", crop.bottom ?? 0, 0, 45)}
        ${this.rangeControl("Left", "crop-left", crop.left ?? 0, 0, 45)}
        ${this.rangeControl("Right", "crop-right", crop.right ?? 0, 0, 45)}

        <button type="button" class="vyora-tool-primary"
          data-action="equal-crop">
          Equal Top & Bottom
        </button>
      `;
    },

    renderTrim(clip) {
      const start = Number(clip?.sourceStart || 0);
      const duration = Number(clip?.duration || 1);

      return `
        <h3>Trim Clip</h3>
        <p class="vyora-tool-description">
          Clip ka start aur duration set karo.
        </p>

        ${this.numberControl("Start Time", "trim-start", start, 0)}
        ${this.numberControl("Duration", "trim-duration", duration, 0.1)}

        <button type="button" class="vyora-tool-primary"
          data-action="apply-trim">
          Apply Trim
        </button>
      `;
    },

    renderText() {
      const text = this.getSelectedText();

      return `
        <h3>Text Editor</h3>

        <button type="button" class="vyora-tool-primary"
          data-action="add-text">
          + Add Text
        </button>

        ${text ? `
          <label class="vyora-tool-label">Text</label>
          <textarea data-field="text-value">${this.escape(text.text || "")}</textarea>

          <label class="vyora-tool-label">Text Style</label>
          <div class="vyora-tool-buttons">
            ${["clean", "bold", "neon", "cinematic", "outline"].map(style => `
              <button type="button" data-text-style="${style}">
                ${style}
              </button>
            `).join("")}
          </div>

          ${this.rangeControl("Font Size", "text-size", text.fontSize || 48, 12, 120)}
          <label class="vyora-tool-label">Text Color</label>
          <input type="color" data-field="text-color"
            value="${this.escape(text.color || "#ffffff")}">

          <button type="button" class="vyora-tool-primary"
            data-action="save-text">
            Save Text
          </button>

          <button type="button" class="vyora-tool-danger"
            data-action="delete-text">
            Delete Text
          </button>
        ` : `
          <p class="vyora-tool-empty">
            Add Text dabakar naya text banao.
          </p>
        `}
      `;
    },

    renderAudio(clip) {
      const volume = clip?.volume ?? 100;
      const speed = clip?.speed ?? 1;

      return `
        <h3>Audio & Volume</h3>

        ${this.rangeControl("Volume", "audio-volume", volume, 0, 200)}
        ${this.rangeControl("Speed", "audio-speed", speed, 0.25, 2, 0.05)}

        <label class="vyora-tool-label">
          Fade In (seconds)
        </label>
        <input type="number" min="0" max="30"
          data-field="fade-in"
          value="${clip?.fadeIn || 0}">

        <label class="vyora-tool-label">
          Fade Out (seconds)
        </label>
        <input type="number" min="0" max="30"
          data-field="fade-out"
          value="${clip?.fadeOut || 0}">

        <button type="button" class="vyora-tool-primary"
          data-action="apply-audio">
          Apply Audio Settings
        </button>
      `;
    },

    renderEffects(clip) {
      const effects = clip?.effects || [];

      return `
        <h3>Video Effects</h3>

        <div class="vyora-tool-buttons">
          ${["brightness", "contrast", "saturation", "blur", "grayscale"].map(effect => `
            <button type="button" data-effect="${effect}">
              ${effect}
            </button>
          `).join("")}
        </div>

        <p class="vyora-tool-description">
          Effect select karke slider adjust karo.
        </p>

        ${effects.map(effect => `
          <div class="vyora-effect-row">
            <span>${this.escape(effect.type)}</span>
            <button type="button" data-remove-effect="${effect.id}">
              Remove
            </button>
          </div>
        `).join("")}

        <div id="vyoraEffectControl"></div>
      `;
    },

    renderTransform(clip) {
      const transform = clip?.transform || {};

      return `
        <h3>Transform</h3>

        ${this.rangeControl("Scale", "scale", transform.scale ?? 100, 10, 300)}
        ${this.rangeControl("Rotation", "rotation", transform.rotation ?? 0, -180, 180)}
        ${this.rangeControl("Opacity", "opacity", transform.opacity ?? 100, 0, 100)}

        <button type="button" class="vyora-tool-primary"
          data-action="apply-transform">
          Apply Transform
        </button>
      `;
    },

    rangeControl(label, field, value, min, max, step = 1) {
      return `
        <div class="vyora-tool-control">
          <label>${label}
            <span data-value-for="${field}">${value}</span>
          </label>
          <input type="range"
            data-field="${field}"
            min="${min}" max="${max}"
            step="${step}" value="${value}">
        </div>
      `;
    },

    numberControl(label, field, value, min) {
      return `
        <label class="vyora-tool-label">${label}</label>
        <input type="number" min="${min}"
          data-field="${field}" value="${value}">
      `;
    },

    bindEvents() {
      this.container.querySelectorAll("[data-panel]").forEach(button => {
        button.addEventListener("click", () => {
          this.setPanel(button.dataset.panel);
        });
      });

      this.container.querySelectorAll("[data-crop-preset]").forEach(button => {
        button.addEventListener("click", () => {
          const value = Number(button.dataset.cropPreset);

          this.updateClip("Crop preset", {
            crop: {
              top: value,
              bottom: value,
              left: 0,
              right: 0
            }
          });

          this.render();
        });
      });

      this.container.querySelectorAll("[data-field]").forEach(input => {
        input.addEventListener("input", () => {
          const output = this.container.querySelector(
            `[data-value-for="${input.dataset.field}"]`
          );

          if (output) output.textContent = input.value;
        });
      });

      this.container.querySelectorAll("[data-action]").forEach(button => {
        button.addEventListener("click", () => {
          this.handleAction(button.dataset.action);
        });
      });

      this.container.querySelectorAll("[data-text-style]").forEach(button => {
        button.addEventListener("click", () => {
          const text = this.getSelectedText();
          if (!text) return;

          this.project.updateTextLayer(text.id, {
            style: button.dataset.textStyle
          });

          this.render();
        });
      });

      this.container.querySelectorAll("[data-effect]").forEach(button => {
        button.addEventListener("click", () => {
          this.addEffect(button.dataset.effect);
        });
      });

      this.container.querySelectorAll("[data-remove-effect]").forEach(button => {
        button.addEventListener("click", () => {
          this.removeEffect(button.dataset.removeEffect);
        });
      });
    },

    handleAction(action) {
      const clip = this.selectedClip;

      if (action === "add-text") {
        this.addText();
        return;
      }

      if (action === "save-text") {
        const text = this.getSelectedText();
        if (!text) return;

        this.project.updateTextLayer(text.id, {
          text: this.container.querySelector('[data-field="text-value"]').value,
          color: this.container.querySelector('[data-field="text-color"]').value,
          fontSize: Number(this.container.querySelector('[data-field="text-size"]')?.value || text.fontSize || 48)
        });

        this.render();
        return;
      }

      if (action === "delete-text") {
        const text = this.getSelectedText();
        if (!text) return;

        this.project.removeTextLayer(text.id);
        this.selectedTextId = null;
        this.render();
        return;
      }

      if (!clip) return;

      if (action === "equal-crop") {
        const top = Number(
          this.container.querySelector('[data-field="crop-top"]').value
        );

        this.updateClip("Equal crop", {
          crop: { ...clip.crop, top, bottom: top }
        });

        return;
      }

      if (action === "apply-trim") {
        const start = Number(
          this.container.querySelector('[data-field="trim-start"]').value
        );

        const duration = Number(
          this.container.querySelector('[data-field="trim-duration"]').value
        );

        if (!Number.isFinite(start) || !Number.isFinite(duration) ||
            start < 0 || duration <= 0) {
          this.toast("Valid trim values enter karo.");
          return;
        }

        this.updateClip("Trim clip", {
          sourceStart: start,
          duration
        });

        return;
      }

      if (action === "apply-audio") {
        this.updateClip("Audio settings", {
          volume: Number(this.container.querySelector('[data-field="audio-volume"]').value),
          speed: Number(this.container.querySelector('[data-field="audio-speed"]').value),
          fadeIn: Number(this.container.querySelector('[data-field="fade-in"]').value),
          fadeOut: Number(this.container.querySelector('[data-field="fade-out"]').value)
        });

        return;
      }

      if (action === "apply-transform") {
        this.updateClip("Transform settings", {
          transform: {
            scale: Number(this.container.querySelector('[data-field="scale"]').value),
            rotation: Number(this.container.querySelector('[data-field="rotation"]').value),
            opacity: Number(this.container.querySelector('[data-field="opacity"]').value)
          }
        });
      }
    },

    addEffect(type) {
      const clip = this.selectedClip;
      if (!clip) return;

      const effect = {
        id: "effect_" + Date.now(),
        type,
        value: 100
      };

      this.updateProject("Add effect", () => {
        if (!Array.isArray(clip.effects)) clip.effects = [];
        clip.effects.push(effect);
      });

      this.render();
    },

    removeEffect(id) {
      const clip = this.selectedClip;
      if (!clip) return;

      this.updateProject("Remove effect", () => {
        clip.effects = (clip.effects || []).filter(
          effect => effect.id !== id
        );
      });

      this.render();
    },

    escape(value) {
      return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }
  };

  window.VYORATools = Tools;

})();
          
