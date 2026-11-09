import { APP_CONFIG, APP_EVENTS } from "./config.js";

import { eventBus } from "./core/event-bus.js";
import { store } from "./core/state-store.js";
import { history } from "./core/history.js";
import { notifications } from "./core/notifications.js";
import { commandSystem } from "./core/command-system.js";

import { projectManager } from "./project/project-manager.js";

import { panelManager } from "./ui/panels.js";
import { inspectorManager } from "./ui/inspector.js";
import { dialogManager } from "./ui/dialogs.js";
import { notificationUI } from "./ui/notifications.js";
import { shortcutManager } from "./ui/shortcuts.js";

export class ZeroXMotionApp {
  constructor(options = {}) {
    this.config = APP_CONFIG;
    this.options = options;
    this.initialized = false;
    this.destroyed = false;
    this.modules = [];
    this.unsubscribers = [];
    this.startTime = null;

    this.status = {
      ready: false,
      projectLoaded: false,
      errors: []
    };
  }

  registerModule(name, instance) {
    this.modules.push({ name, instance });
    return instance;
  }

  async init() {
    if (this.initialized) return this;

    if (this.destroyed) {
      throw new Error("Application has been destroyed");
    }

    this.startTime = Date.now();

    try {
      this.setEngineStatus("Starting editor...");

      this.registerModule(
        "notifications",
        notificationUI.init()
      );

      this.registerModule(
        "dialogs",
        dialogManager.init()
      );

      this.registerModule(
        "panels",
        panelManager.init()
      );

      this.registerModule(
        "inspector",
        inspectorManager.init()
      );

      this.registerModule(
        "shortcuts",
        shortcutManager.init()
      );

      this.bindApplicationEvents();

      await this.restorePreviousProject();

      this.initialized = true;

      this.status.ready = true;

      this.setEngineStatus("Editor ready");

      eventBus.emit("APP_READY", {
        name: this.config.name,
        version: this.config.version,
        startupTime: Date.now() - this.startTime
      });

      notifications.success(
        "ZERO X MOTION is ready"
      );

      return this;
    } catch (error) {
      this.status.errors.push(error.message);

      this.setEngineStatus("Startup failed");

      notifications.error(
        "Editor startup failed: " + error.message
      );

      this.destroyModules();

      throw error;
    }
  }

  bindApplicationEvents() {
    const onSaveRequested = async () => {
      try {
        await projectManager.saveLocal();

        notifications.success("Project saved");
      } catch (error) {
        notifications.error(
          "Save failed: " + error.message
        );
      }
    };

    const onProjectUpdated = () => {
      this.status.projectLoaded =
        Boolean(projectManager.currentProject);

      this.updateProjectStatus();
    };

    eventBus.on(
      "PROJECT_SAVE_REQUESTED",
      onSaveRequested
    );

    eventBus.on(
      APP_EVENTS.PROJECT_UPDATED,
      onProjectUpdated
    );

    this.unsubscribers.push(() => {
      eventBus.off(
        "PROJECT_SAVE_REQUESTED",
        onSaveRequested
      );

      eventBus.off(
        APP_EVENTS.PROJECT_UPDATED,
        onProjectUpdated
      );
    });
  }

  async restorePreviousProject() {
    try {
      const restored = await projectManager.restoreLocal();

      this.status.projectLoaded = Boolean(restored);

      if (restored) {
        notifications.info(
          "Previous project restored"
        );
      }

      return restored;
    } catch (error) {
      this.status.projectLoaded = false;

      console.warn(
        "Previous project could not be restored:",
        error
      );

      return null;
    }
  }

  updateProjectStatus() {
    const project = projectManager.currentProject;

    const element = document.querySelector(
      "#projectStatus"
    );

    if (!element) return;

    element.textContent = project
      ? `Project: ${project.name || "Untitled"}`
      : "No project open";
  }

  setEngineStatus(message) {
    const element = document.querySelector(
      "#engineStatus"
    );

    if (element) {
      element.textContent = message;
    }

    eventBus.emit("ENGINE_STATUS_CHANGED", {
      message
    });
  }

  getStatus() {
    return {
      ...this.status,
      initialized: this.initialized,
      destroyed: this.destroyed,
      moduleCount: this.modules.length,
      startupTime: this.startTime
        ? Date.now() - this.startTime
        : 0
    };
  }

  destroyModules() {
    for (const module of [...this.modules].reverse()) {
      try {
        module.instance?.destroy?.();
      } catch (error) {
        console.error(
          `Failed to destroy ${module.name}:`,
          error
        );
      }
    }

    this.modules = [];
  }

  destroy() {
    if (this.destroyed) return;

    for (const unsubscribe of this.unsubscribers) {
      try {
        unsubscribe();
      } catch (error) {
        console.error(error);
      }
    }

    this.unsubscribers = [];

    this.destroyModules();

    this.initialized = false;
    this.destroyed = true;
    this.status.ready = false;

    eventBus.emit("APP_DESTROYED", {
      timestamp: Date.now()
    });
  }
}

export const app = new ZeroXMotionApp();

export default app;
