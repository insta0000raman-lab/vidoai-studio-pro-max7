import { notifications } from "../core/notifications.js";
import { autoFrameEngine } from "../ai/autoframe.js";
import { objectDetector } from "../ai/object-detection.js";
import { sceneDetector } from "../ai/scene-detection.js";
import { projectManager } from "../project/project-manager.js";

export class AIPanel {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.querySelector('[data-panel-content="ai"]');

    this.selectedObject = "person";
    this.trackingMode = "continuous";
    this.targetRatio = "9:16";
    this.running = false;

    this.bind();
    this.render();
  }

  bind() {
    if (!this.container) return;

    this.container.addEventListener("click", event => {
      const button = event.target.closest("[data-ai-action]");

      if (!button) return;

      const action = button.dataset.aiAction;

      if (action === "autoframe") {
        this.runAutoFrame();
      }

      if (action === "frame-cut") {
        this.runFrameWithCut();
      }

      if (action === "cancel") {
        this.cancel();
      }

      if (action === "reset") {
        this.resetFraming();
      }
    });

    this.container.addEventListener("change", event => {
      if (event.target.matches("[data-ai-setting]")) {
        this.updateSetting(
          event.target.dataset.aiSetting,
          event.target.value
        );
      }
    });
  }

  updateSetting(key, value) {
    if (key === "object") {
      this.selectedObject = value;
    }

    if (key === "ratio") {
      this.targetRatio = value;
    }

    if (key === "mode") {
      this.trackingMode = value;
    }
  }

  getSelectedVideo() {
    const project = projectManager.currentProject;

    if (!project) return null;

    const selectedId = project.selectedClipId;

    for (const track of project.tracks || []) {
      const clip = (track.clips || []).find(
        item => item.id === selectedId
      );

      if (clip && clip.type === "video") {
        return clip;
      }
    }

    return null;
  }

  async runAutoFrame() {
    if (this.running) return;

    const clip = this.getSelectedVideo();

    if (!clip) {
      notifications.warning("Select a video clip first.");
      return;
    }

    this.running = true;
    this.setStatus("Preparing AutoFrame...");

    try {
      const event = new CustomEvent("zerox:ai-autoframe-request", {
        detail: {
          clip,
          object: this.selectedObject,
          ratio: this.targetRatio,
          mode: this.trackingMode
        }
      });

      document.dispatchEvent(event);

      const result = await autoFrameEngine.process({
        clip,
        target: this.selectedObject,
        ratio: this.targetRatio,
        mode: this.trackingMode
      });

      if (!result) {
        throw new Error("AutoFrame returned no result.");
      }

      document.dispatchEvent(
        new CustomEvent("zerox:ai-autoframe-result", {
          detail: { clipId: clip.id, result }
        })
      );

      this.setStatus("AutoFrame analysis completed.");
      notifications.success("AutoFrame completed.");

    } catch (error) {
      this.setStatus(error.message);
      notifications.error(error.message);

    } finally {
      this.running = false;
    }
  }

  async runFrameWithCut() {
    if (this.running) return;

    const clip = this.getSelectedVideo();

    if (!clip) {
      notifications.warning("Select a video clip first.");
      return;
    }

    this.running = true;
    this.setStatus("Analyzing scene changes...");

    try {
      const request = {
        clip,
        object: this.selectedObject,
        ratio: this.targetRatio,
        mode: "per-scene",
        continuousKeyframes: false
      };

      const event = new CustomEvent(
        "zerox:ai-frame-cut-request",
        { detail: request }
      );

      document.dispatchEvent(event);

      const result = await sceneDetector.analyzeForFraming(
        request
      );

      if (!result?.scenes) {
        throw new Error(
          "Scene framing analysis is not connected."
        );
      }

      document.dispatchEvent(
        new CustomEvent("zerox:ai-frame-cut-result", {
          detail: {
            clipId: clip.id,
            scenes: result.scenes,
            cuts: result.cuts || []
          }
        })
      );

      this.setStatus(
        `${result.scenes.length} scene(s) analyzed.`
      );

      notifications.success("Frame with Cut completed.");

    } catch (error) {
      this.setStatus(error.message);
      notifications.error(error.message);

    } finally {
      this.running = false;
    }
  }

  resetFraming() {
    const clip = this.getSelectedVideo();

    if (!clip) return;

    document.dispatchEvent(
      new CustomEvent("zerox:ai-reset-framing", {
        detail: { clipId: clip.id }
      })
    );

    this.setStatus("Manual framing reset requested.");
  }

  cancel() {
    if (!this.running) return;

    document.dispatchEvent(
      new CustomEvent("zerox:ai-cancel", {
        detail: { clip: this.getSelectedVideo() }
      })
    );

    this.setStatus("Cancellation requested.");
  }

  setStatus(message) {
    const status = this.container?.querySelector(
      "[data-ai-status]"
    );

    if (status) status.textContent = message;
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <section class="panel-section">
        <h3>ZERO X AI Studio</h3>

        <div class="ai-tool-card">
          <h4>AutoFrame</h4>
          <p>Automatically frame a selected object.</p>

          <label>Target Object</label>
          <select data-ai-setting="object">
            <option value="person">Person</option>
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
            <option value="car">Car</option>
            <option value="cow">Cow</option>
            <option value="buffalo">Buffalo</option>
            <option value="hand">Hand</option>
            <option value="bottle">Bottle</option>
            <option value="custom">Custom Object</option>
          </select>

          <label>Output Ratio</label>
          <select data-ai-setting="ratio">
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="1:1">1:1</option>
            <option value="4:5">4:5</option>
          </select>

          <label>Tracking Mode</label>
          <select data-ai-setting="mode">
            <option value="continuous">Continuous Tracking</option>
            <option value="per-scene">Separate Scenes</option>
          </select>

          <button data-ai-action="autoframe">
            Run AutoFrame
          </button>
        </div>

        <div class="ai-tool-card">
          <h4>Frame with Cut</h4>
          <p>
            Analyze scene changes and calculate separate
            framing for each scene.
          </p>

          <button data-ai-action="frame-cut">
            Analyze & Frame Scenes
          </button>
        </div>

        <div class="ai-tool-card">
          <h4>Manual Control</h4>
          <button data-ai-action="reset">
            Reset Framing
          </button>
        </div>

        <button
          data-ai-action="cancel"
          ${this.running ? "" : "disabled"}>
          Cancel Analysis
        </button>

        <p data-ai-status class="ai-status">
          AI engine status: waiting
        </p>
      </section>
    `;

    this.container.querySelector(
      '[data-ai-setting="object"]'
    ).value = this.selectedObject;

    this.container.querySelector(
      '[data-ai-setting="ratio"]'
    ).value = this.targetRatio;

    this.container.querySelector(
      '[data-ai-setting="mode"]'
    ).value = this.trackingMode;
  }

  destroy() {
    this.container?.replaceChildren();
  }
}

export default AIPanel;
