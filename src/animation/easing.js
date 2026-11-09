const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const cubicBezier = (t, x1, y1, x2, y2) => {
  const sample = (a, b, p) =>
    3 * (1 - p) ** 2 * p * a +
    3 * (1 - p) * p ** 2 * b +
    p ** 3;

  const derivative = (a, b, p) =>
    3 * (1 - p) ** 2 * a +
    6 * (1 - p) * p * (b - a) +
    3 * p ** 2 * (1 - b);

  let p = t;

  for (let i = 0; i < 10; i++) {
    const error = sample(x1, x2, p) - t;
    const slope = derivative(x1, x2, p);

    if (Math.abs(error) < 0.000001) break;
    if (Math.abs(slope) < 0.000001) break;

    p = clamp(p - error / slope);
  }

  return sample(y1, y2, p);
};

export class EasingManager {
  constructor() {
    this.presets = {
      linear: [0, 0, 1, 1],
      ease: [0.25, 0.1, 0.25, 1],
      easeIn: [0.42, 0, 1, 1],
      easeOut: [0, 0, 0.58, 1],
      easeInOut: [0.42, 0, 0.58, 1],
      smooth: [0.37, 0, 0.63, 1],
      sharp: [0.7, 0, 0.3, 1],
      soft: [0.2, 0.8, 0.2, 1],
      snappy: [0.5, 0, 0.1, 1],
      slowStart: [0.8, 0, 0.2, 1],
      slowEnd: [0.2, 0, 0.8, 1],
      cinematic: [0.65, 0, 0.35, 1]
    };

    this.customCurves = new Map();
  }

  getPreset(name) {
    const curve = this.presets[name];

    return curve ? [...curve] : [...this.presets.linear];
  }

  evaluate(progress, curve = "linear") {
    const t = clamp(Number(progress) || 0);

    if (Array.isArray(curve)) {
      return this.evaluateBezier(t, curve);
    }

    if (typeof curve === "string") {
      const custom = this.customCurves.get(curve);

      if (custom) return this.evaluateBezier(t, custom);

      return this.evaluateBezier(
        t,
        this.getPreset(curve)
      );
    }

    if (curve && typeof curve === "object") {
      return this.evaluateBezier(t, [
        curve.x1 ?? 0.25,
        curve.y1 ?? 0.1,
        curve.x2 ?? 0.25,
        curve.y2 ?? 1
      ]);
    }

    return t;
  }

  evaluateBezier(progress, points) {
    if (!Array.isArray(points) || points.length !== 4) {
      throw new Error("A Bézier curve needs four control values");
    }

    const [x1, y1, x2, y2] = points;

    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      throw new Error("Invalid Bézier control values");
    }

    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      throw new Error("Bézier X values must be between 0 and 1");
    }

    return cubicBezier(
      clamp(progress),
      x1,
      y1,
      x2,
      y2
    );
  }

  createCustom(name, points) {
    const id = String(name || "").trim();

    if (!id) throw new Error("Curve name is required");

    // Validate before saving.
    this.evaluateBezier(0.5, points);

    this.customCurves.set(id, [...points]);

    return {
      name: id,
      points: [...points]
    };
  }

  updateCustom(name, points) {
    if (!this.customCurves.has(name)) {
      throw new Error("Custom curve not found");
    }

    this.evaluateBezier(0.5, points);
    this.customCurves.set(name, [...points]);

    return this.getCustom(name);
  }

  getCustom(name) {
    const points = this.customCurves.get(name);

    return points
      ? { name, points: [...points] }
      : null;
  }

  deleteCustom(name) {
    return this.customCurves.delete(name);
  }

  listPresets() {
    return Object.entries(this.presets).map(
      ([name, points]) => ({
        name,
        points: [...points],
        type: "preset"
      })
    );
  }

  listCustom() {
    return [...this.customCurves.entries()].map(
      ([name, points]) => ({
        name,
        points: [...points],
        type: "custom"
      })
    );
  }

  exportCustom() {
    return [...this.customCurves.entries()].map(
      ([name, points]) => ({ name, points: [...points] })
    );
  }

  importCustom(curves = []) {
    if (!Array.isArray(curves)) {
      throw new Error("Custom curves must be an array");
    }

    for (const curve of curves) {
      if (!curve?.name || !Array.isArray(curve.points)) {
        continue;
      }

      this.createCustom(curve.name, curve.points);
    }

    return this.listCustom();
  }

  resetCustom() {
    this.customCurves.clear();
  }
}

export const easing = new EasingManager();
