const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const lerp = (start, end, progress) =>
  start + (end - start) * progress;

export class InterpolationEngine {
  constructor() {
    this.easingFunctions = {
      linear: t => t,
      ease: t => t * t * (3 - 2 * t),
      easeIn: t => t * t,
      easeOut: t => 1 - (1 - t) ** 2,
      easeInOut: t =>
        t < 0.5
          ? 2 * t * t
          : 1 - ((-2 * t + 2) ** 2) / 2,
      easeInCubic: t => t * t * t,
      easeOutCubic: t => 1 - (1 - t) ** 3,
      easeInOutCubic: t =>
        t < 0.5
          ? 4 * t * t * t
          : 1 - ((-2 * t + 2) ** 3) / 2,
      easeInBack: t => {
        const c = 1.70158;
        return (c + 1) * t * t * t - c * t * t;
      },
      easeOutBack: t => {
        const c = 1.70158;
        return 1 + (c + 1) * (t - 1) ** 3 +
          c * (t - 1) ** 2;
      },
      easeInOutBack: t => {
        const c = 1.70158 * 1.525;
        return t < 0.5
          ? ((2 * t) ** 2 * ((c + 1) * 2 * t - c)) / 2
          : (((2 * t - 2) ** 2 *
            ((c + 1) * (t * 2 - 2) + c) + 2) / 2);
      },
      easeOutBounce: t => {
        const n = 7.5625;
        const d = 2.75;

        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) {
          return n * (t -= 1.5 / d) * t + 0.75;
        }
        if (t < 2.5 / d) {
          return n * (t -= 2.25 / d) * t + 0.9375;
        }

        return n * (t -= 2.625 / d) * t + 0.984375;
      },
      easeInBounce: t =>
        1 - this.easingFunctions.easeOutBounce(1 - t),
      easeInOutBounce: t =>
        t < 0.5
          ? (1 - this.easingFunctions.easeOutBounce(1 - 2 * t)) / 2
          : (1 + this.easingFunctions.easeOutBounce(2 * t - 1)) / 2
    };
  }

  ease(progress, type = "linear") {
    const t = clamp(progress);
    const easing = this.easingFunctions[type];

    return easing ? easing(t) : t;
  }

  linear(from, to, progress) {
    if (
      typeof from !== "number" ||
      typeof to !== "number"
    ) {
      return progress < 1 ? from : to;
    }

    return lerp(from, to, clamp(progress));
  }

  cubicBezier(progress, points = {}) {
    const t = clamp(progress);

    const x1 = points.x1 ?? 0.25;
    const y1 = points.y1 ?? 0.1;
    const x2 = points.x2 ?? 0.25;
    const y2 = points.y2 ?? 1;

    const sample = (a, b, t) =>
      3 * (1 - t) ** 2 * t * a +
      3 * (1 - t) * t * t * b +
      t ** 3;

    const derivative = (a, b, t) =>
      3 * (1 - t) ** 2 * a +
      6 * (1 - t) * t * (b - a) +
      3 * t * t * (1 - b);

    let parameter = t;

    for (let i = 0; i < 8; i++) {
      const error = sample(x1, x2, parameter) - t;
      const slope = derivative(x1, x2, parameter);

      if (Math.abs(error) < 0.00001) break;
      if (Math.abs(slope) < 0.00001) break;

      parameter = clamp(parameter - error / slope);
    }

    return sample(y1, y2, parameter);
  }

  interpolate(from, to, progress, options = {}) {
    const {
      easing = "linear",
      interpolation = "linear",
      bezier = null
    } = options;

    let t = clamp(progress);

    if (interpolation === "bezier" && bezier) {
      t = this.cubicBezier(t, bezier);
    } else {
      t = this.ease(t, easing);
    }

    if (typeof from === "number" && typeof to === "number") {
      return lerp(from, to, t);
    }

    if (
      Array.isArray(from) &&
      Array.isArray(to) &&
      from.length === to.length
    ) {
      return from.map((value, index) =>
        this.interpolate(value, to[index], t, options)
      );
    }

    if (
      from &&
      to &&
      typeof from === "object" &&
      typeof to === "object" &&
      !Array.isArray(from) &&
      !Array.isArray(to)
    ) {
      const result = {};

      for (const key of new Set([
        ...Object.keys(from),
        ...Object.keys(to)
      ])) {
        result[key] = this.interpolate(
          from[key],
          to[key],
          t,
          options
        );
      }

      return result;
    }

    return t < 1 ? from : to;
  }

  interpolateKeyframes(frames, time, fallback = null) {
    if (!Array.isArray(frames) || frames.length === 0) {
      return fallback;
    }

    const sorted = [...frames]
      .filter(frame => frame.enabled !== false)
      .sort((a, b) => a.time - b.time);

    if (!sorted.length) return fallback;

    if (time <= sorted[0].time) {
      return sorted[0].value;
    }

    const last = sorted[sorted.length - 1];

    if (time >= last.time) {
      return last.value;
    }

    let previous = sorted[0];
    let next = null;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].time >= time) {
        next = sorted[i];
        break;
      }

      previous = sorted[i];
    }

    if (!next) return previous.value;

    const duration = next.time - previous.time;

    if (duration <= 0) return next.value;

    const progress = (time - previous.time) / duration;

    return this.interpolate(
      previous.value,
      next.value,
      progress,
      {
        easing: previous.easing || "linear",
        interpolation: previous.interpolation || "linear",
        bezier: previous.outHandle || null
      }
    );
  }

  getEasingNames() {
    return Object.keys(this.easingFunctions);
  }
}

export const interpolation = new InterpolationEngine();
