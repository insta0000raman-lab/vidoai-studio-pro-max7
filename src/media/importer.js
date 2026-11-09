import {
  readMediaMetadata,
  validateMediaFile,
  releaseMediaMetadata
} from "./metadata.js";

import {
  createAsset,
  touchProject
} from "../project/schema.js";

import { projectManager } from "../project/project-manager.js";
import { eventBus } from "../core/event-bus.js";
import { notifications } from "../core/notifications.js";

class MediaImporter {
  constructor() {
    this.importing = new Map();
    this.maxFileSize = 2 * 1024 * 1024 * 1024;
  }

  validate(file) {
    const result = validateMediaFile(file);

    if (!result.valid) {
      throw new Error(result.reason);
    }

    if (file.size > this.maxFileSize) {
      throw new Error("File is larger than the current 2 GB import limit");
    }

    return result;
  }

  async importFile(file, options = {}) {
    if (!projectManager.getCurrent()) {
      throw new Error("Create or open a project before importing media");
    }

    const validation = this.validate(file);

    const importId = this.createImportId(file);

    if (this.importing.has(importId)) {
      throw new Error("This file is already being imported");
    }

    this.importing.set(importId, {
      file,
      status: "reading"
    });

    eventBus.emit("media:import-started", {
      fileName: file.name,
      type: validation.type
    });

    let metadata = null;

    try {
      metadata = await readMediaMetadata(file, {
        timeout: options.timeout || 20000
      });

      const asset = this.createProjectAsset(
        file,
        metadata,
        options
      );

      projectManager.updateProject(project => {
        if (!Array.isArray(project.assets)) {
          project.assets = [];
        }

        project.assets.push(asset);

        return project;
      });

      const result = {
        asset,
        metadata,
        file,
        status: "imported"
      };

      this.importing.set(importId, result);

      eventBus.emit("media:imported", result);

      notifications.success(
        `${file.name} imported`
      );

      return result;
    } catch (error) {
      if (metadata) {
        releaseMediaMetadata(metadata);
      }

      this.importing.delete(importId);

      eventBus.emit("media:import-failed", {
        fileName: file.name,
        error: error.message
      });

      notifications.error(
        `Import failed: ${error.message}`
      );

      throw error;
    }
  }

  createProjectAsset(file, metadata, options = {}) {
    const asset = createAsset({
      name: file.name,
      type: metadata.type,
      mimeType: metadata.mimeType,
      size: file.size,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      aspectRatio: metadata.aspectRatio,
      source: "local",
      sourceUrl: metadata.sourceUrl,
      lastModified: file.lastModified || null,
      importedAt: new Date().toISOString()
    });

    asset.metadata = metadata;
    asset.fileName = file.name;
    asset.fileSize = file.size;
    asset.fileSizeText = metadata.fileSizeText;

    if (options.folder) {
      asset.folder = options.folder;
    }

    return asset;
  }

  async importFiles(fileList, options = {}) {
    const files = Array.from(fileList || []);

    if (!files.length) {
      return [];
    }

    const results = [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index];

      eventBus.emit("media:import-progress", {
        current: index + 1,
        total: files.length,
        fileName: file.name
      });

      try {
        const result = await this.importFile(file, options);
        results.push(result);
      } catch (error) {
        results.push({
          fileName: file.name,
          status: "failed",
          error: error.message
        });
      }
    }

    eventBus.emit("media:batch-import-complete", {
      total: files.length,
      imported: results.filter(item => item.status === "imported").length,
      failed: results.filter(item => item.status === "failed").length
    });

    return results;
  }

  createImportId(file) {
    return [
      file.name,
      file.size,
      file.lastModified
    ].join("-");
  }

  getImportedFile(assetId) {
    const project = projectManager.getCurrent();

    if (!project || !Array.isArray(project.assets)) {
      return null;
    }

    const asset = project.assets.find(
      item => item.id === assetId
    );

    if (!asset) return null;

    return {
      asset,
      sourceUrl: asset.sourceUrl || null
    };
  }

  removeAsset(assetId) {
    const project = projectManager.getCurrent();

    if (!project || !Array.isArray(project.assets)) {
      return false;
    }

    const index = project.assets.findIndex(
      asset => asset.id === assetId
    );

    if (index === -1) return false;

    const [asset] = project.assets.splice(index, 1);

    if (asset.sourceUrl) {
      URL.revokeObjectURL(asset.sourceUrl);
    }

    touchProject(project);
    projectManager.markDirty();

    eventBus.emit("media:removed", asset);

    return true;
  }

  clearImportQueue() {
    this.importing.clear();
  }

  getImportStatus() {
    return Array.from(this.importing.entries()).map(
      ([id, item]) => ({
        id,
        fileName: item.file?.name || "",
        status: item.status
      })
    );
  }
}

export const mediaImporter = new MediaImporter();
