const DB_NAME = "ZERO_X_MOTION_DB";
const DB_VERSION = 1;

const STORES = {
  PROJECTS: "projects",
  ASSETS: "assets",
  SETTINGS: "settings",
  BACKUPS: "backups"
};

export class DatabaseError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "DatabaseError";
    this.cause = cause;
  }
}

export class EditorDatabase {
  constructor() {
    this.database = null;
    this.opening = null;
    this.listeners = new Set();
  }

  open() {
    if (this.database) {
      return Promise.resolve(this.database);
    }

    if (this.opening) return this.opening;

    if (!("indexedDB" in globalThis)) {
      return Promise.reject(
        new DatabaseError(
          "IndexedDB is not supported in this browser."
        )
      );
    }

    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(
        DB_NAME,
        DB_VERSION
      );

      request.onupgradeneeded = event => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
          const store = db.createObjectStore(
            STORES.PROJECTS,
            { keyPath: "id" }
          );

          store.createIndex("updatedAt", "updatedAt");
        }

        if (!db.objectStoreNames.contains(STORES.ASSETS)) {
          const store = db.createObjectStore(
            STORES.ASSETS,
            { keyPath: "id" }
          );

          store.createIndex("projectId", "projectId");
        }

        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(
            STORES.SETTINGS,
            { keyPath: "key" }
          );
        }

        if (!db.objectStoreNames.contains(STORES.BACKUPS)) {
          const store = db.createObjectStore(
            STORES.BACKUPS,
            { keyPath: "id" }
          );

          store.createIndex("projectId", "projectId");
        }
      };

      request.onsuccess = () => {
        this.database = request.result;

        this.database.onversionchange = () => {
          this.database.close();
          this.database = null;
        };

        this.emit("connected");
        resolve(this.database);
      };

      request.onerror = () => {
        reject(
          new DatabaseError(
            "Could not open editor database.",
            request.error
          )
        );
      };

      request.onblocked = () => {
        this.emit("blocked");
      };
    }).finally(() => {
      this.opening = null;
    });

    return this.opening;
  }

  async transaction(storeNames, mode, operation) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      let result;

      const transaction = db.transaction(
        storeNames,
        mode
      );

      transaction.oncomplete = () => {
        resolve(result);
      };

      transaction.onerror = () => {
        reject(
          new DatabaseError(
            "Database transaction failed.",
            transaction.error
          )
        );
      };

      transaction.onabort = () => {
        reject(
          new DatabaseError(
            "Database transaction was aborted.",
            transaction.error
          )
        );
      };

      try {
        result = operation(transaction);
      } catch (error) {
        try {
          transaction.abort();
        } catch {}

        reject(error);
      }
    });
  }

  async put(storeName, value) {
    if (!value || typeof value !== "object") {
      throw new DatabaseError("Invalid database value.");
    }

    return this.transaction(
      [storeName],
      "readwrite",
      transaction => {
        transaction.objectStore(storeName).put(value);
      }
    );
  }

  async get(storeName, id) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [storeName],
        "readonly"
      );

      const request = transaction
        .objectStore(storeName)
        .get(id);

      request.onsuccess = () => resolve(
        request.result ?? null
      );

      request.onerror = () => reject(
        new DatabaseError(
          "Could not read database record.",
          request.error
        )
      );
    });
  }

  async getAll(storeName) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [storeName],
        "readonly"
      );

      const request = transaction
        .objectStore(storeName)
        .getAll();

      request.onsuccess = () => resolve(
        request.result || []
      );

      request.onerror = () => reject(
        new DatabaseError(
          "Could not list database records.",
          request.error
        )
      );
    });
  }

  async delete(storeName, id) {
    return this.transaction(
      [storeName],
      "readwrite",
      transaction => {
        transaction.objectStore(storeName).delete(id);
      }
    );
  }

  async clear(storeName) {
    return this.transaction(
      [storeName],
      "readwrite",
      transaction => {
        transaction.objectStore(storeName).clear();
      }
    );
  }

  async saveProject(project) {
    if (!project?.id) {
      throw new DatabaseError(
        "Project must have an ID."
      );
    }

    const record = {
      ...structuredClone(project),
      updatedAt: Date.now()
    };

    await this.put(STORES.PROJECTS, record);

    this.emit("project-saved", {
      projectId: project.id
    });

    return record;
  }

  async loadProject(projectId) {
    return this.get(STORES.PROJECTS, projectId);
  }

  async listProjects() {
    const projects = await this.getAll(
      STORES.PROJECTS
    );

    return projects.sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
  }

  async deleteProject(projectId) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [
          STORES.PROJECTS,
          STORES.ASSETS,
          STORES.BACKUPS
        ],
        "readwrite"
      );

      transaction.objectStore(
        STORES.PROJECTS
      ).delete(projectId);

      const assetStore = transaction.objectStore(
        STORES.ASSETS
      );

      const assetRequest = assetStore
        .index("projectId")
        .openCursor(IDBKeyRange.only(projectId));

      assetRequest.onsuccess = () => {
        const cursor = assetRequest.result;

        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      const backupStore = transaction.objectStore(
        STORES.BACKUPS
      );

      const backupRequest = backupStore
        .index("projectId")
        .openCursor(IDBKeyRange.only(projectId));

      backupRequest.onsuccess = () => {
        const cursor = backupRequest.result;

        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve(true);

      transaction.onerror = () => reject(
        new DatabaseError(
          "Could not delete project.",
          transaction.error
        )
      );

      transaction.onabort = () => reject(
        new DatabaseError(
          "Project deletion aborted.",
          transaction.error
        )
      );
    });
  }

  async saveAsset(asset) {
    if (!asset?.id || !asset.projectId) {
      throw new DatabaseError(
        "Asset ID and project ID are required."
      );
    }

    return this.put(STORES.ASSETS, {
      ...asset,
      updatedAt: Date.now()
    });
  }

  async loadAsset(assetId) {
    return this.get(STORES.ASSETS, assetId);
  }

  async listAssets(projectId) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [STORES.ASSETS],
        "readonly"
      );

      const request = transaction
        .objectStore(STORES.ASSETS)
        .index("projectId")
        .getAll(IDBKeyRange.only(projectId));

      request.onsuccess = () => resolve(
        request.result || []
      );

      request.onerror = () => reject(
        new DatabaseError(
          "Could not load project assets.",
          request.error
        )
      );
    });
  }

  async saveBackup(projectId, project) {
    const backup = {
      id: `backup-${projectId}-${Date.now()}`,
      projectId,
      project: structuredClone(project),
      createdAt: Date.now()
    };

    await this.put(STORES.BACKUPS, backup);

    return backup;
  }

  async getBackups(projectId) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [STORES.BACKUPS],
        "readonly"
      );

      const request = transaction
        .objectStore(STORES.BACKUPS)
        .index("projectId")
        .getAll(IDBKeyRange.only(projectId));

      request.onsuccess = () => {
        resolve(
          (request.result || []).sort(
            (a, b) => b.createdAt - a.createdAt
          )
        );
      };

      request.onerror = () => reject(
        new DatabaseError(
          "Could not load backups.",
          request.error
        )
      );
    });
  }

  async saveSetting(key, value) {
    return this.put(STORES.SETTINGS, {
      key,
      value,
      updatedAt: Date.now()
    });
  }

  async getSetting(key, fallback = null) {
    const record = await this.get(STORES.SETTINGS, key);

    return record ? record.value : fallback;
  }

  async getStorageEstimate() {
    if (!navigator.storage?.estimate) {
      return null;
    }

    const estimate = await navigator.storage.estimate();

    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      available: Math.max(
        0,
        (estimate.quota || 0) - (estimate.usage || 0)
      )
    };
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

  close() {
    this.database?.close();
    this.database = null;
    this.opening = null;
    this.emit("disconnected");
  }

  destroy() {
    this.close();
    this.listeners.clear();
  }
}

export const database = new EditorDatabase();
