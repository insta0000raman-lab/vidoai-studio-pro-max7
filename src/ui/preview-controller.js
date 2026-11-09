import { store } from "../core/state-store.js";
import { eventBus } from "../core/event-bus.js";
import { notifications } from "../core/notifications.js";

export class PreviewController {
  constructor(options = {}) {
    this.video = options.video ||
      document.querySelector("#previewVideo");

    this.canvas = options.canvas ||
      document.querySelector("#previewCanvas");

    this.previewRenderer = options.previewRenderer || null;
    this.playhead = options.playhead || null;
    this.timeline = options.timeline || null;

    this.playing = false;
    this.currentTime = 0;
    this.animationFrame = null;
    this.lastFrameTime = 0;
    this.destroyed = false;

    this.bind();
  }

  bind() {
    if (this.video) {
      this.video.addEventListener(
        "loadedmetadata",
        () => this.updateDuration()
      );

      this.video.addEventListener(
        "timeupdate",
        () => this.syncFromVideo()
      );

      this.video.addEventListener(
        "ended",
        () => this.pause()
      );
    }

    this.onPlayheadChange = event => {
      const time = event.detail?.time;

      if (Number.isFinite(time)) {
        this.seek(time);
      }
    };

    document.addEventListener(
      "zerox:playhead-seek",
      this.onPlayheadChange
    );
  }

  setVideoSource(url) {
    if (!this.video || !url) return;

    this.pause();

    this.video.src = url;
    this.video.load();
  }

  async play() {
    if (this.destroyed) return;

    try {
      if (this.video) {
        await this.video.play();
      }

      this.playing = true;
      this.lastFrameTime = performance.now();

      store.setPlaying?.(true);

      this.startRenderLoop();

    } catch (error) {
      this.playing = false;

      notifications.error(
        `Playback failed: ${error.message}`
      );
    }
  }

  pause() {
    if (this.video) {
      this.video.pause();
    }

    this.playing = false;

    store.setPlaying?.(false);

    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.renderCurrentFrame();
  }

  togglePlayback() {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(time) {
    const target = Math.max(0, Number(time) || 0);

    this.currentTime = target;

    if (this.video && Number.isFinite(this.video.duration)) {
      this.video.currentTime = Math.min(
        target,
        this.video.duration
      );
    }

    this.playhead?.seek?.(target);

    this.renderCurrentFrame();

    document.dispatchEvent(
      new CustomEvent("zerox:preview-time-changed", {
        detail: { time: target }
      })
    );
  }

  stepFrames(count = 1) {
    const fps = this.getFPS();

    this.pause();

    this.seek(
      this.currentTime + Number(count) / fps
    );
  }

  getFPS() {
    const project = store.getState()?.project;

    return Math.max(
      1,
      Number(
        project?.settings?.fps ||
        project?.fps ||
        30
      )
    );
  }

  startRenderLoop() {
    if (!this.playing || this.destroyed) return;

    const render = now => {
      if (!this.playing || this.destroyed) return;

      const delta = Math.max(
        0,
        (now - this.lastFrameTime) / 1000
      );

      this.lastFrameTime = now;

      if (this.video) {
        this.currentTime = this.video.currentTime;
      } else {
        this.currentTime += delta;
      }

      this.syncTimeline();
      this.renderCurrentFrame();

      this.animationFrame =
        requestAnimationFrame(render);
    };

    this.animationFrame =
      requestAnimationFrame(render);
  }

  syncFromVideo() {
    if (!this.video) return;

    this.currentTime = this.video.currentTime;
    this.syncTimeline();
  }

  syncTimeline() {
    this.timeline?.seek?.(this.currentTime);

    this.playhead?.seek?.(this.currentTime);

    document.dispatchEvent(
      new CustomEvent("zerox:preview-time-changed", {
        detail: { time: this.currentTime }
      })
    );
  }

  renderCurrentFrame() {
    if (!this.previewRenderer) return;

    try {
      this.previewRenderer.render(
        this.currentTime
      );
    } catch (error) {
      notifications.error(
        `Preview rendering error: ${error.message}`
      );
    }
  }

  updateDuration() {
    if (!this.video) return;

    document.dispatchEvent(
      new CustomEvent("zerox:preview-duration", {
        detail: {
          duration: this.video.duration
        }
      })
    );
  }

  setRenderer(renderer) {
    this.previewRenderer = renderer;
    this.renderCurrentFrame();
  }

  getCurrentTime() {
    return this.currentTime;
  }

  isPlaying() {
    return this.playing;
  }

  destroy() {
    this.pause();
    this.destroyed = true;

    document.removeEventListener(
      "zerox:playhead-seek",
      this.onPlayheadChange
    );
  }
}

export default PreviewController;
