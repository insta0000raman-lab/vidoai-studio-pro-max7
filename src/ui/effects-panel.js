import { effectRegistry } from "../effects/effect-registry.js";
import { projectManager } from "../project/project-manager.js";
import { notifications } from "../core/notifications.js";

export class EffectsPanel {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.querySelector('[data-panel-content="effects"]');

    this.selectedClipId = null;
    this.selectedEffectId = null;

    this.bind();
    this.render();
  }

  bind() {
    if (!this.container) return;

    this.container.addEventListener("click", event => {
      const button = event.target.closest("[data-effect-action]");

      if (!button) return;

      const action = button.dataset.effectAction;

      if (action === "add") {
        this.addEffect(button.dataset.effectType);
      }

      if (action === "toggle") {
        this.toggleEffect(button.dataset.effectId);
      }

      if (action === "remove") {
        this.removeEffect(button.dataset.effectId);
      }

      if (action === "select") {
        this.selectedEffectId = button.dataset.effectId;
        this.render();
      }

      if (action === "reset") {
        this.resetEffect(button.dataset.effectId);
      }
    });

    this.container.addEventListener("input", event => {
      const input = event.target.closest("[data-effect-param]");

      if (!input) return;

      this.updateParameter(
        input.dataset.effectId,
        input.dataset.effectParam,
        Number(input.value)
      );
    });
  }

  getProject() {
    return projectManager.currentProject;
  }

  getSelectedClip() {
    const project = this.getProject();

    if (!project) return null;

    for (const track of project.tracks || []) {
      const clip = (track.clips || []).find(
        item => item.id === this.selectedClipId
      );

      if (clip) return clip;
    }

    return null;
  }

  setSelectedClip(clipId) {
    this.selectedClipId = clipId;
    this.selectedEffectId = null;
    this.render();
  }

  getEffects() {
    const clip = this.getSelectedClip();

    return clip?.effects || [];
  }

  getDefinitions() {
    return effectRegistry.getDefinitions?.() || [];
  }

  addEffect(type) {
    const clip = this.getSelectedClip();

    if (!clip) {
      notifications.warning("Select a clip first.");
      return;
    }

    try {
      const effect = effectRegistry.createInstance(
        type,
        clip.id
      );

      if (!Array.isArray(clip.effects)) {
        clip.effects = [];
      }

      clip.effects.push(effect);

      this.selectedEffectId = effect.id;

      projectManager.updateProject?.({
        updatedAt: Date.now()
      });

      this.render();

      notifications.success("Effect added.");

    } catch (error) {
      notifications.error(error.message);
    }
  }

  toggleEffect(effectId) {
    const effect = this.findEffect(effectId);

    if (!effect) return;

    effect.enabled = !effect.enabled;
    this.notifyChange();
    this.render();
  }

  removeEffect(effectId) {
    const clip = this.getSelectedClip();

    if (!clip) return;

    clip.effects = (clip.effects || []).filter(
      effect => effect.id !== effectId
    );

    if (this.selectedEffectId === effectId) {
      this.selectedEffectId = null;
    }

    this.notifyChange();
    this.render();
  }

  resetEffect(effectId) {
    const effect = this.findEffect(effectId);

    if (!effect) return;

    const definition = this.getDefinitions().find(
      item => item.type === effect.type
    );

    if (!definition) return;

    effect.params = structuredClone(
      definition.defaults || {}
    );

    this.notifyChange();
    this.render();
  }

  updateParameter(effectId, parameter, value) {
    const effect = this.findEffect(effectId);

    if (!effect) return;

    const definition = this.getDefinitions().find(
      item => item.type === effect.type
    );

    const setting = definition?.parameters?.[parameter];

    if (!setting) return;

    const min = Number(setting.min ?? 0);
    const max = Number(setting.max ?? 100);

    effect.params[parameter] = Math.max(
      min,
      Math.min(max, value)
    );

    this.notifyChange(false);

    document.dispatchEvent(
      new CustomEvent("zerox:effect-preview-update", {
        detail: {
          clipId: this.selectedClipId,
          effect
        }
      })
    );
  }

  findEffect(effectId) {
    return this.getEffects().find(
      effect => effect.id === effectId
    );
  }

  notifyChange(render = true) {
    projectManager.updateProject?.({
      updatedAt: Date.now()
    });

    document.dispatchEvent(
      new CustomEvent("zerox:effects-changed", {
        detail: {
          clipId: this.selectedClipId,
          effects: this.getEffects()
        }
      })
    );

    if (render) this.render();
  }

  render() {
    if (!this.container) return;

    const clip = this.getSelectedClip();
    const effects = this.getEffects();

    const definitions = this.getDefinitions();

    this.container.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Effects Studio";
    this.container.appendChild(heading);

    if (!clip) {
      const message = document.createElement("p");
      message.className = "empty-message";
      message.textContent = "Select a timeline clip first.";
      this.container.appendChild(message);
      return;
    }

    const library = document.createElement("div");
    library.className = "effect-library";

    const libraryTitle = document.createElement("h4");
    libraryTitle.textContent = "Add Effect";
    library.appendChild(libraryTitle);

    definitions.forEach(definition => {
      const button = document.createElement("button");

      button.type = "button";
      button.dataset.effectAction = "add";
      button.dataset.effectType = definition.type;
      button.textContent = definition.name || definition.type;

      library.appendChild(button);
    });

    this.container.appendChild(library);

    const stack = document.createElement("div");
    stack.className = "effect-stack";

    const stackTitle = document.createElement("h4");
    stackTitle.textContent = "Effect Stack";
    stack.appendChild(stackTitle);

    effects.forEach(effect => {
      const row = document.createElement("div");
      row.className = "effect-row";

      const select = document.createElement("button");
      select.dataset.effectAction = "select";
      select.dataset.effectId = effect.id;
      select.textContent = effect.name || effect.type;

      const toggle = document.createElement("button");
      toggle.dataset.effectAction = "toggle";
      toggle.dataset.effectId = effect.id;
      toggle.textContent = effect.enabled ? "On" : "Off";

      const remove = document.createElement("button");
      remove.dataset.effectAction = "remove";
      remove.dataset.effectId = effect.id;
      remove.textContent = "Remove";

      row.append(select, toggle, remove);
      stack.appendChild(row);
    });

    this.container.appendChild(stack);

    const selected = this.findEffect(this.selectedEffectId);

    if (selected) {
      this.container.appendChild(
        this.createInspector(selected, definitions)
      );
    }
  }

  createInspector(effect, definitions) {
    const definition = definitions.find(
      item => item.type === effect.type
    );

    const panel = document.createElement("section");
    panel.className = "effect-inspector";

    const title = document.createElement("h4");
    title.textContent = effect.name || effect.type;
    panel.appendChild(title);

    const reset = document.createElement("button");
    reset.dataset.effectAction = "reset";
    reset.dataset.effectId = effect.id;
    reset.textContent = "Reset";
    panel.appendChild(reset);

    const parameters = definition?.parameters || {};

    Object.entries(parameters).forEach(([key, setting]) => {
      const label = document.createElement("label");
      label.textContent = setting.label || key;

      const input = document.createElement("input");
      input.type = "range";
      input.min = setting.min ?? 0;
      input.max = setting.max ?? 100;
      input.step = setting.step ?? 1;
      input.value = effect.params?.[key] ?? setting.default ?? 0;

      input.dataset.effectParam = key;
      input.dataset.effectId = effect.id;

      label.appendChild(input);
      panel.appendChild(label);
    });

    return panel;
  }

  destroy() {
    this.container?.replaceChildren();
  }
}

export default EffectsPanel;
