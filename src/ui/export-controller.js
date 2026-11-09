import { exportManager } from "../export/export-manager.js";
import { notifications } from "../core/notifications.js";

export class ExportController {
  constructor(options = {}) {
    this.manager = options.manager || exportManager;
    this.renderer = options.renderer || null;

    this.dialog = document.getElementById("exportDialog");
    this.openButton = document.getElementById("exportButton");
    this.startButton = document.getElementById("startExportButton");
    this.progressBar = document.getElementById("exportProgressBar");
    this.progressText = document.getElementById("exportProgressText");
    this.capabilityText = document.getElementById("exportCapability");

    this.resolution = document.getElementById("exportResolution");
    this.fps = document.getElementById("exportFps");
    this.format = document.getElementById("exportFormat");

    this.unsubscribe = null;
    this.busy = false;

    this.bind();
  }

  bind() {
    this.openButton?.addEventListener("click", () => {
      this.open();
    });

    this.startButton?.addEventListener("click", () => {
      this.start();
    });

    this.dialog?.addEventListener("click", event => {
      if (event.target === this.dialog) {
        this.close();
      }
    });

    this.unsubscribe = this.manager.subscribe(event => {
      this.handleEvent(event);
    });
  }

  async open() {
    if (!this.dialog) return;

    this.dialog.showModal?.();

    if (!this.dialog.open) {
      this.dialog.setAttribute("open", "");
    }

    await this.checkCapabilities();
  }

  close() {
    if (!this.dialog || this.busy) return;

    if (this.dialog.close) {
      this.dialog.close();
    } else {
      this.dialog.removeAttribute("open");
    }
  }

  readSettings() {
    const resolution = this.resolution?.value || "1080";

    const dimensions = {
      "720": [720, 1280],
      "1080": [1080, 1920],
      "1440": [1440, 2560],
      "2160": [2160, 3840]
    };

    const [width, height] =
      dimensions[resolution] || dimensions["1080"];

    return {
      width,
      height,
      fps: Number(this.fps?.value || 30),
      format: this.format?.value || "mp4"
    };
  }

  async checkCapabilities() {
    if (!this.capabilityText) return;

    this.capabilityText.textContent =
      "Checking export support...";

    try {
      const capabilities =
        await this.manager.checkCapabilities();

      if (capabilities.primaryExportAvailable) {
        this.capabilityText.textContent =
          "WebCodecs export engine available.";
      } else if (capabilities.fallbackExportAvailable) {
        this.capabilityText.textContent =
          "FFmpeg fallback available.";
      } else {
        this.capabilityText.textContent =
          "No export engine connected yet.";
      }
    } catch (error) {
      this.capabilityText.textContent = error.message;
    }
  }

  async start() {
    if (this.busy) return;

    if (!this.renderer) {
      notifications.error(
        "Export renderer is not connected yet."
      );
      return;
    }

    this.busy = true;

    if (this.startButton) {
      this.startButton.disabled = true;
      this.startButton.textContent = "Exporting...";
    }

    this.setProgress(0, "Preparing export...");

    try {
      this.manager.setDependencies({
        renderer: this.renderer
      });

      const result = await this.manager.start({
        settings: this.readSettings()
      });

      this.setProgress(100, "Export complete.");

      this.manager.download(
        result.blob,
        result.filename
      );

      notifications.success("Video export finished.");
      this.close();

    } catch (error) {
      this.setProgress(0, error.message);
      notifications.error(error.message);

    } finally {
      this.busy = false;

      if (this.startButton) {
        this.startButton.disabled = false;
        this.startButton.textContent = "Start Export";
      }
    }
  }

  handleEvent(event) {
    if (event.type === "progress") {
      this.setProgress(
        event.percentage,
        `${event.stage || "Exporting"} — ${event.percentage}%`
      );
    }

    if (event.type === "stage") {
      this.setProgress(
        this.manager.getStatus().job?.progress * 100 || 0,
        event.stage
      );
    }

    if (event.type === "error") {
      this.setProgress(0, event.message);
    }

    if (event.type === "cancelled") {
      this.setProgress(0, "Export cancelled.");
    }
  }

  setProgress(value, message) {
    const percentage = Math.max(
      0,
      Math.min(100, Number(value) || 0)
    );

    if (this.progressBar) {
      this.progressBar.style.width = `${percentage}%`;
    }

    if (this.progressText) {
      this.progressText.textContent = message;
    }
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

export default ExportController;
