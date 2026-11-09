import { store } from "../core/state-store.js";
import { notifications } from "../core/notifications.js";
import { APP_CONFIG } from "../config.js";

export class RatioController {
  constructor(options = {}) {
    this.stage =
      options.stage || document.querySelector("#previewFrame");

    this.video =
      options.video || document.querySelector("#previewVideo");

    this.canvas =
      options.canvas || document.querySelector("#previewCanvas");

    this.customWidth = 1080;
    this.customHeight = 1920;

    this.ratios = {
      "9:16": { width: 1080, height: 1920 },
      "16:9": { width: 1920, height: 1080 },
      "1:1": { width: 1080, height: 1080 },
      "4:5": { width: 1080, height: 1350 }
    };

    this.currentRatio = "9:16";
    this.bind();
    this.apply(this.currentRatio);
  }

  bind() {
    document.querySelectorAll("[data-ratio]").forEach(button => {
      button.addEventListener("click", () => {
        this.apply(button.dataset.ratio);
      });
    });

    document.addEventListener(
      "zerox:custom-ratio",
      event => {
        const { width, height } = event.detail || {};
        this.setCustom(width, height);
      }
    );
  }

  getDimensions(ratio) {
    if (ratio === "custom") {
      return {
        width: this.customWidth,
        height: this.customHeight
      };
    }

    return this.ratios[ratio] || this.ratios["9:16"];
  }

  apply(ratio) {
    const dimensions = this.getDimensions(ratio);

    if (
      !Number.isFinite(dimensions.width) ||
      !Number.isFinite(dimensions.height) ||
      dimensions.width <= 0 ||
      dimensions.height <= 0
    ) {
      notifications.warning("Invalid canvas dimensions.");
      return false;
    }

    this.currentRatio = ratio;

    const aspect =
      dimensions.width / dimensions.height;

    if (this.stage) {
      this.stage.style.aspectRatio =
        `${dimensions.width} / ${dimensions.height}`;

      this.stage.dataset.ratio = ratio;
    }

    if (this.canvas) {
      this.canvas.width = dimensions.width;
      this.canvas.height = dimensions.height;
    }

    document.querySelectorAll("[data-ratio]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.ratio === ratio
      );
    });

    const project = store.getState()?.project;

    if (project) {
      project.settings ||= {};
      project.settings.width = dimensions.width;
      project.settings.height = dimensions.height;
      project.settings.ratio = ratio;
      project.updatedAt = Date.now();
    }

    document.dispatchEvent(
      new CustomEvent("zerox:ratio-changed", {
        detail: {
          ratio,
          width: dimensions.width,
          height: dimensions.height,
          aspect
        }
      })
    );

    return true;
  }

  setCustom(width, height) {
    width = Math.round(Number(width));
    height = Math.round(Number(height));

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 64 ||
      height < 64 ||
      width > 7680 ||
      height > 7680
    ) {
      notifications.warning(
        "Custom dimensions must be between 64 and 7680."
      );
      return false;
    }

    this.customWidth = width;
    this.customHeight = height;

    return this.apply("custom");
  }

  getCurrentDimensions() {
    return this.getDimensions(this.currentRatio);
  }

  getCurrentRatio() {
    return this.currentRatio;
  }

  destroy() {
    document.querySelectorAll("[data-ratio]").forEach(button => {
      button.replaceWith(button.cloneNode(true));
    });
  }
}

export default RatioController;
