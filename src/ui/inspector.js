import { eventBus } from "../core/event-bus.js";
import { store } from "../core/state-store.js";
import { projectManager } from "../project/project-manager.js";

const INSPECTOR_TABS = [
  "transform",
  "color",
  "effects",
  "animation",
  "audio"
];

const DEFAULT_TRANSFORM = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  anchorX: 0.5,
  anchorY: 0.5
};

export class InspectorManager {
  constructor(options = {}) {
    this.root = options.root || document;
    this.container = null;
    this.selectedClipId = null;
    this.activeTab = "transform";
    this.listeners = new Set();
    this.unsubscribe = null;

    this.handleInput = this.handleInput.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  init() {
    this.container = this.root.querySelector(
      "#inspectorContent"
    );

    if (!this.container) {
      console.warn("Inspector container not found");
      return this;
    }

    this.container.addEventListener(
      "input",
      this.handleInput
    );

    this.container.addEventListener(
      "change",
      this.handleInput
    );

    this.container.addEventListener(
      "click",
      this.handleClick
    );

    this.unsubscribe = store.subscribe(state => {
      const selectedId = state.selectedClipId || null;

      if (selectedId !== this.selectedClipId) {
        this.selectedClipId = selectedId;
        this.render();
      }
    });

    this.render();
    return this;
  }

  getProject() {
    return projectManager.currentProject;
  }

  getSelectedClip() {
    const project = this.getProject();

    if (!project || !this.selectedClipId) {
      return null;
    }

    for (const track of project.tracks || []) {
      const clip = (track.clips || []).find(
        item => item.id === this.selectedClipId
      );

      if (clip) {
        return { clip, track };
      }
    }

    return null;
  }

  setTab(tab) {
    if (!INSPECTOR_TABS.includes(tab)) return false;

    this.activeTab = tab;
    this.render();
    return true;
  }

  render() {
    if (!this.container) return;

    const selected = this.getSelectedClip();

    if (!selected) {
      this.container.innerHTML = `
        <div class="empty-message">
          <span class="empty-icon">◇</span>
          <strong>Nothing selected</strong>
          <p>Select a clip on the timeline to edit its properties.</p>
        </div>
      `;
      return;
    }

    const { clip, track } = selected;

    this.container.innerHTML = `
      <div class="inspector-header">
        <div>
          <strong>${this.escape(clip.name || clip.type || "Clip")}</strong>
          <small>${this.escape(track.name || track.type || "Track")}</small>
        </div>
        <span class="inspector-type">${this.escape(clip.type || "media")}</span>
      </div>

      <div class="inspector-tabs">
        ${INSPECTOR_TABS.map(tab => `
          <button
            type="button"
            data-inspector-tab="${tab}"
            class="${this.activeTab === tab ? "active" : ""}"
          >${this.title(tab)}</button>
        `).join("")}
      </div>

      <div class="inspector-fields">
        ${this.renderTab(clip)}
      </div>
    `;

    this.emit("rendered", { clipId: clip.id });
  }

  renderTab(clip) {
    switch (this.activeTab) {
      case "transform":
        return this.renderTransform(clip);

      case "color":
        return this.renderColor(clip);

      case "effects":
        return this.renderEffects(clip);

      case "animation":
        return this.renderAnimation(clip);

      case "audio":
        return this.renderAudio(clip);

      default:
        return "";
    }
  }

  renderTransform(clip) {
    const transform = {
      ...DEFAULT_TRANSFORM,
      ...(clip.transform || {})
    };

    return `
      ${this.field("Position X", "x", transform.x, -5000, 5000)}
      ${this.field("Position Y", "y", transform.y, -5000, 5000)}
      ${this.field("Scale X", "scaleX", transform.scaleX, 0.01, 10, 0.01)}
      ${this.field("Scale Y", "scaleY", transform.scaleY, 0.01, 10, 0.01)}
      ${this.field("Rotation", "rotation", transform.rotation, -3600, 3600)}
      ${this.field("Opacity", "opacity", transform.opacity, 0, 1, 0.01)}
      ${this.field("Anchor X", "anchorX", transform.anchorX, 0, 1, 0.01)}
      ${this.field("Anchor Y", "anchorY", transform.anchorY, 0, 1, 0.01)}
      <button class="secondary-button" data-inspector-action="reset-transform">
        Reset Transform
      </button>
    `;
  }

  renderColor(clip) {
    const color = clip.color || {};

    return `
      ${this.field("Brightness", "brightness", color.brightness ?? 0, -100, 100)}
      ${this.field("Contrast", "contrast", color.contrast ?? 100, 0, 200)}
      ${this.field("Saturation", "saturation", color.saturation ?? 100, 0, 200)}
      ${this.field("Exposure", "exposure", color.exposure ?? 0, -5, 5, 0.1)}
      ${this.field("Temperature", "temperature", color.temperature ?? 0, -100, 100)}
      ${this.field("Tint", "tint", color.tint ?? 0, -100, 100)}
      ${this.field("Highlights", "highlights", color.highlights ?? 0, -100, 100)}
      ${this.field("Shadows", "shadows", color.shadows ?? 0, -100, 100)}
    `;
  }

  renderEffects(clip) {
    const effects = clip.effects || [];

    if (!effects.length) {
      return `
        <div class="empty-message">
          No effects added to this clip.
        </div>
      `;
    }

    return effects.map(effect => `
      <div class="inspector-effect">
        <strong>${this.escape(effect.name || effect.type)}</strong>
        <label>
          <input
            type="checkbox"
            data-effect-enabled="${effect.id}"
            ${effect.enabled !== false ? "checked" : ""}
          >
          Enabled
        </label>
      </div>
    `).join("");
  }

  renderAnimation(clip) {
    const keyframes = clip.keyframes || [];

    return `
      <div class="inspector-section">
        <strong>Animation</strong>
        <p>${keyframes.length} keyframes</p>
        <button class="secondary-button" data-inspector-action="add-keyframe">
          Add Keyframe
        </button>
      </div>
    `;
  }

  renderAudio(clip) {
    const audio = clip.audio || {};

    return `
      ${this.field("Volume", "volume", audio.volume ?? 1, 0, 2, 0.01)}
      ${this.field("Fade In", "fadeIn", audio.fadeIn ?? 0, 0, 60, 0.1)}
      ${this.field("Fade Out", "fadeOut", audio.fadeOut ?? 0, 0, 60, 0.1)}
      <label class="inspector-checkbox">
        <input type="checkbox" data-audio-muted ${audio.muted ? "checked" : ""}>
        Mute clip
      </label>
    `;
  }

  field(label, property, value, min, max, step = 1) {
    const safeValue = Number.isFinite(Number(value))
      ? Number(value)
      : 0;

    return `
      <label class="inspector-field">
        <span>${label}</span>
        <input
          type="number"
          data-property="${property}"
          value="${safeValue}"
          min="${min}"
          max="${max}"
          step="${step}"
        >
      </label>
    `;
  }

  handleInput(event) {
    const input = event.target;

    if (input.dataset.property) {
      const value = Number(input.value);

      if (!Number.isFinite(value)) return;

      const min = input.min === "" ? -Infinity : Number(input.min);
      const max = input.max === "" ? Infinity : Number(input.max);

      this.updateProperty(
        input.dataset.property,
        Math.min(max, Math.max(min, value))
      );
    }

    if (input.dataset.effectEnabled) {
      this.updateEffect(
        input.dataset.effectEnabled,
        { enabled: input.checked }
      );
    }

    if (input.hasAttribute("data-audio-muted")) {
      this.updateNestedProperty("audio", "muted", input.checked);
    }
  }

  handleClick(event) {
    const tab = event.target.closest("[data-inspector-tab]");

    if (tab) {
      this.setTab(tab.dataset.inspectorTab);
      return;
    }

    const action = event.target.closest("[data-inspector-action]");

    if (!action) return;

    switch (action.dataset.inspectorAction) {
      case "reset-transform":
        this.updatePropertyGroup("transform", {
          ...DEFAULT_TRANSFORM
        });
        break;

      case "add-keyframe":
        eventBus.emit("INSPECTOR_ADD_KEYFRAME", {
          clipId: this.selectedClipId
        });
        break;
    }
  }

  updateProperty(property, value) {
    const group = this.activeTab === "transform"
      ? "transform"
      : this.activeTab === "color"
        ? "color"
        : this.activeTab === "audio"
          ? "audio"
          : null;

    if (!group) return;

    this.updateNestedProperty(group, property, value);
  }

  updateNestedProperty(group, property, value) {
    const selected = this.getSelectedClip();

    if (!selected) return;

    const current = selected.clip[group] || {};

    selected.clip[group] = {
      ...current,
      [property]: value
    };

    selected.clip.updatedAt = Date.now();

    eventBus.emit("CLIP_UPDATED", {
      clipId: selected.clip.id,
      group,
      property,
      value
    });

    this.emit("property-changed", {
      clipId: selected.clip.id,
      group,
      property,
      value
    });
  }

  updatePropertyGroup(group, values) {
    const selected = this.getSelectedClip();

    if (!selected) return;

    selected.clip[group] = { ...values };
    selected.clip.updatedAt = Date.now();

    eventBus.emit("CLIP_UPDATED", {
      clipId: selected.clip.id,
      group,
      values
    });

    this.render();
  }

  updateEffect(effectId, changes) {
    const selected = this.getSelectedClip();

    if (!selected) return;

    const effect = (selected.clip.effects || []).find(
      item => item.id === effectId
    );

    if (!effect) return;

    Object.assign(effect, changes);

    eventBus.emit("CLIP_UPDATED", {
      clipId: selected.clip.id,
      effectId,
      changes
    });
  }

  title(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  escape(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(type, data) {
    this.listeners.forEach(callback => {
      try {
        callback({ type, data });
      } catch (error) {
        console.error(error);
      }
    });
  }

  destroy() {
    this.container?.removeEventListener("input", this.handleInput);
    this.container?.removeEventListener("change", this.handleInput);
    this.container?.removeEventListener("click", this.handleClick);

    this.unsubscribe?.();
    this.listeners.clear();
  }
}

export const inspectorManager = new InspectorManager();
