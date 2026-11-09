import { effectRegistry } from "./effect-registry.js";

const clamp = (value, min = 0, max = 255) =>
  Math.max(min, Math.min(max, value));

class FilterEngine {
  getEffects(clip) {
    return (clip?.effects || [])
      .filter(effect =>
        effect.enabled &&
        effectRegistry.get(effect.type)
      );
  }

  getAmount(effect) {
    const value = effect.parameters?.amount ?? 0;
    const intensity = (effect.intensity ?? 100) / 100;
    const defaults = effectRegistry.get(effect.type)?.defaults || {};
    const defaultValue = defaults.amount ?? 0;

    return defaultValue + (value - defaultValue) * intensity;
  }

  apply(context, canvas, clip) {
    if (!context || !canvas || !clip) {
      throw new Error("Canvas, context and clip are required.");
    }

    const effects = this.getEffects(clip);

    for (const effect of effects) {
      const amount = this.getAmount(effect);

      if (amount <= 0 && effect.type !== "chromatic") continue;

      switch (effect.type) {
        case "blur":
          this.blur(context, canvas, amount);
          break;

        case "sharpen":
          this.sharpen(context, canvas, amount);
          break;

        case "glow":
          this.glow(context, canvas, amount, effect);
          break;

        case "chromatic":
          this.chromatic(context, canvas, amount);
          break;
      }
    }

    return canvas;
  }

  blur(context, canvas, amount) {
    const radius = Math.min(20, amount / 10);
    if (radius <= 0) return;

    const source = this.copyCanvas(canvas);

    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.filter = `blur(${radius}px)`;
    context.drawImage(source, 0, 0);
    context.restore();
  }

  sharpen(context, canvas, amount) {
    if (amount <= 0) return;

    const width = canvas.width;
    const height = canvas.height;

    const source = context.getImageData(0, 0, width, height);
    const input = source.data;
    const output = new Uint8ClampedArray(input);
    const strength = Math.min(1.5, amount / 100);

    const kernel = [
      0, -strength, 0,
      -strength, 1 + 4 * strength, -strength,
      0, -strength, 0
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = (y * width + x) * 4;

        for (let channel = 0; channel < 3; channel++) {
          let value = 0;
          let k = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixel =
                ((y + ky) * width + (x + kx)) * 4 + channel;

              value += input[pixel] * kernel[k++];
            }
          }

          output[index + channel] = clamp(value);
        }
      }
    }

    source.data.set(output);
    context.putImageData(source, 0, 0);
  }

  glow(context, canvas, amount, effect) {
    if (amount <= 0) return;

    const radius = Math.min(
      40,
      effect.parameters?.radius ?? 15
    );

    const source = this.copyCanvas(canvas);
    const glowLayer = document.createElement("canvas");

    glowLayer.width = canvas.width;
    glowLayer.height = canvas.height;

    const glowContext = glowLayer.getContext("2d");
    if (!glowContext) return;

    glowContext.filter = `blur(${radius}px)`;
    glowContext.drawImage(source, 0, 0);

    context.save();
    context.globalCompositeOperation = "screen";
    context.globalAlpha = Math.min(1, amount / 100);
    context.drawImage(glowLayer, 0, 0);
    context.restore();
  }

  chromatic(context, canvas, amount) {
    if (amount <= 0) return;

    const source = this.copyCanvas(canvas);
    const offset = Math.min(20, amount / 5);

    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);

    context.globalCompositeOperation = "screen";
    context.globalAlpha = 0.65;

    context.drawImage(source, -offset, 0);
    context.globalAlpha = 0.65;
    context.drawImage(source, offset, 0);

    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.drawImage(source, 0, 0);

    context.restore();
  }

  copyCanvas(canvas) {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;

    const context = copy.getContext("2d");

    if (!context) {
      throw new Error("Could not create temporary canvas.");
    }

    context.drawImage(canvas, 0, 0);
    return copy;
  }

  getSupportedFilters() {
    return [
      "blur",
      "sharpen",
      "glow",
      "chromatic"
    ];
  }
}

export const filterEngine = new FilterEngine();
