
(() => {
  "use strict";

  const Media = {
    assets: new Map(),
    activeVideo: null,
    activeAudio: null,
    previewElement: null,
    objectUrls: new Set(),

    createId() {
      return (
        "media_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8)
      );
    },

    isVideo(file) {
      return Boolean(
        file &&
        (
          file.type.startsWith("video/") ||
          /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name)
        )
      );
    },

    isAudio(file) {
      return Boolean(
        file &&
        (
          file.type.startsWith("audio/") ||
          /\.(mp3|wav|aac|m4a|ogg|flac|opus)$/i.test(file.name)
        )
      );
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
      if (!Number.isFinite(seconds) || seconds < 0) {
        seconds = 0;
      }

      const minutes = Math.floor(seconds / 60);
      const remaining = Math.floor(seconds % 60);
      const centiseconds = Math.floor((seconds % 1) * 100);

      return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(remaining).padStart(2, "0") +
        "." +
        String(centiseconds).padStart(2, "0")
      );
    },

    formatFileSize(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
      }

      const units = ["B", "KB", "MB", "GB"];
      const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
      );

      return (
        (bytes / Math.pow(1024, index)).toFixed(2) +
        " " +
        units[index]
      );
    },

    loadVideo(file) {
      return new Promise((resolve, reject) => {
        if (!this.isVideo(file)) {
          reject(new Error("Please select a valid video file."));
          return;
        }

        const url = this.createURL(file);
        const video = document.createElement("video");

        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;

        let completed = false;

        const cleanupListeners = () => {
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("error", onError);
        };

        const onLoaded = () => {
          if (completed) return;
          completed = true;

          cleanupListeners();

          if (
            !Number.isFinite(video.duration) ||
            video.duration <= 0
          ) {
            this.revokeURL(url);
            reject(new Error("Video duration could not be read."));
            return;
          }

          const asset = {
            id: this.createId(),
            type: "video",
            name: file.name,
            size: file.size,
            sizeText: this.formatFileSize(file.size),
            mimeType: file.type || "video/unknown",
            url,
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            aspectRatio:
              video.videoWidth / video.videoHeight,
            lastModified: file.lastModified,
            file
          };

          this.assets.set(asset.id, asset);

          resolve({ ...asset });
        };

        const onError = () => {
          if (completed) return;
          completed = true;

          cleanupListeners();
          this.revokeURL(url);

          reject(
            new Error(
              "Video could not be opened. Try another video format."
            )
          );
        };

        video.addEventListener("loadedmetadata", onLoaded);
        video.addEventListener("error", onError);

        video.src = url;
        video.load();
      });
    },

    loadAudio(file) {
      return new Promise((resolve, reject) => {
        if (!this.isAudio(file)) {
          reject(new Error("Please select a valid audio file."));
          return;
        }

        const url = this.createURL(file);
        const audio = document.createElement("audio");

        audio.preload = "metadata";

        let completed = false;

        const cleanupListeners = () => {
          audio.removeEventListener("loadedmetadata", onLoaded);
          audio.removeEventListener("error", onError);
        };

        const onLoaded = () => {
          if (completed) return;
          completed = true;

          cleanupListeners();

          const asset = {
            id: this.createId(),
            type: "audio",
            name: file.name,
            size: file.size,
            sizeText: this.formatFileSize(file.size),
            mimeType: file.type || "audio/unknown",
            url,
            duration: Number.isFinite(audio.duration)
              ? audio.duration
              : 0,
            lastModified: file.lastModified,
            file
          };

          this.assets.set(asset.id, asset);

          resolve({ ...asset });
        };

        const onError = () => {
          if (completed) return;
          completed = true;

          cleanupListeners();
          this.revokeURL(url);

          reject(
            new Error(
              "Audio could not be opened. Try another audio file."
            )
          );
        };

        audio.addEventListener("loadedmetadata", onLoaded);
        audio.addEventListener("error", onError);

        audio.src = url;
        audio.load();
      });
    },

    getAsset(id) {
      const asset = this.assets.get(id);
      return asset ? { ...asset } : null;
    },

    getAllAssets() {
      return Array.from(this.assets.values()).map(asset => ({
        ...asset
      }));
    },

    removeAsset(id) {
      const asset = this.assets.get(id);
      if (!asset) return false;

      if (this.activeVideo?.assetId === id) {
        this.stopVideo();
      }

      if (this.activeAudio?.assetId === id) {
        this.stopAudio();
      }

      this.revokeURL(asset.url);
      this.assets.delete(id);

      this.emit("asset-removed", { id });

      return true;
    },

    attachPreview(element) {
      if (!(element instanceof HTMLVideoElement)) {
        throw new Error("Preview needs a video element.");
      }

      this.previewElement = element;

      element.playsInline = true;
      element.preload = "auto";
      element.controls = false;

      return element;
    },

    async openVideo(assetId, videoElement) {
      const asset = this.assets.get(assetId);

      if (!asset || asset.type !== "video") {
        throw new Error("Video asset not found.");
      }

      const video = videoElement || this.previewElement;

      if (!(video instanceof HTMLVideoElement)) {
        throw new Error("Video preview element is missing.");
      }

      this.previewElement = video;

      video.pause();
      video.removeAttribute("src");
      video.load();

      video.src = asset.url;
      video.muted = true;
      video.playsInline = true;

      await new Promise((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };

        const onError = () => {
          cleanup();
          reject(new Error("Unable to load video preview."));
        };

        const cleanup = () => {
          video.removeEventListener("loadedmetadata", onReady);
          video.removeEventListener("error", onError);
        };

        video.addEventListener("loadedmetadata", onReady, {
          once: true
        });

        video.addEventListener("error", onError, {
          once: true
        });

        video.load();
      });

      this.activeVideo = {
        assetId,
        element: video
      };

      this.emit("video-opened", {
        assetId,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight
      });

      return video;
    },

    playVideo() {
      const video = this.previewElement;

      if (!video || !video.src) return false;

      const promise = video.play();

      if (promise && typeof promise.catch === "function") {
        promise.catch(error => {
          this.emit("playback-error", {
            message: error.message
          });
        });
      }

      return true;
    },

    pauseVideo() {
      if (!this.previewElement) return false;

      this.previewElement.pause();
      return true;
    },

    togglePlayback() {
      if (!this.previewElement) return false;

      if (this.previewElement.paused) {
        return this.playVideo();
      }

      return this.pauseVideo();
    },

    stopVideo() {
      if (!this.previewElement) return false;

      this.previewElement.pause();

      try {
        this.previewElement.currentTime = 0;
      } catch {}

      this.activeVideo = null;
      return true;
    },

    seek(time) {
      const video = this.previewElement;

      if (!video || !Number.isFinite(Number(time))) {
        return false;
      }

      const duration = Number.isFinite(video.duration)
        ? video.duration
        : 0;

      const target = Math.max(
        0,
        Math.min(Number(time), duration)
      );

      try {
        video.currentTime = target;
        this.emit("seek", { time: target });
        return true;
      } catch {
        return false;
      }
    },

    getPlaybackInfo() {
      const video = this.previewElement;

      if (!video) return null;

      return {
        currentTime: video.currentTime || 0,
        duration: Number.isFinite(video.duration)
          ? video.duration
          : 0,
        paused: video.paused,
        ended: video.ended,
        muted: video.muted,
        volume: video.volume,
        playbackRate: video.playbackRate,
        width: video.videoWidth,
        height: video.videoHeight
      };
    },

    setPlaybackRate(rate) {
      if (!this.previewElement) return false;

      const value = Number(rate);

      if (!Number.isFinite(value) || value < 0.25 || value > 4) {
        return false;
      }

      this.previewElement.playbackRate = value;
      return true;
    },

    setPreviewVolume(volume) {
      if (!this.previewElement) return false;

      const value = Number(volume);

      if (!Number.isFinite(value)) return false;

      this.previewElement.volume = Math.max(
        0,
        Math.min(1, value)
      );

      return true;
    },

    setPreviewMuted(muted) {
      if (!this.previewElement) return false;

      this.previewElement.muted = Boolean(muted);
      return true;
    },

    setCrop(element, crop = {}) {
      if (!element) return false;

      const top = this.validCrop(crop.top);
      const bottom = this.validCrop(crop.bottom);
      const left = this.validCrop(crop.left);
      const right = this.validCrop(crop.right);

      element.style.objectFit = "cover";
      element.style.clipPath =
        `inset(${top}% ${right}% ${bottom}% ${left}%)`;

      return true;
    },

    validCrop(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return 0;

      return Math.max(0, Math.min(95, number));
    },

    resetCrop(element) {
      if (!element) return false;

      element.style.clipPath = "none";
      element.style.objectFit = "contain";

      return true;
    },

    getCanvasSize(width, height, maxSize = 4096) {
      let w = Math.max(1, Number(width) || 1080);
      let h = Math.max(1, Number(height) || 1920);

      const largest = Math.max(w, h);

      if (largest > maxSize) {
        const scale = maxSize / largest;
        w *= scale;
        h *= scale;
      }

      return {
        width: Math.round(w),
        height: Math.round(h)
      };
    },

    createPreviewCanvas(width, height) {
      const size = this.getCanvasSize(width, height);

      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;

      const context = canvas.getContext("2d", {
        alpha: false
      });

      if (!context) {
        throw new Error("Canvas rendering is not supported.");
      }

      return {
        canvas,
        context,
        width: size.width,
        height: size.height
      };
    },

    drawVideoFrame(canvas, options = {}) {
      const video = options.video || this.previewElement;

      if (
        !video ||
        !canvas ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return false;
      }

      const context = canvas.getContext("2d");
      if (!context) return false;

      const width = canvas.width;
      const height = canvas.height;

      const crop = options.crop || {};

      const top = this.validCrop(crop.top) / 100;
      const bottom = this.validCrop(crop.bottom) / 100;
      const left = this.validCrop(crop.left) / 100;
      const right = this.validCrop(crop.right) / 100;

      const sourceX = video.videoWidth * left;
      const sourceY = video.videoHeight * top;

      const sourceWidth =
        video.videoWidth * (1 - left - right);

      const sourceHeight =
        video.videoHeight * (1 - top - bottom);

      if (sourceWidth <= 0 || sourceHeight <= 0) {
        return false;
      }

      context.fillStyle = options.background || "#000000";
      context.fillRect(0, 0, width, height);

      const scale = Math.min(
        width / sourceWidth,
        height / sourceHeight
      );

      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;

      const x = (width - drawWidth) / 2;
      const y = (height - drawHeight) / 2;

      context.drawImage(
        video,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        x,
        y,
        drawWidth,
        drawHeight
      );

      return true;
    },

    async loadFiles(files) {
      const results = [];

      for (const file of Array.from(files || [])) {
        try {
          let asset;

          if (this.isVideo(file)) {
            asset = await this.loadVideo(file);
          } else if (this.isAudio(file)) {
            asset = await this.loadAudio(file);
          } else {
            results.push({
              success: false,
              fileName: file.name,
              error: "Unsupported media type."
            });

            continue;
          }

          results.push({
            success: true,
            asset
          });
        } catch (error) {
          results.push({
            success: false,
            fileName: file.name,
            error: error.message
          });
        }
      }

      this.emit("files-loaded", {
        count: results.filter(item => item.success).length,
        results
      });

      return results;
    },

    stopAudio() {
      if (!this.activeAudio) return false;

      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch {}

      this.activeAudio = null;
      return true;
    },

    playAudio(assetId, options = {}) {
      const asset = this.assets.get(assetId);

      if (!asset || asset.type !== "audio") {
        throw new Error("Audio asset not found.");
      }

      this.stopAudio();

      const audio = new Audio(asset.url);

      audio.volume = Math.max(
        0,
        Math.min(1, Number(options.volume ?? 1))
      );

      audio.loop = Boolean(options.loop);
      audio.currentTime = Math.max(
        0,
        Number(options.startTime) || 0
      );

      this.activeAudio = audio;
      audio.play().catch(error => {
        this.emit("audio-playback-error", {
          message: error.message
        });
      });

      return audio;
    },

    emit(name, detail = {}) {
      window.dispatchEvent(
        new CustomEvent("vyora:media-" + name, {
          detail
        })
      );
    },

    destroy() {
      this.stopVideo();
      this.stopAudio();

      this.assets.forEach(asset => {
        this.revokeURL(asset.url);
      });

      this.assets.clear();

      this.objectUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });

      this.objectUrls.clear();

      this.previewElement = null;
      this.activeVideo = null;
      this.activeAudio = null;

      this.emit("destroyed");
    }
  };

  window.VYORAMedia = Media;

  window.dispatchEvent(
    new CustomEvent("vyora:media-ready", {
      detail: { media: Media }
    })
  );

})();
          
