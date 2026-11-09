import { effectRegistry } from "./effect-registry.js";

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const toByte = value =>
  Math.round(clamp(value) * 255);

const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

class ColorEngine {
  constructor() {
    this.cache = new Map();
  }

  getEnabledEffects(clip) {
    return (clip?.effects || []).filter(effect =>
      effect.enabled &&
      effect.type &&
      effectRegistry.get(effect.type)
    );
  }

  getParameters(clip) {
    const result = {};

    for (const effect of this.getEnabledEffects(clip)) {
      const definition = effectRegistry.get(effect.type);
      const values = {
        ...definition.defaults,
        ...(effect.parameters || {})
      };

      const intensity = clamp(
        (effect.intensity ?? 100) / 100
      );

      for (const [key, value] of Object.entries(values)) {
        const defaultValue = definition.defaults[key] ?? 0;

        result[`${effect.type}.${key}`] =
          defaultValue + (value - defaultValue) * intensity;
      }
    }

    return result;
  }

  getFilterString(clip) {
    const values = this.getParameters(clip);

    const brightness = 1 + (values["brightness.amount"] || 0) / 100;
    const contrast = 1 + (values["contrast.amount"] || 0) / 100;
    const saturation = 1 + (values["saturation.amount"] || 0) / 100;
    const exposure = values["exposure.amount"] || 0;

    const filters = [
      `brightness(${Math.max(0, brightness)})`,
      `contrast(${Math.max(0, contrast)})`,
      `saturate(${Math.max(0, saturation)})`,
      `brightness(${Math.pow(2, exposure)})`
    ];

    const temperature = values["temperature.amount"] || 0;
    const tint = values["tint.amount"] || 0;

    if (temperature !== 0 || tint !== 0) {
      const warm = clamp(temperature / 200, -0.5, 0.5);
      const green = clamp(tint / 250, -0.4, 0.4);

      filters.push(
        `sepia(${Math.abs(warm)})`,
        `hue-rotate(${green * 35}deg)`
      );
    }

    const blur = values["blur.amount"] || 0;

    if (blur > 0) {
      filters.push(`blur(${blur / 10}px)`);
    }

    return filters.join(" ");
  }

  applyPixelEffects(imageData, clip) {
    if (!imageData?.data) {
      throw new Error("Valid ImageData is required.");
    }

    const values = this.getParameters(clip);
    const data = imageData.data;

    const brightness = (values["brightness.amount"] || 0) / 100;
    const contrast = 1 + (values["contrast.amount"] || 0) / 100;
    const saturation = 1 + (values["saturation.amount"] || 0) / 100;
    const exposure = values["exposure.amount"] || 0;
    const temperature = values["temperature.amount"] || 0;
    const tint = values["tint.amount"] || 0;
    const highlights = (values["highlights.amount"] || 0) / 100;
    const shadows = (values["shadows.amount"] || 0) / 100;

    const exposureMultiplier = Math.pow(2, exposure);
    const redShift = temperature * 0.35;
    const blueShift = -temperature * 0.35;
    const greenShift = tint * 0.25;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      r *= exposureMultiplier;
      g *= exposureMultiplier;
      b *= exposureMultiplier;

      const luminance =
        0.2126 * r +
        0.7152 * g +
        0.0722 * b;

      const shadowWeight = 1 - smoothstep(0.05, 0.55, luminance);
      const highlightWeight = smoothstep(0.45, 0.95, luminance);

      const tonalAdjustment =
        shadows * shadowWeight * 0.35 +
        highlights * highlightWeight * 0.35;

      r += tonalAdjustment;
      g += tonalAdjustment;
      b += tonalAdjustment;

      r += brightness + redShift / 255;
      g += brightness + greenShift / 255;
      b += brightness + blueShift / 255;

      r = (r - 0.5) * contrast + 0.5;
      g = (g - 0.5) * contrast + 0.5;
      b = (b - 0.5) * contrast + 0.5;

      const gray =
        0.2126 * r +
        0.7152 * g +
        0.0722 * b;

      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;

      data[i] = toByte(r);
      data[i + 1] = toByte(g);
      data[i + 2] = toByte(b);
    }

    return imageData;
  }

  applyVignette(context, width, height, amount = 0) {
    if (!context || amount <= 0) return;

    const strength = clamp(amount / 100);

    const gradient = context.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.2,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    );

    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(
      1,
      `rgba(0,0,0,${strength * 0.85})`
    );

    context.save();
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  getVignetteAmount(clip) {
    return this.getParameters(clip)["vignette.amount"] || 0;
  }

  clearCache() {
    this.cache.clear();
  }

  resetClip(clip) {
    if (!clip) return;

    clip.effects = (clip.effects || []).filter(effect =>
      !["brightness", "contrast", "saturation", "exposure",
        "temperature", "tint", "highlights", "shadows"]
        .includes(effect.type)
    );

    this.clearCache();
  }
}

export const colorEngine = new ColorEngine();
