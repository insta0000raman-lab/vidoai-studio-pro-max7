const DEFAULT_CACHE_NAME = "zero-x-motion-media";

class MediaCache {
  constructor() {
    this.files = new Map();
    this.urls = new Map();
    this.metadata = new Map();
    this.pending = new Map();
    this.maxMemoryEntries = 100;
  }

  register(assetId, file, metadata = {}) {
    if (!assetId) {
      throw new Error("Asset ID is required");
    }

    if (!(file instanceof Blob)) {
      throw new TypeError("A valid media file is required");
    }

    this.releaseUrl(assetId);

    const url = URL.createObjectURL(file);

    this.files.set(assetId, file);
    this.urls.set(assetId, url);
    this.metadata.set(assetId, {
      ...metadata,
      name: file.name || metadata.name || "Untitled media",
      type: file.type || metadata.type || "unknown",
      size: file.size,
      registeredAt: Date.now()
    });

    this.enforceMemoryLimit();

    return {
      assetId,
      url,
      size: file.size,
      type: file.type
    };
  }

  registerUrl(assetId, url, metadata = {}) {
    if (!assetId || !url) {
      throw new Error("Asset ID and URL are required");
    }

    this.releaseUrl(assetId);

    this.urls.set(assetId, url);
    this.metadata.set(assetId, {
      ...metadata,
      registeredAt: Date.now()
    });

    return url;
  }

  getFile(assetId) {
    return this.files.get(assetId) || null;
  }

  getUrl(assetId) {
    return this.urls.get(assetId) || null;
  }

  getMetadata(assetId) {
    return this.metadata.get(assetId) || null;
  }

  has(assetId) {
    return this.files.has(assetId) || this.urls.has(assetId);
  }

  async getOrCreateUrl(assetId, file) {
    const existing = this.getUrl(assetId);

    if (existing) return existing;

    if (!file) {
      throw new Error("Media file is unavailable");
    }

    const result = this.register(assetId, file);

    return result.url;
  }

  async load(assetId, loader) {
    if (!assetId) {
      throw new Error("Asset ID is required");
    }

    if (this.has(assetId)) {
      return {
        file: this.getFile(assetId),
        url: this.getUrl(assetId),
        metadata: this.getMetadata(assetId)
      };
    }

    if (this.pending.has(assetId)) {
      return this.pending.get(assetId);
    }

    if (typeof loader !== "function") {
      throw new Error("A media loader function is required");
    }

    const task = Promise.resolve()
      .then(() => loader(assetId))
      .then(result => {
        if (!result) {
          throw new Error("Media was not found");
        }

        const file = result.file || result.blob;

        if (file instanceof Blob) {
          const registered = this.register(
            assetId,
            file,
            result.metadata || {}
          );

          return {
            file,
            url: registered.url,
            metadata: this.getMetadata(assetId)
          };
        }

        if (result.url) {
          this.registerUrl(
            assetId,
            result.url,
            result.metadata || {}
          );

          return {
            file: null,
            url: result.url,
            metadata: this.getMetadata(assetId)
          };
        }

        throw new Error("Loader returned an invalid media result");
      })
      .finally(() => {
        this.pending.delete(assetId);
      });

    this.pending.set(assetId, task);

    return task;
  }

  releaseUrl(assetId) {
    const url = this.urls.get(assetId);

    if (!url) return false;

    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }

    this.urls.delete(assetId);

    return true;
  }

  remove(assetId) {
    this.releaseUrl(assetId);

    this.files.delete(assetId);
    this.metadata.delete(assetId);
    this.pending.delete(assetId);

    return true;
  }

  clear() {
    for (const assetId of this.urls.keys()) {
      this.releaseUrl(assetId);
    }

    this.files.clear();
    this.urls.clear();
    this.metadata.clear();
    this.pending.clear();
  }

  enforceMemoryLimit() {
    while (this.files.size > this.maxMemoryEntries) {
      const oldestId = this.files.keys().next().value;

      if (!oldestId) break;

      this.releaseUrl(oldestId);
      this.files.delete(oldestId);
      this.metadata.delete(oldestId);
    }
  }

  getStats() {
    let totalBytes = 0;

    for (const file of this.files.values()) {
      totalBytes += file.size || 0;
    }

    return {
      fileCount: this.files.size,
      urlCount: this.urls.size,
      pendingCount: this.pending.size,
      memoryBytes: totalBytes,
      memoryMB: Number(
        (totalBytes / (1024 * 1024)).toFixed(2)
      )
    };
  }

  getAssetIds() {
    return Array.from(
      new Set([
        ...this.files.keys(),
        ...this.urls.keys()
      ])
    );
  }
}

export const mediaCache = new MediaCache();

export { DEFAULT_CACHE_NAME };
