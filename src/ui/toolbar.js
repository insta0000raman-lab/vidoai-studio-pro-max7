import { history } from "../core/history.js";
import { projectManager } from "../project/project-manager.js";
import { notifications } from "../core/notifications.js";
import { store } from "../core/state-store.js";

export class Toolbar {
  constructor(options = {}) {
    this.container =
      options.container || document.querySelector(".topbar");

    this.playButton = document.querySelector("#playButton");
    this.saveButton = document.querySelector("#saveProjectButton");
    this.exportButton = document.querySelector("#exportButton");
    this.undoButton = document.querySelector("#undoButton");
    this.redoButton = document.querySelector("#redoButton");

    this.playback = options.playback || null;
    this.exportController = options.exportController || null;

    this.bind();
    this.update();
  }

  bind() {
    this.undoButton?.addEventListener("click", () => {
      this.undo();
    });

    this.redoButton?.addEventListener("click", () => {
      this.redo();
    });

    this.saveButton?.addEventListener("click", () => {
      this.save();
    });

    this.playButton?.addEventListener("click", () => {
      this.togglePlayback();
    });

    this.exportButton?.addEventListener("click", () => {
      this.openExport();
    });

    this.projectNameInput =
      document.querySelector("#projectName");

    this.projectNameInput?.addEventListener("change", () => {
      this.renameProject(this.projectNameInput.value);
    });

    this.unsubscribe = store.subscribe(() => {
      this.update();
    });
  }

  undo() {
    try {
      const result = history.undo();

      if (result === false) {
        notifications.info("Nothing to undo.");
      }

      this.update();
    } catch (error) {
      notifications.error(`Undo failed: ${error.message}`);
    }
  }

  redo() {
    try {
      const result = history.redo();

      if (result === false) {
        notifications.info("Nothing to redo.");
      }

      this.update();
    } catch (error) {
      notifications.error(`Redo failed: ${error.message}`);
    }
  }

  async save() {
    try {
      const result = await projectManager.saveLocal();

      if (result === false) {
        throw new Error("Project save failed.");
      }

      notifications.success("Project saved.");
    } catch (error) {
      notifications.error(error.message);
    }
  }

  async togglePlayback() {
    if (!this.playback) {
      notifications.warning("Playback controller is not connected.");
      return;
    }

    try {
      const playing = store.getState()?.isPlaying;

      if (playing) {
        this.playback.pause();
      } else {
        this.playback.play();
      }

      this.update();
    } catch (error) {
      notifications.error(
        `Playback error: ${error.message}`
      );
    }
  }

  openExport() {
    if (this.exportController?.open) {
      this.exportController.open();
      return;
    }

    const dialog = document.querySelector("#exportDialog");

    if (dialog?.showModal) {
      dialog.showModal();
    } else if (dialog) {
      dialog.setAttribute("open", "");
    } else {
      notifications.warning("Export dialog is unavailable.");
    }
  }

  renameProject(name) {
    const cleanName = String(name || "").trim();

    if (!cleanName) {
      notifications.warning("Project name cannot be empty.");
      this.updateProjectName();
      return;
    }

    try {
      projectManager.renameProject(cleanName);
      notifications.success("Project renamed.");
    } catch (error) {
      notifications.error(error.message);
      this.updateProjectName();
    }
  }

  updateProjectName() {
    const project = projectManager.currentProject;

    if (this.projectNameInput && project) {
      this.projectNameInput.value =
        project.name || "Untitled Project";
    }
  }

  update() {
    const state = store.getState() || {};
    const project = projectManager.currentProject;

    if (this.playButton) {
      this.playButton.textContent =
        state.isPlaying ? "Pause" : "Play";
    }

    if (this.undoButton) {
      this.undoButton.disabled = !history.canUndo?.();
    }

    if (this.redoButton) {
      this.redoButton.disabled = !history.canRedo?.();
    }

    if (this.saveButton) {
      this.saveButton.disabled = !project;
    }

    if (this.exportButton) {
      this.exportButton.disabled = !project;
    }

    this.updateProjectName();
  }

  destroy() {
    this.unsubscribe?.();
  }
}

export default Toolbar;
