const DEFAULTS = {
  fontFamily: "Arial",
  fontSize: 64,
  fontWeight: 700,
  fontStyle: "normal",
  color: "#ffffff",
  textAlign: "center",
  lineHeight: 1.2,
  letterSpacing: 0,
  stroke: {
    color: "#000000",
    width: 0
  },
  shadow: {
    enabled: false,
    color: "#000000",
    blur: 12,
    offsetX: 0,
    offsetY: 4
  },
  glow: {
    enabled: false,
    color: "#8b7cff",
    intensity: 0,
    blur: 20
  }
};

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export class TypographyEngine {
  constructor() {
    this.fontRegistry = new Map();
    this.measurementCanvas = null;
    this.measurementContext = null;
  }

  normalize(style = {}) {
    return {
      ...structuredClone(DEFAULTS),
      ...style,
      stroke: {
        ...DEFAULTS.stroke,
        ...(style.stroke || {})
      },
      shadow: {
        ...DEFAULTS.shadow,
        ...(style.shadow || {})
      },
      glow: {
        ...DEFAULTS.glow,
        ...(style.glow || {})
      }
    };
  }

  getFontString(style = {}) {
    const s = this.normalize(style);

    const weight = clamp(
      safeNumber(s.fontWeight, 700),
      100,
      900
    );

    const size = clamp(
      safeNumber(s.fontSize, 64),
      1,
      2000
    );

    const fontStyle = s.fontStyle === "italic"
      ? "italic"
      : "normal";

    return `${fontStyle} ${weight} ${size}px "${s.fontFamily}"`;
  }

  getTextShadow(style = {}) {
    const s = this.normalize(style);
    const shadows = [];

    if (s.shadow.enabled) {
      shadows.push(
        `${safeNumber(s.shadow.offsetX)}px ` +
        `${safeNumber(s.shadow.offsetY)}px ` +
        `${Math.max(0, safeNumber(s.shadow.blur))}px ` +
        `${s.shadow.color}`
      );
    }

    if (s.glow.enabled && s.glow.intensity > 0) {
      const blur = Math.max(
        0,
        safeNumber(s.glow.blur, 20)
      );

      const intensity = clamp(
        safeNumber(s.glow.intensity),
        0,
        1
      );

      const glowBlur = blur * intensity;

      if (glowBlur > 0) {
        shadows.push(
          `0 0 ${glowBlur}px ${s.glow.color}`
        );

        shadows.push(
          `0 0 ${glowBlur * 1.8}px ${s.glow.color}`
        );
      }
    }

    return shadows.length ? shadows.join(", ") : "none";
  }

  getStroke(style = {}) {
    const s = this.normalize(style);
    const width = clamp(
      safeNumber(s.stroke.width),
      0,
      100
    );

    if (width <= 0) {
      return {
        width: 0,
        color: "transparent"
      };
    }

    return {
      width,
      color: s.stroke.color
    };
  }

  getCSS(style = {}) {
    const s = this.normalize(style);
    const stroke = this.getStroke(s);

    const css = {
      fontFamily: `"${s.fontFamily}", sans-serif`,
      fontSize: `${clamp(s.fontSize, 1, 2000)}px`,
      fontWeight: String(s.fontWeight),
      fontStyle: s.fontStyle,
      color: s.color,
      textAlign: s.textAlign,
      lineHeight: String(
        clamp(s.lineHeight, 0.1, 10)
      ),
      letterSpacing: `${safeNumber(s.letterSpacing)}px`,
      textShadow: this.getTextShadow(s),
      WebkitTextStroke:
        `${stroke.width}px ${stroke.color}`,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere"
    };

    return css;
  }

  getCanvasContext() {
    if (this.measurementContext) {
      return this.measurementContext;
    }

    if (typeof document === "undefined") {
      return null;
    }

    this.measurementCanvas = document.createElement("canvas");
    this.measurementContext =
      this.measurementCanvas.getContext("2d");

    return this.measurementContext;
  }

  measureText(text, style = {}) {
    const s = this.normalize(style);
    const context = this.getCanvasContext();

    if (!context) {
      return {
        width: 0,
        height: 0,
        approximate: true
      };
    }

    context.font = this.getFontString(s);

    const lines = String(text ?? "").split("\n");

    const widths = lines.map(line =>
      context.measureText(line).width
    );

    const letterSpacing = safeNumber(s.letterSpacing);

    const adjustedWidths = lines.map((line, index) =>
      Math.max(
        0,
        widths[index] +
        Math.max(0, line.length - 1) * letterSpacing
      )
    );

    const lineHeight = s.fontSize * s.lineHeight;

    return {
      width: Math.max(0, ...adjustedWidths),
      height: Math.max(1, lines.length) * lineHeight,
      lineCount: lines.length,
      lineHeight,
      approximate: false
    };
  }

  wrapText(text, maxWidth, style = {}) {
    const context = this.getCanvasContext();

    if (!context) {
      return String(text ?? "").split("\n");
    }

    const s = this.normalize(style);
    context.font = this.getFontString(s);

    const limit = Math.max(1, safeNumber(maxWidth, 500));
    const result = [];

    for (const paragraph of String(text ?? "").split("\n")) {
      const words = paragraph.split(/\s+/);
      let line = "";

      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;

        if (
          line &&
          context.measureText(candidate).width > limit
        ) {
          result.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }

      result.push(line);
    }

    return result;
  }

  async registerFont(name, source, options = {}) {
    if (typeof FontFace === "undefined") {
      throw new Error("Font loading is not supported here");
    }

    const fontName = String(name || "").trim();

    if (!fontName || !source) {
      throw new Error("Font name and source are required");
    }

    const face = new FontFace(
      fontName,
      `url("${source}")`,
      {
        weight: options.weight || "100 900",
        style: options.style || "normal"
      }
    );

    await face.load();
    document.fonts.add(face);

    this.fontRegistry.set(fontName, {
      family: fontName,
      source,
      weight: options.weight || "100 900",
      style: options.style || "normal",
      loaded: true
    });

    return this.getFont(fontName);
  }

  getFont(name) {
    return this.fontRegistry.get(name) || null;
  }

  listFonts() {
    return [...this.fontRegistry.values()].map(font => ({
      ...font
    }));
  }

  removeFont(name) {
    const font = this.fontRegistry.get(name);

    if (!font) return false;

    if (typeof document !== "undefined") {
      for (const face of document.fonts) {
        if (face.family === name) {
          document.fonts.delete(face);
        }
      }
    }

    return this.fontRegistry.delete(name);
  }

  async waitForFonts() {
    if (typeof document === "undefined") return;

    await document.fonts.ready;
  }

  resetMeasurementCache() {
    this.measurementCanvas = null;
    this.measurementContext = null;
  }
}

export const typography = new TypographyEngine();
