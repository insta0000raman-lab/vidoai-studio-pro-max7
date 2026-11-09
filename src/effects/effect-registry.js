import { createId } from "../project/schema.js";
import { projectManager } from "../project/project-manager.js";
import { eventBus } from "../core/event-bus.js";
import { notifications } from "../core/notifications.js";

const EFFECTS = [
  {
    id: "brightness",
    name: "Brightness",
    category: "Color",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: -100, max: 100, step: 1 }
    }
  },
  {
    id: "contrast",
    name: "Contrast",
    category: "Color",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: -100, max: 100, step: 1 }
    }
  },
  {
    id: "saturation",
    name: "Saturation",
    category: "Color",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: -100, max: 100, step: 1 }
    }
  },
  {
    id: "exposure",
    name: "Exposure",
    category: "Color",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: -5, max: 5, step: 0.1 }
    }
  },
  {
    id: "temperature",
    name: "Temperature",
    category: "Color",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: -100, max: 100, step: 1 }
    }
  },
  {
    id: "tint",
    name: "Tint",
    category: "Color",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: -100, max: 100, step: 1 }
    }
  },
  {
    id: "highlights",
    name: "Highlights",
    category: "Color",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: -100, max: 100, step: 1 }
    }
  },
  {
    id: "shadows",
    name: "Shadows",
    category: "Color",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: -100, max: 100, step: 1 }
    }
  },
  {
    id: "sharpen",
    name: "Sharpen",
    category: "Detail",
    defaults: { amount: 20 },
    parameters: {
      amount: { min: 0, max: 100, step: 1 }
    }
  },
  {
    id: "blur",
    name: "Blur",
    category: "Blur",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: 0, max: 100, step: 1 }
    }
  },
  {
    id: "vignette",
    name: "Vignette",
    category: "Light",
    defaults: { amount: 0 },
    parameters: {
      amount: { min: 0, max: 100, step: 1 }
    }
  },
  {
    id: "glow",
    name: "Glow",
    category: "Light",
    defaults: { amount: 20, radius: 15 },
    parameters: {
      amount: { min: 0, max: 100, step: 1 },
      radius: { min: 0, max: 100, step: 1 }
    }
  },
  {
    id: "chromatic",
    name: "Chromatic Aberration",
    category: "Stylize",
    defaults: { amount: 5 },
    parameters: {
      amount: { min: 0, max: 100, step: 1 }
    }
  }
];

class EffectRegistry {
  constructor() {
    this.registry = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    EFFECTS.forEach(effect => this.register(effect));
  }

  register(definition) {
    if (!definition?.id || !definition?.name) {
      throw new Error("Effect needs an id and name.");
    }

    if (this.registry.has(definition.id)) {
      throw new Error(`Effect already registered: ${definition.id}`);
    }

    this.registry.set(definition.id, {
      ...definition,
      defaults: { ...definition.defaults },
      parameters: { ...definition.parameters }
    });

    return definition.id;
  }

  unregister(effectId) {
    return this.registry.delete(effectId);
  }

  get(effectId) {
    const effect = this.registry.get(effectId);
    return effect ? structuredClone(effect) : null;
  }

  getAll() {
    return [...this.registry.values()].map(effect =>
      structuredClone(effect)
    );
  }

  getByCategory(category) {
    return this.getAll().filter(effect =>
      effect.category === category
    );
  }

  getCategories() {
    return [...new Set(
      this.getAll().map(effect => effect.category)
    )];
  }

  createInstance(effectId, options = {}) {
    const definition = this.registry.get(effectId);

    if (!definition) {
      throw new Error(`Unknown effect: ${effectId}`);
    }

    return {
      id: createId("effect"),
      type: effectId,
      name: definition.name,
      enabled: true,
      parameters: {
        ...definition.defaults,
        ...this.validateParameters(effectId, options.parameters || {})
      },
      startTime: options.startTime ?? 0,
      endTime: options.endTime ?? null,
      blendMode: options.blendMode || "normal",
      intensity: options.intensity ?? 100
    };
  }

  validateParameters(effectId, values) {
    const definition = this.registry.get(effectId);

    if (!definition) {
      throw new Error(`Unknown effect: ${effectId}`);
    }

    const result = {};

    for (const [key, value] of Object.entries(values)) {
      const rule = definition.parameters[key];

      if (!rule || !Number.isFinite(Number(value))) {
        continue;
      }

      result[key] = Math.min(
        rule.max,
        Math.max(rule.min, Number(value))
      );
    }

    return result;
  }
}

class EffectStackManager {
  getClip(clipId) {
    const project = projectManager.currentProject;
    if (!project) throw new Error("No project is open.");

    for (const track of project.tracks || []) {
      const clip = (track.clips || []).find(
        item => item.id === clipId
      );

      if (clip) return clip;
    }

    throw new Error("Clip not found.");
  }

  getStack(clipId) {
    const clip = this.getClip(clipId);
    if (!Array.isArray(clip.effects)) clip.effects = [];

    return clip.effects;
  }

  add(clipId, effectId, options = {}) {
    const clip = this.getClip(clipId);
    const instance = effectRegistry.createInstance(
      effectId,
      options
    );

    if (!Array.isArray(clip.effects)) clip.effects = [];

    clip.effects.push(instance);
    this.changed("added", clipId, instance.id);

    return instance;
  }

  update(clipId, instanceId, changes = {}) {
    const stack = this.getStack(clipId);
    const effect = stack.find(item => item.id === instanceId);

    if (!effect) throw new Error("Effect instance not found.");

    if (changes.parameters) {
      effect.parameters = {
        ...effect.parameters,
        ...effectRegistry.validateParameters(
          effect.type,
          changes.parameters
        )
      };
    }

    if (typeof changes.enabled === "boolean") {
      effect.enabled = changes.enabled;
    }

    if (changes.intensity !== undefined) {
      effect.intensity = Math.min(
        100,
        Math.max(0, Number(changes.intensity) || 0)
      );
    }

    if (changes.startTime !== undefined) {
      effect.startTime = Math.max(0, Number(changes.startTime) || 0);
    }

    if (changes.endTime !== undefined) {
      effect.endTime = changes.endTime === null
        ? null
        : Math.max(effect.startTime, Number(changes.endTime) || 0);
    }

    this.changed("updated", clipId, instanceId);
    return effect;
  }

  remove(clipId, instanceId) {
    const clip = this.getClip(clipId);
    if (!Array.isArray(clip.effects)) return false;

    const index = clip.effects.findIndex(
      item => item.id === instanceId
    );

    if (index < 0) return false;

    clip.effects.splice(index, 1);
    this.changed("removed", clipId, instanceId);
    return true;
  }

  move(clipId, instanceId, newIndex) {
    const stack = this.getStack(clipId);
    const oldIndex = stack.findIndex(
      item => item.id === instanceId
    );

    if (oldIndex < 0) return false;

    const [effect] = stack.splice(oldIndex, 1);
    const target = Math.max(
      0,
      Math.min(stack.length, Number(newIndex) || 0)
    );

    stack.splice(target, 0, effect);
    this.changed("reordered", clipId, instanceId);
    return true;
  }

  toggle(clipId, instanceId) {
    const stack = this.getStack(clipId);
    const effect = stack.find(item => item.id === instanceId);

    if (!effect) return false;

    effect.enabled = !effect.enabled;
    this.changed("toggled", clipId, instanceId);
    return effect.enabled;
  }

  duplicate(clipId, instanceId) {
    const stack = this.getStack(clipId);
    const original = stack.find(item => item.id === instanceId);

    if (!original) throw new Error("Effect not found.");

    const copy = {
      ...structuredClone(original),
      id: createId("effect")
    };

    stack.splice(stack.indexOf(original) + 1, 0, copy);
    this.changed("duplicated", clipId, copy.id);

    return copy;
  }

  changed(action, clipId, effectId) {
    const project = projectManager.currentProject;
    if (project) project.updatedAt = Date.now();

    eventBus.emit("EFFECT_STACK_CHANGED", {
      action,
      clipId,
      effectId
    });
  }
}

export const effectRegistry = new EffectRegistry();
export const effectStack = new EffectStackManager();
