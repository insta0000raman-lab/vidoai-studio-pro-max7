
(() => {
  "use strict";

  const DB_NAME = "VYORA_MEDIA_DATABASE";
  const DB_VERSION = 1;
  const STORE_NAME = "assets";

  const Media = {
    assets: new Map(),
    activeVideo: null,
    activeAudio: null,
    previewElement: null,
    objectUrls: new Set(),
    db: null,
    ready: null,

    createId() {
      return "media_" + Date.now().toString(36) +
        "_" + Math.random().toString(36).slice(2, 9);
    },

    openDatabase() {
      if (this.db) return Promise.resolve(this.db);

      if (!("indexedDB" in window)) {
        return Promise.reject(new Error("IndexedDB is not supported"));
      }

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, {
              keyPath: "id"
            });
            store.createIndex("type", "type", { unique: false });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve(this.db);
        };

        request.onerror = () => reject(request.error);
      });
    },

    async databaseRequest(mode, action) {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        let request;

        try {
          request = action(store);
        } catch (error) {
          reject(error);
          return;
        }

        if (request) {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        } else {
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        }
      });
    },

    async saveAsset(asset) {
      const record = {
        id: asset.id,
        type: asset.type,
        name: asset.name,
        size: asset.size,
        sizeText: asset.sizeText,
        mimeType: asset.mimeType,
        duration: asset.duration,
        width: asset.width || 0,
        height: asset.height || 0,
        aspectRatio: asset.aspectRatio || 0,
        lastModified: asset.lastModified || 0,
        file: asset.file
      };

      await this.databaseRequest("readwrite", store =>
        store.put(record)
      );

      return true;
    },

    async restoreAssets() {
      try {
        const records = await this.databaseRequest("readonly", store =>
          store.getAll()
        );

        for (const record of records || []) {
          if (!record.file) continue;

          const url = this.createURL(record.file);

          this.assets.set(record.id, {
            ...record,
            url,
            file: record.file,
            restored: true
          });
        }

        this.emit("assets-restored", {
          assets: this.getAllAssets()
        });

        return this.getAllAssets();
      } catch (error) {
        console.error("VYORA media restore failed:", error);
        return [];
      }
    },

    createURL(file) {
      const url = URL.createObjectURL(file);
      this.objectUrls.add(url);
      return url;
    },

    revokeURL(url) {
      if (!url || !this.objectUrls.has(url)) return;

      URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    },

    formatTime(seconds) {
      seconds = Math.max(0, Number(seconds) || 0);
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const hundredths = Math.floor((seconds % 1) * 100);

      return String(minutes).padStart(2, "0") + ":" +
        String(secs).padStart(2, "0") + "." +
        String(hundredths).padStart(2, "0");
    },

    formatSize(bytes) {
      bytes = Number(bytes) || 0;
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + " KB";
      }
      if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
      }
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    },

    isVideo(file) {
      return !!file && (
        file.type.startsWith("video/") ||
        /\.(mp4|mov|webm|m4v|3gp|mkv)$/i.test(file.name)
      );
    },

    isAudio(file) {
      return !!file && (
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(file.name)
      );
    },

    readVideoMetadata(file, url) {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.src = url;

        const cleanup = () => {
          video.onloadedmetadata = null;
          video.onerror = null;
        };

        video.onloadedmetadata = () => {
          const result = {
            duration: Number.isFinite(video.duration)
              ? video.duration : 0,
            width: video.videoWidth || 0,
            height: video.videoHeight || 0
          };

          cleanup();
          video.removeAttribute("src");
          video.load();
          resolve(result);
        };

        video.onerror = () => {
          cleanup();
          reject(new Error("Video metadata could not be read"));
        };
      });
    },

    readAudioMetadata(file, url) {
      return new Promise((resolve, reject) => {
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.src = url;

        audio.onloadedmetadata = () => {
          const duration = Number.isFinite(audio.duration)
            ? audio.duration : 0;

          audio.removeAttribute("src");
          audio.load();
          resolve({ duration });
        };

        audio.onerror = () => {
          reject(new Error("Audio metadata could not be read"));
        };
      });
    },

    async loadVideo(file) {
      if (!this.isVideo(file)) {
        throw new Error("Please select a supported video file");
      }

      const url = this.createURL(file);

      try {
        const metadata = await this.readVideoMetadata(file, url);

        const asset = {
          id: this.createId(),
          type: "video",
          name: file.name,
          size: file.size,
          sizeText: this.formatSize(file.size),
          mimeType: file.type || "video/mp4",
          url,
          file,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          aspectRatio: metadata.height
            ? metadata.width / metadata.height : 0,
          lastModified: file.lastModified || 0
        };

        await this.saveAsset(asset);
        this.assets.set(asset.id, asset);

        this.emit("asset-added", { asset: this.publicAsset(asset) });
        return this.publicAsset(asset);
      } catch (error) {
        this.revokeURL(url);
        throw error;
      }
    },

    async loadAudio(file) {
      if (!this.isAudio(file)) {
        throw new Error("Please select a supported audio file");
      }

      const url = this.createURL(file);

      try {
        const metadata = await this.readAudioMetadata(file, url);

        const asset = {
          id: this.createId(),
          type: "audio",
          name: file.name,
          size: file.size,
          sizeText: this.formatSize(file.size),
          mimeType: file.type || "audio/mpeg",
          url,
          file,
          duration: metadata.duration,
          width: 0,
          height: 0,
          aspectRatio: 0,
          lastModified: file.lastModified || 0
        };

        await this.saveAsset(asset);
        this.assets.set(asset.id, asset);

        this.emit("asset-added", { asset: this.publicAsset(asset) });
        return this.publicAsset(asset);
      } catch (error) {
        this.revokeURL(url);
        throw error;
      }
    },

    publicAsset(asset) {
      if (!asset) return null;

      return {
        id: asset.id,
        type: asset.type,
        name: asset.name,
        size: asset.size,
        sizeText: asset.sizeText,
        mimeType: asset.mimeType,
        url: asset.url,
        duration: asset.duration,
        width: asset.width,
        height: asset.height,
        aspectRatio: asset.aspectRatio,
        lastModified: asset.lastModified,
        file: asset.file,
        restored: !!asset.restored
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

    async removeAsset(id) {
      const asset = this.assets.get(id);
      if (!asset) return false;

      if (this.activeVideo?.assetId === id) {
        this.stopVideo();
        this.activeVideo = null;
      }

      if (this.activeAudio?.assetId === id) {
        this.stopAudio();
      }

      this.revokeURL(asset.url);
      this.assets.delete(id);

      try {
        await this.databaseRequest("readwrite", store =>
          store.delete(id)
        );
      } catch (error) {
        console.error("VYORA media delete failed:", error);
      }

      this.emit("asset-removed", { id });
      return true;
    },

    attachPreview(element) {
      if (!(element instanceof HTMLVideoElement)) {
        throw new Error("Preview must be a video element");
      }

      this.previewElement = element;
      return element;
    },

    async openVideo(assetId, videoElement = this.previewElement) {
      const asset = this.assets.get(assetId);

      if (!asset || asset.type !== "video") {
        throw new Error("Video asset not found");
      }

      if (!(videoElement instanceof HTMLVideoElement)) {
        throw new Error("Preview video element missing");
      }

      this.pauseVideo();

      videoElement.pause();
      videoElement.src = asset.url;
      videoElement.preload = "metadata";
      videoElement.playsInline = true;
      videoElement.muted = true;

      await new Promise((resolve, reject) => {
        if (videoElement.readyState >= 1) {
          resolve();
          return;
        }

        videoElement.onloadedmetadata = () => resolve();
        videoElement.onerror = () =>
          reject(new Error("Could not open video preview"));
        videoElement.load();
      });

      this.previewElement = videoElement;
      this.activeVideo = {
        assetId,
        element: videoElement
      };

      this.emit("video-opened", {
        asset: this.publicAsset(asset)
      });

      return videoElement;
    },

    playVideo() {
      const video = this.activeVideo?.element;
      if (!video) return Promise.resolve(false);

      return video.play().then(() => true).catch((error) => {
        console.warn("Video playback blocked:", error);
        return false;
      });
    },

    pauseVideo() {
      const video = this.activeVideo?.element;
      if (video) video.pause();
    },

    togglePlayback() {
      const video = this.activeVideo?.element;
      if (!video) return Promise.resolve(false);

      return video.paused ? this.playVideo() : (
        this.pauseVideo(), Promise.resolve(true)
      );
    },

    stopVideo() {
      const video = this.activeVideo?.element;
      if (!video) return;

      video.pause();
      try {
        video.currentTime = 0;
      } catch (_) {}
    },

    seek(seconds) {
      const video = this.activeVideo?.element;
      if (!video) return false;

      const time = Math.max(0, Number(seconds) || 0);
      video.currentTime = Math.min(
        time,
        Number.isFinite(video.duration) ? video.duration : time
      );
      return true;
    },

    getPlaybackInfo() {
      const video = this.activeVideo?.element;
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
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        paused: video.paused,
        ended: video.ended
      };
    },

    setPlaybackRate(rate) {
      const video = this.activeVideo?.element;
      if (!video) return false;

      video.playbackRate = Math.max(0.25, Math.min(4, Number(rate) || 1));
      return true;
    },

    setPreviewVolume(volume) {
      const video = this.activeVideo?.element;
      if (!video) return false;

      video.volume = Math.max(0, Math.min(1, Number(volume) || 0));
      return true;
    },

    setPreviewMuted(muted) {
      const video = this.activeVideo?.element;
      if (!video) return false;

      video.muted = !!muted;
      return true;
    },

    setCrop(clipId, crop) {
      const project = window.VYORAProject;
      if (!project) return false;

      return project.updateClip(clipId, {
        crop: {
          top: Math.max(0, Number(crop.top) || 0),
          right: Math.max(0, Number(crop.right) || 0),
          bottom: Math.max(0, Number(crop.bottom) || 0),
          left: Math.max(0, Number(crop.left) || 0)
        }
      });
    },

    validCrop(crop = {}) {
      const values = [
        crop.top, crop.right, crop.bottom, crop.left
      ].map(value => Number(value) || 0);

      return values.every(value => value >= 0 && value < 100) &&
        values[0] + values[2] < 100 &&
        values[1] + values[3] < 100;
    },

    resetCrop(clipId) {
      return this.setCrop(clipId, {
        top: 0, right: 0, bottom: 0, left: 0
      });
    },

    getCanvasSize() {
      const project = window.VYORAProject;
      return project?.data?.canvas || {
        width: 1080,
        height: 1920,
        ratio: "9:16"
      };
    },

    createPreviewCanvas(width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width || 1080;
      canvas.height = height || 1920;
      return canvas;
    },

    drawVideoFrame(context, video, width, height, crop = {}) {
      if (!context || !video || video.readyState < 2) return false;

      const top = Math.max(0, Number(crop.top) || 0) / 100;
      const right = Math.max(0, Number(crop.right) || 0) / 100;
      const bottom = Math.max(0, Number(crop.bottom) || 0) / 100;
      const left = Math.max(0, Number(crop.left) || 0) / 100;

      const sx = video.videoWidth * left;
      const sy = video.videoHeight * top;
      const sw = video.videoWidth * (1 - left - right);
      const sh = video.videoHeight * (1 - top - bottom);

      if (sw <= 0 || sh <= 0) return false;

      context.drawImage(
        video,
        sx, sy, sw, sh,
        0, 0, width, height
      );

      return true;
    },

    async loadFiles(files) {
      const results = [];

      for (const file of Array.from(files || [])) {
        try {
          if (this.isVideo(file)) {
            results.push(await this.loadVideo(file));
          } else if (this.isAudio(file)) {
            results.push(await this.loadAudio(file));
          }
        } catch (error) {
          console.error("Could not import:", file.name, error);
        }
      }

      return results;
    },

    stopAudio() {
      if (!this.activeAudio) return;

      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch (_) {}

      this.activeAudio = null;
    },

    async playAudio(assetId, options = {}) {
      const asset = this.assets.get(assetId);
      if (!asset || asset.type !== "audio") {
        throw new Error("Audio asset not found");
      }

      this.stopAudio();

      const audio = new Audio(asset.url);
      audio.volume = Math.max(0, Math.min(
        1, Number(options.volume ?? 1)
      ));

      audio.loop = !!options.loop;
      this.activeAudio = audio;

      try {
        await audio.play();
        return true;
      } catch (error) {
        this.activeAudio = null;
        throw error;
      }
    },

    emit(name, detail = {}) {
      window.dispatchEvent(new CustomEvent("vyora:media-" + name, {
        detail
      }));
    },

    async initialize() {
      if (this.ready) return this.ready;

      this.ready = (async () => {
        await this.openDatabase();
        await this.restoreAssets();
        return true;
      })();

      return this.ready;
    },

    async destroy() {
      this.stopVideo();
      this.stopAudio();

      for (const url of Array.from(this.objectUrls)) {
        this.revokeURL(url);
      }

      this.assets.clear();
      this.activeVideo = null;
      this.activeAudio = null;
      this.previewElement = null;
    }
  };

  window.VYORAMedia = Media;

  Media.initialize()
    .then(() => {
      window.dispatchEvent(new CustomEvent("vyora:media-ready"));
    })
    .catch(error => {
      console.error("VYORA media initialization failed:", error);
      window.dispatchEvent(new CustomEvent("vyora:media-error", {
        detail: { error: error.message }
      }));
    });

})();

