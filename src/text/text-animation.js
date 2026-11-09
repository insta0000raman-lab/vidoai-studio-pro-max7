import { keyframes } from "../animation/keyframes.js";
import { interpolation } from "../animation/interpolation.js";

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const PRESETS = {
  fadeIn: {
    duration: 0.6,
    from: { opacity: 0 },
    to: { opacity: 1 }
  },
  fadeOut: {
    duration: 0.6,
    from: { opacity: 1 },
    to: { opacity: 0 }
  },
  popIn: {
    duration: 0.5,
    from: { opacity: 0, scaleX: 0.5, scaleY: 0.5 },
    to: { opacity: 1, scaleX: 1, scaleY: 1 }
  },
  popOut: {
    duration: 0.5,
    from: { opacity: 1, scaleX: 1, scaleY: 1 },
    to: { opacity: 0, scaleX: 0.5, scaleY: 0.5 }
  },
  zoomIn: {
    duration: 0.7,
    from: { opacity: 0, scaleX: 0.1, scaleY: 0.1 },
    to: { opacity: 1, scaleX: 1, scaleY: 1 }
  },
  zoomOut: {
    duration: 0.7,
    from: { opacity: 1, scaleX: 1, scaleY: 1 },
    to: { opacity: 0, scaleX: 0.1, scaleY: 0.1 }
  },
  slideLeft: {
    duration: 0.6,
    from: { opacity: 0, positionX: 120 },
    to: { opacity: 1, positionX: 0 }
  },
  slideRight: {
    duration: 0.6,
    from: { opacity: 0, positionX: -120 },
    to: { opacity: 1, positionX: 0 }
  },
  slideUp: {
    duration: 0.6,
    from: { opacity: 0, positionY: 100 },
    to: { opacity: 1, positionY: 0 }
  },
  slideDown: {
    duration: 0.6,
    from: { opacity: 0, positionY: -100 },
    to: { opacity: 1, positionY: 0 }
  },
  rotateIn: {
    duration: 0.7,
    from: { opacity: 0, rotation: -90, scaleX: 0.7, scaleY: 0.7 },
    to: { opacity: 1, rotation: 0, scaleX: 1, scaleY: 1 }
  },
  bounceIn: {
    duration: 0.8,
    from: { opacity: 0, positionY: -100, scaleX: 0.7, scaleY: 0.7 },
    to: { opacity: 1, positionY: 0, scaleX: 1, scaleY: 1 },
    easing: "easeOutBounce"
  }
};

export class TextAnimationEngine {
  constructor() {
    this.customPresets = new Map();
  }

  getPresets() {
    return Object.entries(PRESETS).map(([name, preset]) => ({
      name,
      duration: preset.duration,
      easing: preset.easing || "easeOutCubic",
      from: { ...preset.from },
      to: { ...preset.to }
    }));
  }

  getPreset(name) {
    const preset = PRESETS[name] || this.customPresets.get(name);

    return preset ? structuredClone(preset) : null;
  }

  createCustom(name, config) {
    const id = String(name || "").trim();

    if (!id) throw new Error("Animation name is required");
    if (!config?.from || !config?.to) {
      throw new Error("Animation needs from and to values");
    }

    const duration = Number(config.duration);

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Animation duration must be positive");
    }

    const preset = {
      duration,
      from: { ...config.from },
      to: { ...config.to },
      easing: config.easing || "easeOutCubic"
    };

    this.customPresets.set(id, preset);

    return {
      name: id,
      ...structuredClone(preset)
    };
  }

  deleteCustom(name) {
    return this.customPresets.delete(name);
  }

  apply(layer, name, options = {}) {
    if (!layer) throw new Error("Text layer is required");

    const preset = this.getPreset(name);

    if (!preset) {
      throw new Error(`Animation preset not found: ${name}`);
    }

    const duration = Math.max(
      0.05,
      Number(options.duration) || preset.duration
    );

    const startTime = Math.max(
      0,
      Number(options.startTime) || 0
    );

    if (!layer.textAnimations) {
      layer.textAnimations = {
        entrance: null,
        exit: null
      };
    }

    const type = options.type || "entrance";

    if (!["entrance", "exit"].includes(type)) {
      throw new Error("Animation type must be entrance or exit");
    }

    layer.textAnimations[type] = {
      name,
      duration,
      startTime,
      easing: options.easing || preset.easing || "easeOutCubic",
      from: { ...preset.from },
      to: { ...preset.to }
    };

    return layer.textAnimations[type];
  }

  remove(layer, type = "entrance") {
    if (!layer?.textAnimations) return false;

    if (!["entrance", "exit"].includes(type)) {
      return false;
    }

    layer.textAnimations[type] = null;
    return true;
  }

  evaluate(config, localTime) {
    if (!config) return {};

    const start = config.startTime || 0;
    const duration = Math.max(0.001, config.duration || 0.6);
    const progress = clamp((localTime - start) / duration);

    const values = {};

    for (const property of new Set([
      ...Object.keys(config.from || {}),
      ...Object.keys(config.to || {})
    ])) {
      const from = config.from[property] ?? config.to[property];
      const to = config.to[property] ?? from;

      values[property] = interpolation.interpolate(
        from,
        to,
        progress,
        {
          easing: config.easing || "linear",
          interpolation: "linear"
        }
      );
    }

    return values;
  }

  getLayerStyle(layer, projectTime) {
    if (!layer) return {};

    const localTime = projectTime - (layer.startTime || 0);
    const duration = Math.max(0, layer.duration || 0);

    if (localTime < 0 || localTime > duration) {
      return { visible: false };
    }

    const animations = layer.textAnimations || {};
    let result = {
      ...(layer.transform || {}),
      opacity: layer.style?.opacity ?? 1
    };

    const entrance = animations.entrance;

    if (entrance) {
      const values = this.evaluate(entrance, localTime);

      if (localTime < entrance.startTime + entrance.duration) {
        result = { ...result, ...values };
      }
    }

    const exit = animations.exit;

    if (exit) {
      const exitStart = exit.startTime || Math.max(
        0,
        duration - exit.duration
      );

      if (localTime >= exitStart) {
        const values = this.evaluate(
          { ...exit, startTime: exitStart },
          localTime
        );

        result = { ...result, ...values };
      }
    }

    return {
      ...result,
      visible: true
    };
  }

  addPropertyKeyframe(layer, property, time, value) {
    if (!layer?.id) {
      throw new Error("Valid text layer is required");
    }

    return keyframes.add(
      layer.id,
      property,
      time,
      value
    );
  }

  getPropertyValue(layer, property, localTime) {
    if (!layer?.id) return null;

    return keyframes.getValueAt(
      layer.id,
      property,
      localTime
    );
  }

  getTypewriterText(text, progress) {
    const characters = Array.from(String(text ?? ""));
    const count = Math.floor(
      characters.length * clamp(progress)
    );

    return characters.slice(0, count).join("");
  }

  getTypewriterState(text, localTime, duration, options = {}) {
    const startTime = Math.max(0, options.startTime || 0);
    const animationDuration = Math.max(0.001, duration || 1);

    const progress = clamp(
      (localTime - startTime) / animationDuration
    );

    return {
      text: this.getTypewriterText(text, progress),
      progress,
      complete: progress >= 1,
      visible: localTime >= startTime
    };
  }

  getPresetNames() {
    return [
      ...Object.keys(PRESETS),
      ...this.customPresets.keys()
    ];
  }
}

export const textAnimation = new TextAnimationEngine();
