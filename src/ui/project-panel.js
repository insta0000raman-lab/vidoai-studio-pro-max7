import { projectManager } from "../project/project-manager.js";
import { database } from "../storage/database.js";
import { notifications } from "../core/notifications.js";
import { APP_CONFIG } from "../config.js";

export class ProjectPanel {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.querySelector('[data-panel-content="project"]');

    this.bind();
    this.render();
  }

  bind() {
    if (!this.container) return;

    this.container.addEventListener("click", event => {
      const button = event.target.closest("[data-project-action]");
      if (!button) return;

      const action = button.dataset.projectAction;

      if (action === "save") this.saveProject();
      if (action === "backup") this.createBackup();
      if (action === "export") this.exportProject();
      if (action === "import") this.importProject();
      if (action === "refresh") this.render();
    });

    this.container.addEventListener("change", event => {
      const input = event.target;

      if (input.dataset.projectSetting) {
        this.updateSetting(
          input.dataset.projectSetting,
          input.value
        );
      }
    });
  }

  getProject() {
    return projectManager.currentProject || null;
  }

  async saveProject() {
    try {
      const result = await projectManager.saveLocal();

      if (result === false) {
        throw new Error("Project could not be saved.");
      }

      notifications.success("Project saved.");
      this.setStatus("Saved successfully.");
    } catch (error) {
      notifications.error(error.message);
      this.setStatus("Save failed.");
    }
  }

  async createBackup() {
    const project = this.getProject();

    if (!project) {
      notifications.warning("No project is open.");
      return;
    }

    try {
      await database.createBackup(
        project.id,
        project
      );

      notifications.success("Project backup created.");
      this.setStatus("Backup created.");
    } catch (error) {
      notifications.error(
        `Backup failed: ${error.message}`
      );
    }
  }

  exportProject() {
    try {
      projectManager.exportCurrentProject();
      this.setStatus("Project export started.");
    } catch (error) {
      notifications.error(error.message);
    }
  }

  importProject() {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".zxm,.json,application/json";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];

      if (!file) return;

      try {
        await projectManager.importProjectFile(file);

        notifications.success("Project imported.");
        this.render();
      } catch (error) {
        notifications.error(
          `Import failed: ${error.message}`
        );
      }
    });

    input.click();
  }

  updateSetting(key, rawValue) {
    const project = this.getProject();

    if (!project) return;

    const numericSettings = [
      "width",
      "height",
      "fps"
    ];

    const value = numericSettings.includes(key)
      ? Number(rawValue)
      : rawValue;

    if (
      numericSettings.includes(key) &&
      (!Number.isFinite(value) || value <= 0)
    ) {
      notifications.warning("Enter a valid number.");
      this.render();
      return;
    }

    if (key === "width" || key === "height") {
      project.settings ||= {};
      project.settings[key] = value;
    } else if (key === "fps") {
      project.settings ||= {};
      project.settings.fps = value;
    } else {
      return;
    }

    project.updatedAt = Date.now();

    projectManager.scheduleAutosave?.();

    document.dispatchEvent(
      new CustomEvent("zerox:project-settings-changed", {
        detail: { key, value }
      })
    );

    this.setStatus("Settings updated.");
  }

  setStatus(message) {
    const status = this.container?.querySelector(
      "[data-project-status]"
    );

    if (status) status.textContent = message;
  }

  render() {
    if (!this.container) return;

    const project = this.getProject();

    this.container.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Project Settings";
    this.container.appendChild(heading);

    if (!project) {
      const empty = document.createElement("p");
      empty.className = "empty-message";
      empty.textContent = "No project is currently open.";
      this.container.appendChild(empty);
      return;
    }

    const settings = project.settings || {};

    const name = document.createElement("p");
    name.textContent = `Project: ${project.name || "Untitled"}`;
    this.container.appendChild(name);

    this.addNumberField(
      "Canvas Width",
      "width",
      settings.width ?? APP_CONFIG.DEFAULT_CANVAS.width
    );

    this.addNumberField(
      "Canvas Height",
      "height",
      settings.height ?? APP_CONFIG.DEFAULT_CANVAS.height
    );

    this.addNumberField(
      "Frame Rate",
      "fps",
      settings.fps ?? APP_CONFIG.DEFAULT_FPS
    );

    const actions = [
      ["save", "Save Project"],
      ["backup", "Create Backup"],
      ["export", "Export Project File"],
      ["import", "Import Project File"],
      ["refresh", "Refresh Settings"]
    ];

    const actionArea = document.createElement("div");
    actionArea.className = "project-actions";

    actions.forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.projectAction = action;
      button.textContent = label;
      actionArea.appendChild(button);
    });

    this.container.appendChild(actionArea);

    const status = document.createElement("p");
    status.dataset.projectStatus = "true";
    status.className = "project-status";
    status.textContent = "Project ready.";
    this.container.appendChild(status);
  }

  addNumberField(labelText, key, value) {
    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.value = value;
    input.dataset.projectSetting = key;

    label.appendChild(input);
    this.container.appendChild(label);
  }

  destroy() {
    this.container?.replaceChildren();
  }
}

export default ProjectPanel;
