import { database } from "./database.js";
import { createId } from "../project/schema.js";
import { eventBus } from "../core/event-bus.js";

export class MediaPersistence {
  constructor(options = {}) {
    this.db = options.database || database;
    this.maxFileSize = options.maxFileSize || 1024 * 1024 * 1024;
    this.pending = new Map();
  }

  validateFile(file) {
    if (!(file instanceof Blob)) {
      throw new Error("A valid media file is required");
    }

    if (file.size === 0) {
      throw new Error("The selected media file is empty");
    }

    if (file.size > this.maxFileSize) {
      throw new Error("Media file exceeds the storage limit");
    }

    const supported = [
      "video/",
      "audio/",
      "image/"
    ];

    if (!supported.some(type => file.type.startsWith(type))) {
      throw new Error("Unsupported media format");
    }

    return true;
  }

  createRecord(file, projectId, assetId = null) {
    return {
      id: assetId || createId("media"),
      projectId: projectId || null,
      name: file.name || "Untitled Media",
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified || Date.now(),
      createdAt: Date.now(),
      blob: file
    };
  }

  async save(file, projectId, assetId = null) {
    this.validateFile(file);

    const record = this.createRecord(
      file,
      projectId,
      assetId
    );

    if (this.pending.has(record.id)) {
      return this.pending.get(record.id);
    }

    const operation = this.db.saveAsset(record)
      .then(() => {
        eventBus.emit("MEDIA_PERSISTED", {
          id: record.id,
          projectId: record.projectId,
          name: record.name,
          size: record.size
        });

        return {
          id: record.id,
          projectId: record.projectId,
          name: record.name,
          type: record.type,
          size: record.size,
          createdAt: record.createdAt
        };
      })
      .finally(() => {
        this.pending.delete(record.id);
      });

    this.pending.set(record.id, operation);

    return operation;
  }

  async saveMany(files, projectId) {
    const results = [];

    for (const file of files) {
      try {
        const saved = await this.save(file, projectId);
        results.push({
          success: true,
          asset: saved
        });
      } catch (error) {
        results.push({
          success: false,
          name: file?.name || "Unknown",
          error: error.message
        });
      }
    }

    return results;
  }

  async load(assetId) {
    if (!assetId) {
      throw new Error("Asset ID is required");
    }

    const record = await this.db.loadAsset(assetId);

    if (!record || !record.blob) {
      throw new Error("Stored media file not found");
    }

    return {
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      type: record.type,
      size: record.size,
      blob: record.blob,
      file: new File(
        [record.blob],
        record.name,
        {
          type: record.type,
          lastModified: record.lastModified || Date.now()
        }
      )
    };
  }

  async loadBlob(assetId) {
    const media = await this.load(assetId);
    return media.blob;
  }

  async createObjectURL(assetId) {
    const blob = await this.loadBlob(assetId);
    return URL.createObjectURL(blob);
  }

  async list(projectId = null) {
    const records = await this.db.listAssets(projectId);

    if (!Array.isArray(records)) return [];

    return records.map(record => ({
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      type: record.type,
      size: record.size,
      createdAt: record.createdAt
    }));
  }

  async delete(assetId) {
    if (!assetId) {
      throw new Error("Asset ID is required");
    }

    await this.db.deleteAsset(assetId);

    eventBus.emit("MEDIA_PERSISTENCE_DELETED", {
      assetId
    });

    return true;
  }

  async deleteProjectMedia(projectId) {
    const records = await this.db.listAssets(projectId);

    if (!Array.isArray(records)) return 0;

    for (const record of records) {
      await this.db.deleteAsset(record.id);
    }

    eventBus.emit("PROJECT_MEDIA_DELETED", {
      projectId,
      count: records.length
    });

    return records.length;
  }

  async getStorageInfo() {
    if (navigator.storage?.estimate) {
      const info = await navigator.storage.estimate();

      return {
        usage: info.usage || 0,
        quota: info.quota || 0,
        available: Math.max(
          0,
          (info.quota || 0) - (info.usage || 0)
        )
      };
    }

    return {
      usage: null,
      quota: null,
      available: null
    };
  }

  async canStore(size) {
    const info = await this.getStorageInfo();

    if (info.available === null) {
      return {
        allowed: true,
        warning: "Storage estimate unavailable"
      };
    }

    return {
      allowed: size <= info.available,
      available: info.available,
      required: size
    };
  }

  revokeObjectURL(url) {
    if (typeof url === "string" &&
        url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }
}

export const mediaPersistence = new MediaPersistence();
