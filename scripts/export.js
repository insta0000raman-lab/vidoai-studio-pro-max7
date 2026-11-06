(function () {
  "use strict";

  class VYORAExporter {
    constructor() {
      this.recording = false;
      this.cancelled = false;
      this.canvas = null;
      this.ctx = null;
      this.audioContext = null;
      this.audioDestination = null;
      this.videoElements = new Map();
      this.audioSources = [];
      this.animationFrame = null;
      this.lastProgress = 0;
    }

    emit(name, detail = {}) {
      window.dispatchEvent(
        new CustomEvent("vyora:" + name, { detail })
      );
    }

    getProject() {
      if (!window.VYORAProject) {
        throw new Error("Project system is not loaded.");
      }

      return window.VYORAProject.state;
    }

    getSettings() {
      const project = this.getProject();
      return project.settings || {};
    }

    getDimensions() {
      const settings = this.getSettings();

      const width = Math.max(
        240,
        Number(settings.width || settings.canvasWidth || 1080)
      );

      const height = Math.max(
        240,
        Number(settings.height || settings.canvasHeight || 1920)
      );

      return { width, height };
    }

    getFPS() {
      const settings = this.getSettings();
      const fps = Number(settings.fps || 30);

      return Math.min(60, Math.max(12, fps));
    }

    getBitrate() {
      const settings = this.getSettings();
      const bitrate = Number(settings.bitrate || 12000000);

      return Math.min(
        50000000,
        Math.max(1000000, bitrate)
      );
    }

    getDuration() {
      const project = this.getProject();
      let duration = 0;

      for (const track of project.tracks || []) {
        for (const clip of track.clips || []) {
          const end = Number(clip.start || 0) +
            Number(clip.duration || 0);

          if (Number.isFinite(end)) {
            duration = Math.max(duration, end);
          }
        }
      }

      for (const layer of project.textLayers || []) {
        duration = Math.max(
          duration,
          Number(layer.start || 0) +
          Number(layer.duration || 0)
        );
      }

      return duration;
    }

    getAsset(assetId) {
      if (!window.VYORAMedia) return null;

      try {
        return window.VYORAMedia.getAsset(assetId);
      } catch (error) {
        return null;
      }
    }

    getAssetFile(assetId) {
      const asset = this.getAsset(assetId);

      if (!asset) return null;

      return asset.file || asset.originalFile || null;
    }

    async createVideoElement(assetId) {
      if (this.videoElements.has(assetId)) {
        return this.videoElements.get(assetId);
      }

      const asset = this.getAsset(assetId);
      if (!asset) {
        throw new Error("Video asset not found: " + assetId);
      }

      const url = asset.url || asset.objectUrl ||
        (asset.file ? URL.createObjectURL(asset.file) : null);

      if (!url) {
        throw new Error("Video file URL is unavailable.");
      }

      const video = document.createElement("video");

      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(
          new Error("Could not load video: " + asset.name)
        );

        video.load();
      });

      this.videoElements.set(assetId, video);

      return video;
    }

    async createCanvas() {
      const dimensions = this.getDimensions();

      this.canvas = document.createElement("canvas");
      this.canvas.width = dimensions.width;
      this.canvas.height = dimensions.height;

      this.ctx = this.canvas.getContext("2d", {
        alpha: false,
        desynchronized: true
      });

      if (!this.ctx) {
        throw new Error("Canvas rendering is not supported.");
      }
    }

    async prepareVideos() {
      const project = this.getProject();

      for (const track of project.tracks || []) {
        if (track.type !== "video") continue;

        for (const clip of track.clips || []) {
          if (!clip.source) continue;

          await this.createVideoElement(clip.source);
        }
      }
    }

    async prepareAudio() {
      const project = this.getProject();

      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      this.audioContext = new AudioContextClass();
      this.audioDestination =
        this.audioContext.createMediaStreamDestination();

      const masterGain = this.audioContext.createGain();
      masterGain.gain.value = 1;

      masterGain.connect(this.audioDestination);

      for (const track of project.tracks || []) {
        if (track.type !== "audio") continue;
        if (track.muted || track.enabled === false) continue;

        for (const clip of track.clips || []) {
          await this.prepareAudioClip(clip, masterGain);
        }
      }
    }

    async prepareAudioClip(clip, masterGain) {
      const file = this.getAssetFile(clip.source);

      if (!file) return;

      const arrayBuffer = await file.arrayBuffer();

      const audioBuffer =
        await this.audioContext.decodeAudioData(arrayBuffer);

      const source = this.audioContext.createBufferSource();
      const gain = this.audioContext.createGain();

      source.buffer = audioBuffer;
      source.playbackRate.value = Math.max(
        0.25,
        Math.min(4, Number(clip.speed || 1))
      );

      const metadata = clip.metadata || {};

      const volume = Math.max(
        0,
        Math.min(2, Number(metadata.volume ?? clip.volume ?? 1))
      );

      const muted = clip.muted === true;

      gain.gain.value = muted ? 0 : volume;

      const fadeIn = Math.max(0, Number(metadata.fadeIn || 0));
      const fadeOut = Math.max(0, Number(metadata.fadeOut || 0));

      const clipDuration = Number(clip.duration || 0);
      const clipStart = Number(clip.start || 0);

      const now = this.audioContext.currentTime;

      if (fadeIn > 0) {
        gain.gain.setValueAtTime(0, now + clipStart);
        gain.gain.linearRampToValueAtTime(
          muted ? 0 : volume,
          now + clipStart + fadeIn
        );
      }

      if (fadeOut > 0 && clipDuration > fadeOut) {
        gain.gain.setValueAtTime(
          muted ? 0 : volume,
          now + clipStart + clipDuration - fadeOut
        );

        gain.gain.linearRampToValueAtTime(
          0,
          now + clipStart + clipDuration
        );
      }

      source.connect(gain);
      gain.connect(masterGain);

      this.audioSources.push({
        source,
        clip,
        clipStart,
        clipDuration
      });
    }

    startAudio() {
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;

      for (const item of this.audioSources) {
        const clip = item.clip;
        const sourceStart = Math.max(
          0,
          Number(clip.sourceStart || 0)
        );

        const when = now + item.clipStart;

        item.source.start(
          when,
          sourceStart,
          item.clipDuration
        );
      }
    }

    getActiveVideo(time) {
      const project = this.getProject();
      const active = [];

      for (const track of project.tracks || []) {
        if (track.type !== "video") continue;
        if (track.muted || track.enabled === false) continue;

        for (const clip of track.clips || []) {
          const start = Number(clip.start || 0);
          const duration = Number(clip.duration || 0);

          if (time >= start && time < start + duration) {
            active.push({ track, clip });
          }
        }
      }

      return active;
    }

    drawBackground() {
      const settings = this.getSettings();

      this.ctx.fillStyle = settings.background || "#000000";
      this.ctx.fillRect(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
    }

    async drawVideoClip(clip, time) {
      const video = this.videoElements.get(clip.source);
      if (!video) return;

      const start = Number(clip.start || 0);
      const speed = Math.max(
        0.25,
        Math.min(4, Number(clip.speed || 1))
      );

      const sourceStart = Number(clip.sourceStart || 0);
      const targetTime = sourceStart + (time - start) * speed;

      if (
        Math.abs(video.currentTime - targetTime) > 0.15 &&
        !video.seeking
      ) {
        try {
          video.currentTime = Math.min(
            targetTime,
            Math.max(0, video.duration - 0.05)
          );
        } catch (error) {
          // The next frame will try again.
        }
      }

      if (video.readyState < 2) return;

      const crop = clip.crop || {};
      const top = Math.max(0, Math.min(90, Number(crop.top || 0)));
      const bottom = Math.max(0, Math.min(90, Number(crop.bottom || 0)));
      const left = Math.max(0, Math.min(90, Number(crop.left || 0)));
      const right = Math.max(0, Math.min(90, Number(crop.right || 0)));

      const sx = video.videoWidth * left / 100;
      const sy = video.videoHeight * top / 100;

      const sw = video.videoWidth * (100 - left - right) / 100;
      const sh = video.videoHeight * (100 - top - bottom) / 100;

      if (sw <= 0 || sh <= 0) return;

      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;

      const scale = Math.max(
        canvasWidth / sw,
        canvasHeight / sh
      );

      const dw = sw * scale;
      const dh = sh * scale;

      const dx = (canvasWidth - dw) / 2;
      const dy = (canvasHeight - dh) / 2;

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(
        0,
        Math.min(1, Number(clip.opacity ?? 1))
      );

      this.ctx.drawImage(
        video,
        sx, sy, sw, sh,
        dx, dy, dw, dh
      );

      this.ctx.restore();
    }

    getEffects(clipId) {
      const project = this.getProject();

      return (project.effects || []).filter(effect =>
        effect.enabled !== false &&
        (!effect.clipId || effect.clipId === clipId)
      );
    }

    applyEffects(clipId) {
      const effects = this.getEffects(clipId);

      let brightness = 100;
      let contrast = 100;
      let saturation = 100;
      let blur = 0;
      let grayscale = 0;
      let sepia = 0;

      for (const effect of effects) {
        const value = Number(effect.value ?? 100);

        switch (effect.type) {
          case "brightness":
            brightness = value;
            break;

          case "contrast":
            contrast = value;
            break;

          case "saturation":
            saturation = value;
            break;

          case "blur":
            blur = Math.max(0, Math.min(20, value));
            break;

          case "warmth":
            sepia = Math.max(0, Math.min(100, value));
            break;

          case "grayscale":
            grayscale = Math.max(0, Math.min(100, value));
            break;
        }
      }

      this.ctx.filter =
        `brightness(${brightness}%) ` +
        `contrast(${contrast}%) ` +
        `saturate(${saturation}%) ` +
        `blur(${blur}px) ` +
        `grayscale(${grayscale}%) ` +
        `sepia(${sepia}%)`;
    }

    drawText(time) {
      const project = this.getProject();

      for (const layer of project.textLayers || []) {
        const start = Number(layer.start || 0);
        const duration = Number(layer.duration || 0);

        if (time < start || time >= start + duration) continue;

        const x = this.canvas.width *
          Number(layer.x ?? 50) / 100;

        const y = this.canvas.height *
          Number(layer.y ?? 50) / 100;

        const fontSize = Math.max(
          10,
          Number(layer.fontSize || 48)
        );

        const style = layer.style || "clean";
        const text = String(layer.text || "");

        this.ctx.save();

        this.ctx.globalAlpha = Math.max(
          0,
          Math.min(1, Number(layer.opacity ?? 100) / 100)
        );

        this.ctx.translate(x, y);
        this.ctx.rotate(
          Number(layer.rotation || 0) * Math.PI / 180
        );

        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.font =
          `bold ${fontSize}px Arial, sans-serif`;

        if (style === "neon") {
          this.ctx.shadowColor = layer.color || "#00eaff";
          this.ctx.shadowBlur = 24;
        }

        if (style === "outline") {
          this.ctx.lineWidth = Math.max(2, fontSize / 12);
          this.ctx.strokeStyle = "#000000";
          this.ctx.strokeText(text, 0, 0);
        }

        if (style === "cinematic") {
          this.ctx.shadowColor = "rgba(0,0,0,0.8)";
          this.ctx.shadowBlur = 8;
        }

        this.ctx.fillStyle = layer.color || "#ffffff";
        this.ctx.fillText(text, 0, 0);

        this.ctx.restore();
      }
    }

    async renderFrame(time) {
      this.drawBackground();

      const activeVideos = this.getActiveVideo(time);

      for (const item of activeVideos) {
        this.applyEffects(item.clip.id);
        await this.drawVideoClip(item.clip, time);
      }

      this.ctx.filter = "none";
      this.drawText(time);
    }

    getMimeType() {
      if (!window.MediaRecorder) {
        throw new Error("This browser does not support video recording.");
      }

      const types = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];

      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      }

      if (MediaRecorder.isTypeSupported("video/mp4")) {
        return "video/mp4";
      }

      throw new Error("No supported export format found.");
    }

    async export(options = {}) {
      if (this.recording) {
        throw new Error("Export is already running.");
      }

      this.recording = true;
      this.cancelled = false;
      this.lastProgress = 0;

      let recorder = null;
      let stream = null;

      try {
        const duration = this.getDuration();

        if (duration <= 0) {
          throw new Error("Your timeline is empty.");
        }

        const dimensions = this.getDimensions();
        const fps = this.getFPS();
        const bitrate = this.getBitrate();

        if (
          dimensions.width > 1920 ||
          dimensions.height > 1920
        ) {
          this.emit("export-warning", {
            message: "High resolution export may be slow or fail on mobile."
          });
        }

        await this.createCanvas();
        await this.prepareVideos();
        await this.prepareAudio();

        const mimeType = this.getMimeType();

        const videoStream = this.canvas.captureStream(fps);
        const tracks = [...videoStream.getVideoTracks()];

        if (this.audioDestination) {
          const audioTracks =
            this.audioDestination.stream.getAudioTracks();

          tracks.push(...audioTracks);
        }

        stream = new MediaStream(tracks);

        recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: bitrate
        });

        const chunks = [];

        recorder.ondataavailable = event => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        const stopped = new Promise((resolve, reject) => {
          recorder.onstop = resolve;
          recorder.onerror = event => reject(
            event.error || new Error("Recording failed.")
          );
        });

        await this.renderFrame(0);

        if (this.audioContext &&
            this.audioContext.state === "suspended") {
          await this.audioContext.resume();
        }

        recorder.start(1000);
        this.startAudio();

        const startTime = performance.now();
        const frameInterval = 1000 / fps;

        let frameCount = 0;

        while (!this.cancelled) {
          const elapsed = (performance.now() - startTime) / 1000;

          if (elapsed >= duration) break;

          const frameTime = Math.min(elapsed, duration);

          await this.renderFrame(frameTime);

          frameCount++;

          const progress = Math.min(
            99,
            Math.round(frameTime / duration * 100)
          );

          if (progress !== this.lastProgress) {
            this.lastProgress = progress;

            this.emit("export-progress", {
              progress,
              currentTime: frameTime,
              duration,
              frameCount
            });
          }

          const nextFrame = startTime +
            frameCount * frameInterval;

          const wait = nextFrame - performance.now();

          if (wait > 0) {
            await new Promise(resolve =>
              setTimeout(resolve, wait)
            );
          } else {
            await new Promise(resolve =>
              requestAnimationFrame(resolve)
            );
          }
        }

        if (recorder.state !== "inactive") {
          recorder.stop();
        }

        await stopped;

        if (this.cancelled) {
          throw new Error("Export cancelled.");
        }

        const blob = new Blob(chunks, { type: mimeType });

        if (!blob.size) {
          throw new Error("Export file is empty.");
        }

        const extension = mimeType.includes("mp4")
          ? "mp4"
          : "webm";

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = options.filename ||
          `VYORA-Export-${Date.now()}.${extension}`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 60000);

        this.emit("export-complete", {
          blob,
          size: blob.size,
          mimeType,
          extension
        });

        return {
          success: true,
          blob,
          size: blob.size,
          mimeType,
          extension
        };

      } catch (error) {
        this.emit("export-error", {
          message: error.message || "Export failed."
        });

        throw error;

      } finally {
        this.recording = false;

        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        this.cleanup();
      }
    }

    cancel() {
      this.cancelled = true;

      this.emit("export-cancelled");
    }

    cleanup() {
      for (const item of this.audioSources) {
        try {
          item.source.stop();
        } catch (error) {
          // Already stopped.
        }
      }

      this.audioSources = [];

      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }

      this.audioDestination = null;

      for (const video of this.videoElements.values()) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }

      this.videoElements.clear();

      this.canvas = null;
      this.ctx = null;
    }
  }

  window.VYORAExporter = new VYORAExporter();

})();
