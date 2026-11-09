import { notifications } from "../core/notifications.js";

export class CustomRatioDialog {
  constructor() {
    this.dialog = null;
    this.widthInput = null;
    this.heightInput = null;

    this.create();
  }

  create() {
    this.dialog = document.createElement("div");

    this.dialog.className = "zx-custom-ratio";

    this.dialog.innerHTML = `
      <div class="zx-ratio-backdrop"></div>

      <section class="zx-ratio-card">
        <header class="zx-ratio-header">
          <div>
            <h2>Custom Canvas</h2>
            <p>Set your project dimensions</p>
          </div>

          <button
            type="button"
            class="zx-ratio-close"
            data-action="close"
            aria-label="Close"
          >×</button>
        </header>

        <div class="zx-ratio-fields">
          <label>
            Width
            <input
              type="number"
              id="zxCustomWidth"
              min="64"
              max="7680"
              value="1080"
            >
          </label>

          <label>
            Height
            <input
              type="number"
              id="zxCustomHeight"
              min="64"
              max="7680"
              value="1920"
            >
          </label>
        </div>

        <div class="zx-ratio-presets">
          <button type="button" data-preset="1080,1920">
            Portrait
          </button>

          <button type="button" data-preset="1920,1080">
            Landscape
          </button>

          <button type="button" data-preset="1080,1080">
            Square
          </button>

          <button type="button" data-preset="1080,1350">
            Instagram
          </button>
        </div>

        <div class="zx-ratio-preview">
          <span id="zxRatioPreviewText">1080 × 1920</span>
          <span id="zxRatioPreviewValue">9:16</span>
        </div>

        <footer class="zx-ratio-footer">
          <button
            type="button"
            data-action="close"
          >Cancel</button>

          <button
            type="button"
            data-action="apply"
          >Apply Canvas</button>
        </footer>
      </section>
    `;

    document.body.appendChild(this.dialog);

    this.widthInput =
      this.dialog.querySelector("#zxCustomWidth");

    this.heightInput =
      this.dialog.querySelector("#zxCustomHeight");

    this.bind();
    this.addStyles();
  }

  bind() {
    this.dialog.addEventListener("click", event => {
      const close = event.target.closest(
        '[data-action="close"]'
      );

      const apply = event.target.closest(
        '[data-action="apply"]'
      );

      const preset = event.target.closest("[data-preset]");

      if (close || event.target.classList.contains(
        "zx-ratio-backdrop"
      )) {
        this.hide();
      }

      if (apply) {
        this.apply();
      }

      if (preset) {
        this.setPreset(preset.dataset.preset);
      }
    });

    this.widthInput.addEventListener(
      "input",
      () => this.updatePreview()
    );

    this.heightInput.addEventListener(
      "input",
      () => this.updatePreview()
    );

    this.dialog.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        this.hide();
      }

      if (event.key === "Enter") {
        this.apply();
      }
    });
  }

  show(width = 1080, height = 1920) {
    this.widthInput.value = width;
    this.heightInput.value = height;

    this.updatePreview();

    this.dialog.classList.add("visible");
    this.widthInput.focus();
  }

  hide() {
    this.dialog.classList.remove("visible");
  }

  setPreset(value) {
    const [width, height] = value.split(",").map(Number);

    this.widthInput.value = width;
    this.heightInput.value = height;

    this.updatePreview();
  }

  updatePreview() {
    const width = Number(this.widthInput.value);
    const height = Number(this.heightInput.value);

    const text = this.dialog.querySelector(
      "#zxRatioPreviewText"
    );

    const ratioText = this.dialog.querySelector(
      "#zxRatioPreviewValue"
    );

    if (width <= 0 || height <= 0) {
      text.textContent = "Invalid dimensions";
      ratioText.textContent = "--";
      return;
    }

    const gcd = this.gcd(width, height);

    text.textContent = `${width} × ${height}`;

    ratioText.textContent =
      `${width / gcd}:${height / gcd}`;
  }

  gcd(a, b) {
    while (b !== 0) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }

    return a;
  }

  apply() {
    const width = Number(this.widthInput.value);
    const height = Number(this.heightInput.value);

    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 64 ||
      height < 64 ||
      width > 7680 ||
      height > 7680
    ) {
      notifications.warning(
        "Enter valid dimensions between 64 and 7680."
      );
      return false;
    }

    document.dispatchEvent(
      new CustomEvent("zerox:custom-ratio", {
        detail: { width, height }
      })
    );

    this.hide();

    return true;
  }

  addStyles() {
    if (document.querySelector("#zxRatioDialogStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "zxRatioDialogStyles";

    style.textContent = `
      .zx-custom-ratio {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 10000;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }

      .zx-custom-ratio.visible {
        display: flex;
      }

      .zx-ratio-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,.72);
        backdrop-filter: blur(9px);
      }

      .zx-ratio-card {
        position: relative;
        width: min(440px, 100%);
        padding: 22px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 20px;
        background: #111522;
        color: #fff;
        box-shadow: 0 20px 70px #0009;
      }

      .zx-ratio-header,
      .zx-ratio-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .zx-ratio-header h2 {
        margin: 0 0 5px;
        font-size: 20px;
      }

      .zx-ratio-header p {
        margin: 0;
        color: #9ca3b5;
        font-size: 13px;
      }

      .zx-ratio-close {
        font-size: 25px;
        background: transparent;
        color: white;
      }

      .zx-ratio-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin: 22px 0;
      }

      .zx-ratio-fields label {
        display: grid;
        gap: 8px;
        color: #b8bfd0;
        font-size: 13px;
      }

      .zx-ratio-fields input {
        width: 100%;
        min-width: 0;
        padding: 12px;
        border: 1px solid #343b50;
        border-radius: 10px;
        background: #090d18;
        color: white;
      }

      .zx-ratio-presets {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .zx-ratio-presets button,
      .zx-ratio-footer button {
        padding: 10px;
        border: 1px solid #343b50;
        border-radius: 9px;
        background: #1a2030;
        color: white;
      }

      .zx-ratio-preview {
        display: flex;
        justify-content: space-between;
        margin: 18px 0;
        padding: 14px;
        border-radius: 10px;
        background: #090d18;
        color: #45dfba;
      }

      .zx-ratio-footer button:last-child {
        background: #7866ed;
        border-color: #7866ed;
      }
    `;

    document.head.appendChild(style);
  }

  destroy() {
    this.dialog?.remove();
    this.dialog = null;
  }
}

export default CustomRatioDialog;
