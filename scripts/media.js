
/* =========================================================
   VYORA STUDIO — COMPLETE MEDIA ENGINE
   File: scripts/media.js
   ========================================================= */

(() => {
  "use strict";

  const DB_NAME = "VYORA_MEDIA_DATABASE";
  const DB_VERSION = 1;
  const STORE_NAME = "assets";

  const CONFIG = {
    metadataTimeout: 30000,
    maxFileSize: 1024 * 1024 * 1024
  };

  const Media = {
    db: null,
    assets: new Map(),
    activeVideo: null,
    activeVideoElement: null,
    activeAudio: null,
    previewElement: null,
    previewVolume: 1,
    previewMuted: false,
    initialized: false,
    initializationPromise: null,
    canvas: null,
    canvasContext: null,
    crop: {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    },

    /* ---------- GENERAL ---------- */

    createId() {
      return "media_" + Date.now().toString(36) +
        "_" + Math.random().toString(36).slice(2, 9);
    },

    dispatch(name, detail = {}) {
      window.dispatchEvent(
        new CustomEvent("vyora:media-" + name, { detail })
      );
    },

    formatError(error) {
      return error?.message || String(error || "Unknown error");
    },

    /* ---------- FILE VALIDATION ---------- */

    validateFile(file, type) {
      if (!(file instanceof Blob)) {
        throw new Error("Invalid file selected.");
      }

      if (!file.size) {
        throw new Error("Selected file is empty.");
      }

      if (file.size > CONFIG.maxFileSize) {
        throw new Error("File exceeds the 1 GB import limit.");
      }

      const mime = (file.type || "").toLowerCase();

      if (mime && !mime.startsWith(type + "/")) {
        throw new Error(
          "Invalid " + type + " file. Detected type: " + mime
        );
      }

      return true;
    },

    /* ---------- DATABASE ---------- */

    openDatabase() {
      if (this.db) return Promise.resolve(this.db);

      return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error("IndexedDB is not supported."));
          return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = event => {
          const db = event.target.result;

          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, {
              keyPath: "id"
            });

            store.createIndex("type", "type", {
              unique: false
            });
          }
        };

        request.onsuccess = event => {
          this.db = event.target.result;

          this.db.onversionchange = () => {
            this.db.close();
            this.db = null;
          };

          resolve(this.db);
        };

        request.onerror = () => {
          reject(request.error || new Error("Database opening failed."));
        };

        request.onblocked = () => {
          console.warn("VYORA database opening is blocked.");
        };
      });
    },

    databaseRequest(mode, operation) {
      return this.openDatabase().then(db => {
        return new Promise((resolve, reject) => {
          let transaction;

          try {
            transaction = db.transaction(STORE_NAME, mode);
          } catch (error) {
            reject(error);
            return;
          }

          let request;
          let result;
          let requestDone = false;

          try {
            request = operation(
              transaction.objectStore(STORE_NAME)
            );
          } catch (error) {
            reject(error);
            return;
          }

          request.onsuccess = () => {
            result = request.result;
            requestDone = true;
          };

          request.onerror = () => {
            reject(request.error || new Error("Database request failed."));
          };

          transaction.oncomplete = () => {
            resolve(requestDone ? result : undefined);
          };

          transaction.onerror = () => {
            reject(
              transaction.error || new Error("Database transaction failed.")
            );
          };

          transaction.onabort = () => {
            reject(
              transaction.error || new Error("Database transaction aborted.")
            );
          };
        });
      });
    },

    saveAssetRecord(record) {
      return this.databaseRequest("readwrite", store => store.put(record));
    },

    getAssetRecord(id) {
      return this.databaseRequest("readonly", store => store.get(id));
    },

    getAllAssetRecords() {
      return this.databaseRequest("readonly", store => store.getAll());
    },

    deleteAssetRecord(id) {
      return this.databaseRequest("readwrite", store => store.delete(id));
    },

    /* ---------- OBJECT URL ---------- */

    createURL(blob) {
      return URL.createObjectURL(blob);
    },

    revokeURL(asset) {
      if (asset?.url) {
        try {
          URL.revokeObjectURL(asset.url);
        } catch (error) {
          console.warn("VYORA URL cleanup failed.", error);
        }
      }
    },

    /* ---------- METADATA ---------- */

    readMetadata(file, type) {
      return new Promise((resolve, reject) => {
        const element = document.createElement(
          type === "video" ? "video" : "audio"
        );

        const url = URL.createObjectURL(file);
        let finished = false;

        element.preload = "metadata";
        element.muted = true;

        if (type === "video") {
          element.playsInline = true;
        }

        const cleanup = () => {
          element.removeEventListener("loadedmetadata", onMetadata);
          element.removeEventListener("error", onError);
          element.removeEventListener("abort", onAbort);
          clearTimeout(timer);

          element.removeAttribute("src");

          try {
            element.load();
          } catch (_) {}

          URL.revokeObjectURL(url);
        };

        const finish = (error, result) => {
          if (finished) return;
          finished = true;
          cleanup();

          if (error) reject(error);
          else resolve(result);
        };

        const onMetadata = () => {
          const duration = element.duration;

          if (!Number.isFinite(duration) || duration <= 0) {
            finish(new Error(
              "Media duration is invalid or unavailable."
            ));
            return;
          }

          const result = {
            duration,
            width: type === "video" ? element.videoWidth : 0,
            height: type === "video" ? element.videoHeight : 0
          };

          if (
            type === "video" &&
            (!result.width || !result.height)
          ) {
            finish(new Error(
              "Video dimensions could not be detected."
            ));
            return;
          }

          finish(null, result);
        };

        const onError = () => {
          const code = element.error?.code;

          const messages = {
            1: "Media loading was aborted.",
            2: "Media file could not be read.",
            3: "Video decoding failed. Codec may be unsupported.",
            4: "Video format or codec is not supported by this browser."
          };

          finish(new Error(
            messages[code] ||
            "Browser could not read this media file."
          ));
        };

        const onAbort = () => {
          finish(new Error("Media metadata loading was aborted."));
        };

        const timer = setTimeout(() => {
          finish(new Error(
            "Metadata loading timed out. Try an MP4 H.264 video."
          ));
        }, CONFIG.metadataTimeout);

        element.addEventListener("loadedmetadata", onMetadata, {
          once: true
        });

        element.addEventListener("error", onError, {
          once: true
        });

        element.addEventListener("abort", onAbort, {
          once: true
        });

        element.src = url;

        try {
          element.load();
        } catch (error) {
          finish(error);
        }
      });
    },

    /* ---------- ASSET CREATION ---------- */

    async importAsset(file, type) {
      this.validateFile(file, type);

      this.dispatch("import-start", {
        type,
        name: file.name
      });

      let metadata;

      try {
        metadata = await this.readMetadata(file, type);
      } catch (error) {
        this.dispatch("import-error", {
          type,
          name: file.name,
          error: this.formatError(error)
        });

        throw error;
      }

      const id = this.createId();
      const url = this.createURL(file);

      const record = {
        id,
        type,
        name: file.name || "Untitled " + type,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        lastModified: file.lastModified || Date.now(),
        createdAt: Date.now(),
        blob: file
      };

      try {
        await this.saveAssetRecord(record);
      } catch (error) {
        URL.revokeObjectURL(url);

        this.dispatch("import-error", {
          type,
          name: file.name,
          error: this.formatError(error)
        });

        throw new Error(
          "Media was read but browser storage failed: " +
          this.formatError(error)
        );
      }

      const asset = {
        ...record,
        file,
        url
      };

      delete asset.blob;

      this.assets.set(id, asset);

      this.dispatch("import-success", {
        asset: this.publicAsset(asset)
      });

      return this.publicAsset(asset);
    },

    loadVideo(file) {
      return this.importAsset(file, "video");
    },

    loadAudio(file) {
      return this.importAsset(file, "audio");
    },

    publicAsset(asset) {
      if (!asset) return null;

      return {
        id: asset.id,
        type: asset.type,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        duration: asset.duration,
        width: asset.width,
        height: asset.height,
        lastModified: asset.lastModified,
        createdAt: asset.createdAt,
        url: asset.url
      };
    },

    getAsset(id) {
      return this.publicAsset(this.assets.get(id));
    },

    getAllAssets() {
      return Array.from(this.assets.values()).map(asset =>
        this.publicAsset(asset)
      );
    },

    /* ---------- RESTORE AFTER REFRESH ---------- */

    async restoreAssets() {
      const records = await this.getAllAssetRecords();

      for (const record of records || []) {
        if (!record?.id || !record.blob) continue;

        const previous = this.assets.get(record.id);

        if (previous) this.revokeURL(previous);

        const asset = {
          id: record.id,
          type: record.type,
          name: record.name,
          mimeType: record.mimeType,
          size: record.size,
          duration: record.duration,
          width: record.width || 0,
          height: record.height || 0,
          lastModified: record.lastModified,
          createdAt: record.createdAt,
          file: record.blob,
          url: this.createURL(record.blob)
        };

        this.assets.set(asset.id, asset);
      }

      this.dispatch("assets-restored", {
        count: this.assets.size
      });

      return this.getAllAssets();
    },

    async initialize() {
      if (this.initialized) return true;

      if (this.initializationPromise) {
        return this.initializationPromise;
      }

      this.initializationPromise = (async () => {
        await this.openDatabase();
        await this.restoreAssets();

        this.initialized = true;

        this.dispatch("ready", {
          assets: this.getAllAssets()
        });

        return true;
      })();

      try {
        return await this.initializationPromise;
      } catch (error) {
        this.initializationPromise = null;
        throw error;
      }
    },

    /* ---------- PREVIEW ATTACHMENT ---------- */

    attachPreview(videoElement) {
      if (!(videoElement instanceof HTMLVideoElement)) {
        throw new Error("A valid video preview element is required.");
      }

      this.previewElement = videoElement;

      videoElement.playsInline = true;
      videoElement.preload = "auto";
      videoElement.volume = this.previewVolume;
      videoElement.muted = this.previewMuted;

      videoElement.addEventListener("ended", () => {
        this.dispatch("ended", {
          currentTime: videoElement.currentTime
        });
      });

      videoElement.addEventListener("timeupdate", () => {
        this.dispatch("timeupdate", {
          currentTime: videoElement.currentTime,
          duration: videoElement.duration
        });
      });

      videoElement.addEventListener("error", () => {
        this.dispatch("preview-error", {
          error: videoElement.error?.message ||
            "Preview playback failed."
        });
      });

      return videoElement;
    },

    /* ---------- OPEN VIDEO ---------- */

    async openVideo(assetId, videoElement = this.previewElement) {
      const asset = this.assets.get(assetId);

      if (!asset || asset.type !== "video") {
        throw new Error("Video asset not found.");
      }

      if (!(videoElement instanceof HTMLVideoElement)) {
        throw new Error("Video preview element is unavailable.");
      }

      this.pauseVideo();

      videoElement.pause();
      videoElement.removeAttribute("src");
      videoElement.load();

      videoElement.src = asset.url;
      videoElement.playsInline = true;
      videoElement.preload = "auto";
      videoElement.muted = this.previewMuted;
      videoElement.volume = this.previewVolume;

      await new Promise((resolve, reject) => {
        let done = false;

        const cleanup = () => {
          videoElement.removeEventListener("loadedmetadata", success);
          videoElement.removeEventListener("error", failure);
          clearTimeout(timer);
        };

        const finish = (error) => {
          if (done) return;
          done = true;
          cleanup();

          if (error) reject(error);
          else resolve(true);
        };

        const success = () => finish();

        const failure = () => finish(
          new Error("Video preview could not be loaded.")
        );

        const timer = setTimeout(() => {
          finish(new Error("Preview loading timed out."));
        }, CONFIG.metadataTimeout);

        videoElement.addEventListener("loadedmetadata", success, {
          once: true
        });

        videoElement.addEventListener("error", failure, {
          once: true
        });

        videoElement.load();

        if (videoElement.readyState >= 1) {
          success();
        }
      });

      this.activeVideo = asset;
      this.activeVideoElement = videoElement;
      this.previewElement = videoElement;

      this.dispatch("video-opened", {
        asset: this.publicAsset(asset)
      });

      return true;
    },

    /* ---------- PLAYBACK ---------- */

    async playVideo() {
      const video = this.activeVideoElement || this.previewElement;

      if (!video || !video.src) return false;

      try {
        await video.play();
        this.dispatch("play", {
          currentTime: video.currentTime
        });
        return true;
      } catch (error) {
        this.dispatch("play-error", {
          error: this.formatError(error)
        });
        return false;
      }
    },

    pauseVideo() {
      const video = this.activeVideoElement || this.previewElement;

      if (video) video.pause();

      this.dispatch("pause", {
        currentTime: video?.currentTime || 0
      });

      return true;
    },

    async togglePlayback() {
      const video = this.activeVideoElement || this.previewElement;

      if (!video) return false;

      if (video.paused) {
        return this.playVideo();
      }

      this.pauseVideo();
      return true;
    },

    stopVideo() {
      const video = this.activeVideoElement || this.previewElement;

      if (video) {
        video.pause();

        try {
          video.currentTime = 0;
        } catch (_) {}
      }

      return true;
    },

    seek(time) {
      const video = this.activeVideoElement || this.previewElement;

      if (!video || !Number.isFinite(Number(time))) {
        return false;
      }

      const duration = Number.isFinite(video.duration)
        ? video.duration
        : 0;

      const target = Math.max(
        0,
        Math.min(Number(time), duration || Number(time))
      );

      try {
        video.currentTime = target;
        this.dispatch("seek", { time: target });
        return true;
      } catch (error) {
        console.warn("VYORA seek failed.", error);
        return false;
      }
    },

    getPlaybackInfo() {
      const video = this.activeVideoElement || this.previewElement;

      if (!video) {
        return {
          currentTime: 0,
          duration: 0,
          paused: true,
          ended: false
        };
      }

      return {
        currentTime: video.currentTime || 0,
        duration: Number.isFinite(video.duration)
          ? video.duration
          : 0,
        paused: video.paused,
        ended: video.ended,
        playbackRate: video.playbackRate
      };
    },

    setPlaybackRate(rate) {
      const video = this.activeVideoElement || this.previewElement;

      if (!video) return false;

      const value = Number(rate);

      if (!Number.isFinite(value) || value <= 0) {
        return false;
      }

      video.playbackRate = Math.min(4, Math.max(0.25, value));
      return true;
    },

    setPreviewVolume(value) {
      const volume = Number(value);

      if (!Number.isFinite(volume)) return false;

      this.previewVolume = Math.max(0, Math.min(1, volume));

      const video = this.activeVideoElement || this.previewElement;

      if (video) video.volume = this.previewVolume;

      if (this.activeAudio) {
        this.activeAudio.volume = this.previewVolume;
      }

      return true;
    },

    setPreviewMuted(muted) {
      this.previewMuted = Boolean(muted);

      const video = this.activeVideoElement || this.previewElement;

      if (video) video.muted = this.previewMuted;

      return true;
    },

    /* ---------- AUDIO PREVIEW ---------- */

    async playAudio(assetId) {
      const asset = this.assets.get(assetId);

      if (!asset || asset.type !== "audio") {
        throw new Error("Audio asset not found.");
      }

      this.stopAudio();

      const audio = new Audio(asset.url);

      audio.volume = this.previewVolume;
      audio.muted = this.previewMuted;
      audio.preload = "auto";

      this.activeAudio = audio;

      try {
        await audio.play();
        this.dispatch("audio-play", { assetId });
        return true;
      } catch (error) {
        this.dispatch("audio-error", {
          error: this.formatError(error)
        });
        return false;
      }
    },

    pauseAudio() {
      if (this.activeAudio) {
        this.activeAudio.pause();
      }
      return true;
    },

    stopAudio() {
      if (this.activeAudio) {
        this.activeAudio.pause();

        try {
          this.activeAudio.currentTime = 0;
        } catch (_) {}

        this.activeAudio.src = "";
        this.activeAudio = null;
      }

      return true;
    },

    /* ---------- CROP ---------- */

    validCrop(crop) {
      if (!crop) return false;

      const values = [
        crop.x,
        crop.y,
        crop.width,
        crop.height
      ].map(Number);

      if (!values.every(Number.isFinite)) return false;

      const [x, y, width, height] = values;

      return (
        x >= 0 &&
        y >= 0 &&
        width > 0 &&
        height > 0 &&
        x + width <= 1 &&
    
        y + height <= 1
      );
    },

    setCrop(crop) {
      if (!this.validCrop(crop)) {
        throw new Error("Invalid crop dimensions.");
      }

      this.crop = {
        x: Number(crop.x),
        y: Number(crop.y),
        width: Number(crop.width),
        height: Number(crop.height)
      };

      this.dispatch("crop-change", {
        crop: { ...this.crop }
      });

      return { ...this.crop };
    },

    resetCrop() {
      this.crop = {
        x: 0,
        y: 0,
        width: 1,
        height: 1
      };

      this.dispatch("crop-change", {
        crop: { ...this.crop }
      });

      return { ...this.crop };
    },

    /* ---------- CANVAS ---------- */

    createCanvas(width, height) {
      const w = Math.max(1, Math.floor(Number(width) || 1));
      const h = Math.max(1, Math.floor(Number(height) || 1));

      this.canvas = document.createElement("canvas");
      this.canvas.width = w;
      this.canvas.height = h;

      this.canvasContext = this.canvas.getContext("2d", {
        alpha: false
      });

      if (!this.canvasContext) {
        throw new Error("Canvas 2D context is unavailable.");
      }

      return this.canvas;
    },

    getCanvas() {
      return this.canvas;
    },

    getCanvasContext() {
      return this.canvasContext;
    },

    drawPreview(options = {}) {
      const video = this.activeVideoElement || this.previewElement;
      const canvas = this.canvas;
      const ctx = this.canvasContext;

      if (!video || !canvas || !ctx) return false;

      if (!video.videoWidth || !video.videoHeight) {
        return false;
      }

      const crop = options.crop || this.crop;

      if (!this.validCrop(crop)) {
        return false;
      }

      const sx = crop.x * video.videoWidth;
      const sy = crop.y * video.videoHeight;
      const sw = crop.width * video.videoWidth;
      const sh = crop.height * video.videoHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        canvas.width,
        canvas.height
      );

      return true;
    },

    /* ---------- ASSET REMOVAL ---------- */

    async removeAsset(id) {
      const asset = this.assets.get(id);

      if (!asset) return false;

      if (this.activeVideo?.id === id) {
        this.pauseVideo();

        const video = this.activeVideoElement;

        if (video) {
          video.removeAttribute("src");
          video.load();
        }

        this.activeVideo = null;
        this.activeVideoElement = null;
      }

      if (this.activeAudio) {
        this.stopAudio();
      }

      await this.deleteAssetRecord(id);

      this.revokeURL(asset);
      this.assets.delete(id);

      this.dispatch("asset-removed", { id });

      return true;
    },

    /* ---------- STORAGE INFORMATION ---------- */

    async getStorageInfo() {
      if (navigator.storage?.estimate) {
        try {
          const info = await navigator.storage.estimate();

          return {
            usage: info.usage || 0,
            quota: info.quota || 0,
            available: Math.max(
              0,
              (info.quota || 0) - (info.usage || 0)
            )
          };
        } catch (error) {
          console.warn("Storage estimate unavailable.", error);
        }
      }

      return {
        usage: null,
        quota: null,
        available: null
      };
    },

    async requestPersistentStorage() {
      if (!navigator.storage?.persist) return false;

      try {
        return await navigator.storage.persist();
      } catch (_) {
        return false;
      }
    },

    /* ---------- CLEANUP ---------- */

    destroy() {
      this.stopAudio();
      this.pauseVideo();

      for (const asset of this.assets.values()) {
        this.revokeURL(asset);
      }

      this.assets.clear();

      if (this.previewElement) {
        this.previewElement.pause();
        this.previewElement.removeAttribute("src");

        try {
          this.previewElement.load();
        } catch (_) {}
      }

      if (this.db) {
        this.db.close();
        this.db = null;
      }

      this.activeVideo = null;
      this.activeVideoElement = null;
      this.activeAudio = null;
      this.previewElement = null;
      this.initialized = false;
      this.initializationPromise = null;
    }
  };

  window.VYORAMedia = Media;

  window.addEventListener("pagehide", () => {
    Media.pauseVideo();
    Media.pauseAudio();
  });

})();
      
