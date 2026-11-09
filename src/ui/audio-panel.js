import { audioEngine } from "../audio/audio-engine.js";
import { audioMixer } from "../audio/mixer.js";
import { audioFades } from "../audio/fades.js";
import { projectManager } from "../project/project-manager.js";
import { notifications } from "../core/notifications.js";

export class AudioPanel {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.querySelector('[data-panel-content="audio"]');

    this.selectedTrackId = null;
    this.initialized = false;

    this.bind();
    this.render();
  }

  bind() {
    if (!this.container) return;

    this.container.addEventListener("click", event => {
      const button = event.target.closest("[data-audio-action]");

      if (!button) return;

      const action = button.dataset.audioAction;
      const trackId = button.dataset.trackId;

      if (action === "select") {
        this.selectTrack(trackId);
      }

      if (action === "mute") {
        this.toggleMute(trackId);
      }

      if (action === "solo") {
        this.toggleSolo(trackId);
      }

      if (action === "fade-in") {
        this.applyFade(trackId, "in");
      }

      if (action === "fade-out") {
        this.applyFade(trackId, "out");
      }
    });

    this.container.addEventListener("input", event => {
      const input = event.target.closest("[data-audio-volume]");

      if (!input) return;

      this.setVolume(
        input.dataset.trackId,
        Number(input.value)
      );
    });
  }

  async initialize() {
    if (this.initialized) return true;

    try {
      await audioEngine.initialize();
      this.initialized = true;
      return true;
    } catch (error) {
      notifications.error(
        `Audio engine unavailable: ${error.message}`
      );
      return false;
    }
  }

  getTracks() {
    const project = projectManager.currentProject;

    return (project?.tracks || []).filter(
      track => track.type === "audio"
    );
  }

  getTrack(trackId) {
    return this.getTracks().find(
      track => track.id === trackId
    );
  }

  selectTrack(trackId) {
    this.selectedTrackId = trackId;
    this.render();
  }

  async toggleMute(trackId) {
    const track = this.getTrack(trackId);

    if (!track) return;

    const ready = await this.initialize();
    if (!ready) return;

    track.muted = !track.muted;

    audioMixer.setMute(trackId, track.muted);

    this.notifyChange();
    this.render();
  }

  async toggleSolo(trackId) {
    const track = this.getTrack(trackId);

    if (!track) return;

    const ready = await this.initialize();
    if (!ready) return;

    track.solo = !track.solo;

    audioMixer.setSolo(trackId, track.solo);

    this.notifyChange();
    this.render();
  }

  async setVolume(trackId, value) {
    const track = this.getTrack(trackId);

    if (!track) return;

    const ready = await this.initialize();
    if (!ready) return;

    const volume = Math.max(
      0,
      Math.min(2, Number(value))
    );

    track.volume = volume;

    audioMixer.setVolume(trackId, volume);

    document.dispatchEvent(
      new CustomEvent("zerox:audio-volume-changed", {
        detail: { trackId, volume }
      })
    );

    this.notifyChange(false);
  }

  async applyFade(trackId, direction) {
    const track = this.getTrack(trackId);

    if (!track) return;

    const ready = await this.initialize();
    if (!ready) return;

    const clip = (track.clips || []).find(
      item => item.id === track.clips?.[0]?.id
    );

    if (!clip) {
      notifications.warning("Add an audio clip first.");
      return;
    }

    const duration = Math.min(
      3,
      Number(clip.duration || 3)
    );

    try {
      if (direction === "in") {
        audioFades.fadeIn(trackId, duration);
        clip.fadeIn = duration;
      } else {
        audioFades.fadeOut(trackId, duration);
        clip.fadeOut = duration;
      }

      this.notifyChange();
      notifications.success(`Fade ${direction} applied.`);

    } catch (error) {
      notifications.error(error.message);
    }
  }

  notifyChange(render = true) {
    projectManager.updateProject?.({
      updatedAt: Date.now()
    });

    document.dispatchEvent(
      new CustomEvent("zerox:audio-track-changed", {
        detail: {
          trackId: this.selectedTrackId
        }
      })
    );

    if (render) this.render();
  }

  render() {
    if (!this.container) return;

    const tracks = this.getTracks();

    this.container.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Audio Studio";
    this.container.appendChild(heading);

    if (!tracks.length) {
      const empty = document.createElement("p");
      empty.className = "empty-message";
      empty.textContent = "Add an audio track to begin.";
      this.container.appendChild(empty);
      return;
    }

    tracks.forEach(track => {
      this.container.appendChild(
        this.createTrackCard(track)
      );
    });
  }

  createTrackCard(track) {
    const card = document.createElement("section");
    card.className = "audio-track-card";

    const select = document.createElement("button");
    select.dataset.audioAction = "select";
    select.dataset.trackId = track.id;
    select.textContent = track.name || "Audio Track";

    const volumeLabel = document.createElement("label");
    volumeLabel.textContent = "Volume";

    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = 0;
    volume.max = 2;
    volume.step = 0.01;
    volume.value = track.volume ?? 1;
    volume.dataset.audioVolume = "true";
    volume.dataset.trackId = track.id;

    volumeLabel.appendChild(volume);

    const controls = document.createElement("div");
    controls.className = "audio-controls";

    controls.append(
      this.createButton(
        "mute",
        track.id,
        track.muted ? "Unmute" : "Mute"
      ),
      this.createButton(
        "solo",
        track.id,
        track.solo ? "Unsolo" : "Solo"
      ),
      this.createButton("fade-in", track.id, "Fade In"),
      this.createButton("fade-out", track.id, "Fade Out")
    );

    card.append(select, volumeLabel, controls);

    return card;
  }

  createButton(action, trackId, label) {
    const button = document.createElement("button");

    button.type = "button";
    button.dataset.audioAction = action;
    button.dataset.trackId = trackId;
    button.textContent = label;

    return button;
  }

  destroy() {
    this.container?.replaceChildren();
  }
}

export default AudioPanel;
