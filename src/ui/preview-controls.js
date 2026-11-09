import { notifications } from "../core/notifications.js";

export class PreviewControls {
  constructor(options = {}) {
    this.controller = options.controller || null;

    this.video =
      options.video || document.querySelector("#previewVideo");

    this.playButton =
      document.querySelector("#playButton");

    this.timeDisplay =
      document.querySelector("#currentTime");

    this.durationDisplay =
      document.querySelector("#durationTime");

    this.muteButton =
      document.querySelector("#muteButton");

    this.playhead =
      options.playhead || null;

    this.bind();
  }

  bind() {
    this.playButton?.addEventListener("click", () => {
      this.togglePlayback();
    });

    this.muteButton?.addEventListener("click", () => {
      this.toggleMute();
    });

    this.video?.addEventListener("timeupdate", () => {
      this.updateTime();
    });

    this.video?.addEventListener("loadedmetadata", () => {
      this.updateDuration();
    });

    this.video?.addEventListener("ended", () => {
      this.updatePlayButton(false);
    });

    document.addEventListener(
      "zerox:preview-time-changed",
      event => {
        this.updateTime(event.detail?.time);
      }
    );
  }

  async togglePlayback() {
    if (this.controller) {
      if (this.controller.isPlaying()) {
        this.controller.pause();
      } else {
        await this.controller.play();
      }

      this.updatePlayButton(this.controller.isPlaying());
      return;
    }

    if (!this.video) {
      notifications.warning("Preview video is unavailable.");
      return;
    }

    try {
      if (this.video.paused) {
        await this.video.play();
      } else {
        this.video.pause();
      }

      this.updatePlayButton(!this.video.paused);
    } catch (error) {
      notifications.error(error.message);
    }
  }

  toggleMute() {
    if (!this.video) return;

    this.video.muted = !this.video.muted;

    if (this.muteButton) {
      this.muteButton.textContent =
        this.video.muted ? "Unmute" : "Mute";
    }
  }

  updatePlayButton(playing) {
    if (!this.playButton) return;

    this.playButton.textContent =
      playing ? "Pause" : "Play";

    this.playButton.setAttribute(
      "aria-label",
      playing ? "Pause preview" : "Play preview"
    );
  }

  updateTime(time) {
    if (Number.isFinite(time) && this.timeDisplay) {
      this.timeDisplay.textContent =
        this.formatTime(time);
    }
  }

  updateDuration() {
    if (!this.video || !this.durationDisplay) return;

    this.durationDisplay.textContent =
      this.formatTime(this.video.duration);
  }

  formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    const frames = Math.floor(
      (seconds % 1) * 30
    );

    return [
      String(minutes).padStart(2, "0"),
      String(remaining).padStart(2, "0"),
      String(frames).padStart(2, "0")
    ].join(":");
  }

  seek(time) {
    if (this.controller) {
      this.controller.seek(time);
    } else if (this.video) {
      this.video.currentTime = Math.max(0, time);
    }
  }

  destroy() {
    // Event listeners are cleaned up when the controller
    // and its DOM are destroyed by the application.
  }
}

export default PreviewControls;
