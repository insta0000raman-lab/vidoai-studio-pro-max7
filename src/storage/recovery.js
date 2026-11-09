import { database } from "./database.js";
import { createId, parseProject } from "../project/schema.js";
import { migrateProject } from "../project/migrations.js";
import { validateSafely } from "../core/validation.js";
import { eventBus } from "../core/event-bus.js";
import { notifications } from "../core/notifications.js";

export class RecoveryManager {
  constructor(options = {}) {
    this.db = options.database || database;
    this.getProject = options.getProject || (() => null);
    this.restoreProject = options.restoreProject || (() => {});
    this.maxBackups = options.maxBackups || 10;
    this.listeners = new Set();
    this.recovering = false;
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Recovery listener must be a function");
    }

    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(type, data = {}) {
    const event = {
      type,
      data,
      timestamp: Date.now()
    };

    for (const callback of this.listeners) {
      try {
        callback(event);
      } catch (error) {
        console.error("Recovery listener error:", error);
      }
    }

    eventBus.emit("RECOVERY_UPDATED", event);
  }

  async createSnapshot(project = this.getProject(), reason = "manual") {
    if (!project) {
      throw new Error("No project available for backup");
    }

    const snapshot = {
      id: createId("backup"),
      projectId: project.id,
      projectName: project.name || "Untitled Project",
      reason,
      createdAt: Date.now(),
      schemaVersion: project.schemaVersion || 1,
      project: JSON.parse(JSON.stringify(project))
    };

    await this.db.createBackup(snapshot);

    await this.trimBackups(project.id);

    this.emit("snapshot-created", {
      id: snapshot.id,
      projectId: snapshot.projectId,
      reason
    });

    return snapshot;
  }

  async trimBackups(projectId) {
    const backups = await this.db.listBackups(projectId);

    if (!Array.isArray(backups)) return;

    const sorted = [...backups].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );

    const oldBackups = sorted.slice(this.maxBackups);

    for (const backup of oldBackups) {
      await this.db.deleteBackup(backup.id);
    }
  }

  async listBackups(projectId = null) {
    const backups = await this.db.listBackups(projectId);

    if (!Array.isArray(backups)) return [];

    return backups
      .filter(item => item && item.project)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map(item => ({
        id: item.id,
        projectId: item.projectId,
        projectName: item.projectName || "Untitled Project",
        reason: item.reason || "unknown",
        createdAt: item.createdAt || 0,
        schemaVersion: item.schemaVersion || 1
      }));
  }

  async getBackup(backupId) {
    if (!backupId) {
      throw new Error("Backup ID is required");
    }

    const backups = await this.db.listBackups();

    if (!Array.isArray(backups)) return null;

    return backups.find(item => item.id === backupId) || null;
  }

  async prepareProject(backup) {
    if (!backup || !backup.project) {
      throw new Error("Backup data is missing");
    }

    let project = JSON.parse(JSON.stringify(backup.project));

    project = parseProject(project);
    project = migrateProject(project);

    const validation = validateSafely(project);

    if (!validation.valid) {
      const details = validation.errors
        .map(item => item.message || String(item))
        .join("; ");

      throw new Error(
        "Backup project validation failed: " + details
      );
    }

    return project;
  }

  async recoverBackup(backupId) {
    if (this.recovering) {
      throw new Error("Recovery is already running");
    }

    this.recovering = true;
    this.emit("recovery-started", { backupId });

    try {
      const backup = await this.getBackup(backupId);

      if (!backup) {
        throw new Error("Backup not found");
      }

      const project = await this.prepareProject(backup);

      await this.restoreProject(project);

      this.emit("recovery-completed", {
        backupId,
        projectId: project.id
      });

      notifications.success("Project recovery completed");

      return project;
    } catch (error) {
      this.emit("recovery-failed", {
        backupId,
        message: error.message
      });

      notifications.error(
        "Recovery failed: " + error.message
      );

      throw error;
    } finally {
      this.recovering = false;
    }
  }

  async recoverLatest(projectId = null) {
    const backups = await this.db.listBackups(projectId);

    if (!Array.isArray(backups) || backups.length === 0) {
      throw new Error("No recovery backup found");
    }

    const latest = [...backups].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    )[0];

    return this.recoverBackup(latest.id);
  }

  async deleteBackup(backupId) {
    if (!backupId) {
      throw new Error("Backup ID is required");
    }

    await this.db.deleteBackup(backupId);

    this.emit("backup-deleted", { backupId });

    notifications.success("Backup deleted");
  }

  async clearBackups(projectId = null) {
    const backups = await this.db.listBackups(projectId);

    if (!Array.isArray(backups)) return 0;

    for (const backup of backups) {
      await this.db.deleteBackup(backup.id);
    }

    this.emit("backups-cleared", { projectId });

    return backups.length;
  }

  async createPreRestoreBackup() {
    const project = this.getProject();

    if (!project) return null;

    return this.createSnapshot(project, "before-restore");
  }

  async safeRecover(backupId) {
    await this.createPreRestoreBackup();
    return this.recoverBackup(backupId);
  }

  getStatus() {
    return {
      recovering: this.recovering,
      maxBackups: this.maxBackups
    };
  }
}

export const recoveryManager = new RecoveryManager();
