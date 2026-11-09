import { textEngine } from "../text/text-engine.js";
import { projectManager } from "../project/project-manager.js";
import { trackManager } from "../timeline/tracks.js";
import { notifications } from "../core/notifications.js";

export class TextPanel {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.querySelector('[data-panel-content="text"]');

    this.selectedLayerId = null;
    this.bind();
    this.render();
  }

  bind() {
    if (!this.container) return;

    this.container.addEventListener("click", event => {
      const button = event.target.closest("[data-text-action]");

      if (!button) return;

      const action = button.dataset.textAction;

      if (action === "add") this.addText();
      if (action === "duplicate") this.duplicateText();
      if (action === "delete") this.deleteText();
      if (action === "apply") this.applyChanges();
    });

    this.container.addEventListener("change", event => {
      if (event.target.matches("[data-text-field]")) {
        this.applyChanges();
      }
    });

    this.container.addEventListener("input", event => {
      if (event.target.matches("[data-text-field]")) {
        this.updatePreview();
      }
    });
  }

  getLayers() {
    const project = projectManager.currentProject;

    if (!project) return [];

    return (project.tracks || [])
      .filter(track => track.type === "text")
      .flatMap(track => track.clips || []);
  }

  getSelectedLayer() {
    return this.getLayers().find(
      layer => layer.id === this.selectedLayerId
    );
  }

  ensureTextTrack() {
    const project = projectManager.currentProject;

    if (!project) {
      throw new Error("Create a project first.");
    }

    let track = project.tracks.find(
      item => item.type === "text"
    );

    if (!track) {
      track = trackManager.createTextTrack("Text 1");
    }

    return track;
  }

  addText() {
    try {
      this.ensureTextTrack();

      const layer = textEngine.createLayer({
        text: "Your Text",
        name: "Text Layer",
        start: 0,
        duration: 5,
        style: {
          fontFamily: "Arial",
          fontSize: 64,
          color: "#ffffff",
          align: "center"
        }
      });

      this.selectedLayerId = layer.id;
      this.render();

      notifications.success("Text layer added.");

    } catch (error) {
      notifications.error(error.message);
    }
  }

  selectLayer(layerId) {
    this.selectedLayerId = layerId;
    this.render();
  }

  duplicateText() {
    const layer = this.getSelectedLayer();

    if (!layer) return;

    try {
      const duplicate = textEngine.duplicateLayer(layer.id);

      this.selectedLayerId = duplicate.id;
      this.render();

    } catch (error) {
      notifications.error(error.message);
    }
  }

  deleteText() {
    const layer = this.getSelectedLayer();

    if (!layer) return;

    try {
      textEngine.deleteLayer(layer.id);
      this.selectedLayerId = null;
      this.render();

    } catch (error) {
      notifications.error(error.message);
    }
  }

  readFields() {
    const result = {};

    this.container
      .querySelectorAll("[data-text-field]")
      .forEach(input => {
        const key = input.dataset.textField;

        if (input.type === "number") {
          result[key] = Number(input.value);
        } else {
          result[key] = input.value;
        }
      });

    return result;
  }

  applyChanges() {
    const layer = this.getSelectedLayer();

    if (!layer) return;

    const values = this.readFields();

    try {
      textEngine.updateLayer(layer.id, {
        text: values.text,
        style: {
          fontFamily: values.fontFamily,
          fontSize: values.fontSize,
          color: values.color,
          align: values.align
        },
        start: values.start,
        duration: values.duration
      });

    } catch (error) {
      notifications.error(error.message);
    }
  }

  updatePreview() {
    const layer = this.getSelectedLayer();

    if (!layer) return;

    const values = this.readFields();

    document.dispatchEvent(
      new CustomEvent("zerox:text-preview-update", {
        detail: {
          layerId: layer.id,
          values
        }
      })
    );
  }

  render() {
    if (!this.container) return;

    const layers = this.getLayers();
    const selected = this.getSelectedLayer();

    this.container.innerHTML = `
      <section class="panel-section">
        <div class="panel-heading">
          <h3>Text Studio</h3>
          <button data-text-action="add">+ Add Text</button>
        </div>

        <div class="text-layer-list">
          ${layers.map(layer => `
            <button
              class="text-layer-item ${
                layer.id === this.selectedLayerId ? "active" : ""
              }"
              data-layer-select="${layer.id}">
              ${this.escapeHTML(layer.name || layer.text || "Text")}
            </button>
          `).join("")}
        </div>

        ${
          selected
            ? this.renderInspector(selected)
            : `<p class="empty-message">Select or add a text layer.</p>`
        }
      </section>
    `;

    this.container
      .querySelectorAll("[data-layer-select]")
      .forEach(button => {
        button.addEventListener("click", () => {
          this.selectLayer(button.dataset.layerSelect);
        });
      });
  }

  renderInspector(layer) {
    const style = layer.style || {};

    return `
      <div class="text-inspector">
        <label>Text</label>
        <textarea data-text-field="text">${this.escapeHTML(layer.text || "")}</textarea>

        <label>Font</label>
        <select data-text-field="fontFamily">
          ${["Arial", "Roboto", "Georgia", "Impact", "Verdana"].map(font => `
            <option value="${font}" ${
              style.fontFamily === font ? "selected" : ""
            }>${font}</option>
          `).join("")}
        </select>

        <label>Font Size</label>
        <input
          type="number"
          min="8"
          max="500"
          data-text-field="fontSize"
          value="${Number(style.fontSize || 64)}">

        <label>Color</label>
        <input
          type="color"
          data-text-field="color"
          value="${this.safeColor(style.color)}">

        <label>Alignment</label>
        <select data-text-field="align">
          <option value="left" ${style.align === "left" ? "selected" : ""}>Left</option>
          <option value="center" ${!style.align || style.align === "center" ? "selected" : ""}>Center</option>
          <option value="right" ${style.align === "right" ? "selected" : ""}>Right</option>
        </select>

        <label>Start (seconds)</label>
        <input type="number" min="0" step="0.1"
          data-text-field="start" value="${Number(layer.start || 0)}">

        <label>Duration (seconds)</label>
        <input type="number" min="0.1" step="0.1"
          data-text-field="duration" value="${Number(layer.duration || 5)}">

        <div class="text-actions">
          <button data-text-action="duplicate">Duplicate</button>
          <button data-text-action="apply">Apply</button>
          <button data-text-action="delete">Delete</button>
        </div>
      </div>
    `;
  }

  safeColor(color) {
    return /^#[0-9a-f]{6}$/i.test(color || "")
      ? color
      : "#ffffff";
  }

  escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  destroy() {
    this.container?.replaceChildren();
  }
}

export default TextPanel;
