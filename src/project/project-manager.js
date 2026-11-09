import {
  createProject,
  touchProject,
  parseProject
} from "./schema.js";

import {
  exportProject,
  downloadProject,
  importProject,
  createProjectFileName
} from "./serializer.js";

import { store } from "../core/state-store.js";
import { eventBus } from "../core/event-bus.js";
import { notifications } from "../core/notifications.js";
import { APP_CONFIG } from "../config.js";

const STORAGE_KEY = "zero-x-motion-current-project";

class ProjectManager {
  constructor() {
    this.currentProject = null;
    this.isDirty = false;
    this.lastSavedAt = null;
    this.saveTimer = null;
    this.autosaveDelay = 1200;
    this.listeners = new Set();
  }

  getCurrent() {
    return this.currentProject;
  }

  getStatus() {
    return {
      project: this.currentProject,
      isDirty: this.isDirty,
      lastSavedAt: this.lastSavedAt
    };
  }

  subscribe(callback) {
    if (typeof callback !== "function") return () => {};

    this.listeners.add(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  notify() {
    const status = this.getStatus();

    this.listeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error("Project listener error:", error);
      }
    });

    eventBus.emit("project:status-changed", status);
  }

  createNewProject(name = "Untitled Project", options = {}) {
    this.cancelAutosave();

    const project = createProject({
      name,
      ...options
    });

    this.currentProject = project;
    this.isDirty = true;
    this.lastSavedAt = null;

    store.setProject(project);

    this.notify();

    eventBus.emit("project:created", project);

    this.scheduleAutosave();

    notifications.success("New project created");

    return project;
  }

  setProject(project, options = {}) {
    if (!project || typeof project !== "object") {
      throw new Error("Invalid project data");
    }

    this.cancelAutosave();

    this.currentProject = project;
    this.isDirty = Boolean(options.dirty);

    store.setProject(project);

    this.notify();

    eventBus.emit("project:loaded", project);

    if (this.isDirty) {
      this.scheduleAutosave();
    }

    return project;
  }

  renameProject(name) {
    if (!this.currentProject) {
      throw new Error("No project is currently open");
    }

    const cleanName = String(name || "").trim();

    if (!cleanName) {
      throw new Error("Project name cannot be empty");
    }

    this.currentProject.name = cleanName;

    touchProject(this.currentProject);

    this.markDirty();

    eventBus.emit("project:renamed", {
      project: this.currentProject,
      name: cleanName
    });

    return cleanName;
  }

  updateProject(updater) {
    if (!this.currentProject) {
      throw new Error("No project is currently open");
    }

    if (typeof updater !== "function") {
      throw new Error("Updater must be a function");
    }

    const result = updater(this.currentProject);

    if (result && typeof result === "object") {
      this.currentProject = result;
    }

    touchProject(this.currentProject);

    store.setProject(this.currentProject);

    this.markDirty();

    eventBus.emit("project:updated", this.currentProject);

    return this.currentProject;
  }

  markDirty() {
    if (!this.currentProject) return;

    this.isDirty = true;

    this.notify();

    this.scheduleAutosave();
  }

  markClean() {
    this.isDirty = false;
    this.lastSavedAt = Date.now();

    this.notify();
  }

  scheduleAutosave() {
    if (!this.currentProject) return;

    this.cancelAutosave();

    this.saveTimer = setTimeout(() => {
      this.saveLocal().catch(error => {
        console.error("Autosave failed:", error);

        notifications.warning(
          "Autosave failed. Your changes may not be saved."
        );
      });
    }, this.autosaveDelay);
  }

  cancelAutosave() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  async saveLocal() {
    if (!this.currentProject) {
      throw new Error("No project to save");
    }

    const snapshot = exportProject(this.currentProject);

    try {
      localStorage.setItem(STORAGE_KEY, snapshot);

      this.markClean();

      eventBus.emit("project:saved-local", {
        project: this.currentProject,
        savedAt: this.lastSavedAt
      });

      return true;
    } catch (error) {
      console.error("Local save error:", error);

      throw new Error(
        "Browser storage is unavailable or full"
      );
    }
  }

  async restoreLocal() {
    let raw;

    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.error("Storage read error:", error);
      return null;
    }

    if (!raw) return null;

    try {
      const project = parseProject(raw);

      this.setProject(project, {
        dirty: false
      });

      this.lastSavedAt = Date.now();

      this.notify();

      eventBus.emit("project:restored", project);

      return project;
    } catch (error) {
      console.error("Project restore error:", error);

      notifications.error(
        "Saved project could not be restored"
      );

      return null;
    }
  }

  exportCurrentProject() {
    if (!this.currentProject) {
      throw new Error("No project to export");
    }

    const data = exportProject(this.currentProject);

    const fileName = createProjectFileName(
      this.currentProject.name
    );

    const blob = new Blob(
      [data],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    eventBus.emit("project:exported", {
      name: fileName
    });

    return fileName;
  }

  async importProjectFile(file) {
    if (!file) {
      throw new Error("No project file selected");
    }

    const imported = await importProject(file);

    this.setProject(imported, {
      dirty: false
    });

    this.lastSavedAt = Date.now();

    this.notify();

    eventBus.emit("project:imported", imported);

    notifications.success("Project imported");

    return imported;
  }

  async duplicateProject() {
    if (!this.currentProject) {
      throw new Error("No project to duplicate");
    }

    const copy = parseProject(
      exportProject(this.currentProject)
    );

    copy.id = crypto.randomUUID
      ? crypto.randomUUID()
      : `project-${Date.now()}`;

    copy.name = `${this.currentProject.name} Copy`;

    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;

    this.setProject(copy, {
      dirty: true
    });

    notifications.success("Project duplicated");

    return copy;
  }

  async closeProject(options = {}) {
    if (!this.currentProject) return true;

    if (this.isDirty && options.save !== false) {
      await this.saveLocal();
    }

    this.cancelAutosave();

    const oldProject = this.currentProject;

    this.currentProject = null;
    this.isDirty = false;
    this.lastSavedAt = null;

    store.setProject(null);

    this.notify();

    eventBus.emit("project:closed", oldProject);

    return true;
  }

  async deleteLocalProject() {
    this.cancelAutosave();

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      throw new Error("Could not delete local project");
    }

    eventBus.emit("project:deleted-local");

    return true;
  }

  getProjectName() {
    return this.currentProject
      ? this.currentProject.name
      : "No Project";
  }

  getProjectDuration() {
    if (!this.currentProject) return 0;

    return Number(
      this.currentProject.duration ||
      this.currentProject.settings?.duration ||
      0
    );
  }

  getProjectFPS() {
    if (!this.currentProject) {
      return APP_CONFIG?.defaultFPS || 30;
    }

    return Number(
      this.currentProject.fps ||
      this.currentProject.settings?.fps ||
      APP_CONFIG?.defaultFPS ||
      30
    );
  }

  getProjectSize() {
    if (!this.currentProject) {
      return {
        width: 1080,
        height: 1920
      };
    }

    const settings = this.currentProject.settings || {};

    return {
      width: Number(
        this.currentProject.width || settings.width || 1080
      ),
      height: Number(
        this.currentProject.height || settings.height || 1920
      )
    };
  }

  destroy() {
    this.cancelAutosave();
    this.listeners.clear();
  }
}

export const projectManager = new ProjectManager();
