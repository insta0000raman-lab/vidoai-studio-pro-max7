import { store } from "../core/state-store.js";
import { eventBus } from "../core/event-bus.js";
import { projectManager } from "../project/project-manager.js";
import { timelineManager } from "../timeline/timeline.js";

export class TimelineView {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.getElementById("timelineTracks");

    this.ruler =
      options.ruler ||
      document.getElementById("timelineRuler");

    this.playhead =
      options.playhead ||
      document.getElementById("timelinePlayhead");

    this.scroll =
      options.scroll ||
      document.getElementById("timelineScroll");

    this.scale = options.scale || 80;
    this.trackHeight = options.trackHeight || 64;
    this.selectedClipId = null;

    this.dragState = null;
    this.listeners = [];

    this.bind();
    this.render();
  }

  bindEvent(target, name, callback) {
    if (!target) return;

    target.addEventListener(name, callback);

    this.listeners.push(() => {
      target.removeEventListener(name, callback);
    });
  }

  bind() {
    this.bindEvent(this.container, "click", event => {
      const clipElement = event.target.closest("[data-clip-id]");

      if (!clipElement) return;

      this.selectClip(clipElement.dataset.clipId);
    });

    this.bindEvent(this.container, "pointerdown", event => {
      const clipElement = event.target.closest("[data-clip-id]");

      if (!clipElement || event.button !== 0) return;

      this.dragState = {
        clipId: clipElement.dataset.clipId,
        startX: event.clientX,
        moved: false
      };

      clipElement.setPointerCapture?.(event.pointerId);
    });

    this.bindEvent(this.container, "pointermove", event => {
      if (!this.dragState) return;

      const distance =
        event.clientX - this.dragState.startX;

      if (Math.abs(distance) > 4) {
        this.dragState.moved = true;
      }
    });

    this.bindEvent(this.container, "pointerup", () => {
      if (this.dragState?.moved) {
        this.render();
      }

      this.dragState = null;
    });

    this.bindEvent(this.scroll, "scroll", () => {
      this.updatePlayhead();
    });

    this.unsubscribeStore = store.subscribe(() => {
      this.render();
    });
  }

  getProject() {
    return projectManager.currentProject;
  }

  getDuration(project) {
    return Math.max(
      10,
      Number(project?.duration || 0),
      ...((project?.tracks || []).flatMap(track =>
        (track.clips || []).map(clip =>
          Number(clip.start || 0) +
          Number(clip.duration || 0)
        )
      ))
    );
  }

  getPixelsPerSecond() {
    return this.scale;
  }

  timeToPixels(time) {
    return Math.max(0, Number(time) || 0) * this.scale;
  }

  pixelsToTime(pixels) {
    return Math.max(0, pixels / this.scale);
  }

  render() {
    const project = this.getProject();

    if (!project || !this.container) return;

    this.renderRuler(project);
    this.renderTracks(project);
    this.updatePlayhead();
  }

  renderRuler(project) {
    if (!this.ruler) return;

    const duration = this.getDuration(project);
    const width = this.timeToPixels(duration);

    this.ruler.style.width = `${width}px`;
    this.ruler.replaceChildren();

    const interval = this.scale >= 100 ? 1 : 5;

    for (let time = 0; time <= duration; time += interval) {
      const marker = document.createElement("div");

      marker.className = "timeline-ruler-mark";
      marker.style.left = `${this.timeToPixels(time)}px`;
      marker.textContent = this.formatTime(time);

      this.ruler.appendChild(marker);
    }
  }

  renderTracks(project) {
    const fragment = document.createDocumentFragment();

    for (const track of project.tracks || []) {
      fragment.appendChild(this.createTrackElement(track));
    }

    this.container.replaceChildren(fragment);
  }

  createTrackElement(track) {
    const row = document.createElement("div");

    row.className = "timeline-track";
    row.dataset.trackId = track.id;
    row.style.height = `${this.trackHeight}px`;

    const label = document.createElement("div");

    label.className = "timeline-track-label";
    label.textContent = track.name || track.type || "Track";

    row.appendChild(label);

    const lane = document.createElement("div");

    lane.className = "timeline-track-lane";

    for (const clip of track.clips || []) {
      lane.appendChild(
        this.createClipElement(clip, track)
      );
    }

    row.appendChild(lane);

    return row;
  }

  createClipElement(clip, track) {
    const element = document.createElement("div");

    const start = Number(clip.start || 0);
    const duration = Math.max(
      0.05,
      Number(clip.duration || 0)
    );

    element.className = "timeline-clip";

    if (clip.id === this.selectedClipId) {
      element.classList.add("selected");
    }

    element.dataset.clipId = clip.id;
    element.dataset.trackId = track.id;

    element.style.left =
      `${this.timeToPixels(start)}px`;

    element.style.width =
      `${Math.max(8, this.timeToPixels(duration))}px`;

    const title = document.createElement("span");

    title.className = "timeline-clip-title";
    title.textContent =
      clip.name || clip.text || clip.type || "Clip";

    element.appendChild(title);

    return element;
  }

  selectClip(clipId) {
    this.selectedClipId = clipId;

    store.selectClip?.(clipId);

    this.renderTracks(this.getProject());
  }

  updatePlayhead() {
    if (!this.playhead) return;

    const state = store.getState();

    const time = Number(
      state.playbackTime ?? state.currentTime ?? 0
    );

    this.playhead.style.left =
      `${this.timeToPixels(time)}px`;
  }

  seekFromPosition(clientX) {
    if (!this.scroll) return;

    const rect = this.scroll.getBoundingClientRect();

    const x =
      clientX - rect.left + this.scroll.scrollLeft;

    const time = this.pixelsToTime(x);

    timelineManager.seek(time);
  }

  zoomIn() {
    this.scale = Math.min(400, this.scale * 1.25);
    this.render();
  }

  zoomOut() {
    this.scale = Math.max(20, this.scale / 1.25);
    this.render();
  }

  setZoom(value) {
    this.scale = Math.max(
      20,
      Math.min(400, Number(value) || 80)
    );

    this.render();
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    return `${String(minutes).padStart(2, "0")}:${String(
      remaining
    ).padStart(2, "0")}`;
  }

  destroy() {
    this.unsubscribeStore?.();

    this.listeners.forEach(remove => remove());
    this.listeners = [];
  }
}

export default TimelineView;
