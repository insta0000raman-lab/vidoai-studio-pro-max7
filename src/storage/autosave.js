import { database } from "./database.js";
import { eventBus } from "../core/event-bus.js";

export class AutosaveManager {
  constructor(options = {}) {
    this.options = {
      delay: options.delay ?? 1200,
      maxWait: options.maxWait ?? 10000,
      enabled: options.enabled ?? true,
      ...options
    };

    this.projectProvider = null;

    this.timer = null;
    this.maxWaitTimer = null;

    this.pending = false;
    this.saving = false;
    this.destroyed = false;

    this.lastSavedAt = null;
    this.lastError = null;
    this.revision = 0;
    this.savedRevision = 0;

    this.listeners = new Set();
    this.waiters = [];
  }

  setProjectProvider(provider) {
    if (typeof provider !== "function") {
      throw new Error(
        "Project provider must be a function."
      );
    }

    this.projectProvider = provider;
  }

  markDirty(reason = "project-changed") {
    if (this.destroyed || !this.options.enabled) {
      return false;
    }

    this.revision += 1;
    this.pending = true;

    this.emit("dirty", {
      revision: this.revision,
      reason
    });

    this.schedule();

    return true;
  }

  schedule() {
    if (this.destroyed || !this.options.enabled) {
      return;
    }

    clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.save().catch(error => {
        this.reportError(error);
      });
    }, this.options.delay);

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => {
        this.save().catch(error => {
          this.reportError(error);
        });
      }, this.options.maxWait);
    }
  }

  async save() {
    if (this.destroyed) {
      throw new Error("Autosave manager destroyed.");
    }

    if (!this.projectProvider) {
      throw new Error("Project provider not configured.");
    }

    if (this.saving) {
      return new Promise((resolve, reject) => {
        this.waiters.push({ resolve, reject });
      });
    }

    if (!this.pending) {
      return {
        saved: false,
        reason: "no-pending-changes"
      };
    }

    clearTimeout(this.timer);
    clearTimeout(this.maxWaitTimer);

    this.timer = null;
    this.maxWaitTimer = null;

    this.saving = true;

    const savingRevision = this.revision;

    try {
      const project = this.projectProvider();

      if (!project?.id) {
        throw new Error("No valid project to save.");
      }

      const snapshot = structuredClone(project);

      await database.saveProject(snapshot);

      this.lastSavedAt = Date.now();
      this.lastError = null;
      this.savedRevision = savingRevision;

      this.pending = this.revision > savingRevision;

      const result = {
        saved: true,
        projectId: snapshot.id,
        revision: savingRevision,
        savedAt: this.lastSavedAt
      };

      this.emit("saved", result);

      eventBus.emit("autosave:complete", result);

      this.resolveWaiters(result);

      if (this.pending) {
        this.schedule();
      }

      return result;
    } catch (error) {
      this.lastError = error;
      this.pending = true;

      this.emit("error", {
        message: error.message,
        revision: savingRevision
      });

      this.rejectWaiters(error);

      throw error;
    } finally {
      this.saving = false;
    }
  }

  async flush() {
    clearTimeout(this.timer);
    clearTimeout(this.maxWaitTimer);

    this.timer = null;
    this.maxWaitTimer = null;

    if (this.saving) {
      return new Promise((resolve, reject) => {
        this.waiters.push({ resolve, reject });
      });
    }

    if (!this.pending) {
      return {
        saved: false,
        reason: "already-saved"
      };
    }

    return this.save();
  }

  setEnabled(enabled) {
    this.options.enabled = Boolean(enabled);

    if (!this.options.enabled) {
      clearTimeout(this.timer);
      clearTimeout(this.maxWaitTimer);

      this.timer = null;
      this.maxWaitTimer = null;

      this.emit("disabled");
      return;
    }

    if (this.pending) {
      this.schedule();
    }

    this.emit("enabled");
  }

  updateDelay(milliseconds) {
    const delay = Number(milliseconds);

    if (!Number.isFinite(delay) || delay < 100) {
      throw new Error("Invalid autosave delay.");
    }

    this.options.delay = delay;

    if (this.pending) {
      this.schedule();
    }
  }

  getStatus() {
    return {
      enabled: this.options.enabled,
      pending: this.pending,
      saving: this.saving,
      revision: this.revision,
      savedRevision: this.savedRevision,
      lastSavedAt: this.lastSavedAt,
      lastError: this.lastError?.message || null
    };
  }

  reportError(error) {
    this.lastError = error;

    this.emit("error", {
      message: error.message
    });
  }

  resolveWaiters(result) {
    const waiters = this.waiters.splice(0);

    for (const waiter of waiters) {
      waiter.resolve(result);
    }
  }

  rejectWaiters(error) {
    const waiters = this.waiters.splice(0);

    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(type, detail = {}) {
    for (const callback of this.listeners) {
      callback({ type, detail });
    }
  }

  destroy() {
    clearTimeout(this.timer);
    clearTimeout(this.maxWaitTimer);

    this.timer = null;
    this.maxWaitTimer = null;
    this.destroyed = true;

    this.listeners.clear();

    this.rejectWaiters(
      new Error("Autosave manager destroyed.")
    );
  }
}

export const autosaveManager = new AutosaveManager();
