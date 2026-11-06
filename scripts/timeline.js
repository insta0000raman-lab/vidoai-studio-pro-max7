(() => {
  "use strict";

  const Timeline = {
    project: null,
    container: null,
    pixelsPerSecond: 80,
    isDragging: false,
    dragData: null,
    unsubscribe: null,
    root: null,

    init(options = {}) {
      if (
        options instanceof HTMLElement ||
        typeof options === "string"
      ) {
        options = { container: options };
      }

      this.project = options.project || window.VYORAProject;

      this.container =
        typeof options.container === "string"
          ? document.querySelector(options.container)
          : options.container || null;

      if (!this.project) {
        console.error("VYORA project manager not found.");
        return false;
      }

      if (!this.container) {
        console.error("Timeline container missing.");
        return false;
      }

      this.injectStyles();
      this.bindProject();
      this.render();

      return {
        render: () => this.render(),
        setZoom: value => this.setZoom(value),
        fit: () => this.fit(),
        destroy: () => this.destroy()
      };
    },

    getState() {
      if (typeof this.project.getSnapshot === "function") {
        return this.project.getSnapshot();
      }

      return this.project.data || this.project.state || null;
    },

    getDuration(state) {
      const projectDuration = Number(state?.duration) || 0;
      let clipEnd = 0;

      (state?.tracks || []).forEach(track => {
        (track.clips || []).forEach(clip => {
          clipEnd = Math.max(
            clipEnd,
            (Number(clip.start) || 0) +
            (Number(clip.duration) || 0)
          );
        });
      });

      return Math.max(10, projectDuration, clipEnd + 3);
    },

    timeToPixels(time) {
      return Math.max(0, Number(time) || 0) *
        this.pixelsPerSecond;
    },

    pixelsToTime(pixels) {
      return Math.max(0, Number(pixels) || 0) /
        this.pixelsPerSecond;
    },

    escapeHTML(value) {
      return String(value ?? "").replace(
        /[&<>"']/g,
        char => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]
      );
    },

    formatTime(seconds) {
      const value = Math.max(0, Number(seconds) || 0);
      const minutes = Math.floor(value / 60);
      const secs = Math.floor(value % 60);
      const frames = Math.floor((value % 1) * 30);

      return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(secs).padStart(2, "0") +
        ":" +
        String(frames).padStart(2, "0")
      );
    },

    bindProject() {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }

      if (typeof this.project.subscribe === "function") {
        this.unsubscribe = this.project.subscribe(() => {
          if (!this.isDragging) {
            this.render();
          }
        });
      }
    },

    render() {
      if (!this.container || !this.project) return;

      const state = this.getState();
      if (!state) return;

      const tracks = state.tracks || [];
      const duration = this.getDuration(state);
      const totalWidth = Math.max(
        600,
        this.timeToPixels(duration)
      );

      this.container.innerHTML = `
        <div class="vyora-timeline" data-vyora-timeline>

          <div class="vyora-timeline-toolbar">
            <div class="vyora-timeline-heading">
              <span class="vyora-timeline-dot"></span>
              <strong>Timeline</strong>
              <span class="vyora-timeline-time">
                ${this.formatTime(state.playhead)}
              </span>
            </div>

            <div class="vyora-timeline-controls">
              <button data-action="zoom-out">−</button>
              <span>${Math.round(this.pixelsPerSecond)} px/s</span>
              <button data-action="zoom-in">+</button>
              <button data-action="fit">Fit</button>
            </div>
          </div>

          <div class="vyora-timeline-scroll">
            <div class="vyora-timeline-content"
                 style="width:${totalWidth + 150}px">

              <div class="vyora-ruler">
                <div class="vyora-track-label ruler-label">
                  TRACKS
                </div>

                <div class="vyora-ruler-area"
                     style="width:${totalWidth}px">
                  ${this.renderRuler(duration)}
                </div>
              </div>

              <div class="vyora-track-list">
                ${
                  tracks.length
                    ? tracks.map(track =>
                        this.renderTrack(track, state)
                      ).join("")
                    : `<div class="vyora-empty-track">
                         No tracks available
                       </div>`
                }
              </div>

              <div class="vyora-playhead"
                   style="left:${150 + this.timeToPixels(state.playhead)}px">
                <div class="vyora-playhead-handle"></div>
                <div class="vyora-playhead-line"></div>
              </div>

            </div>
          </div>

          <div class="vyora-timeline-footer">
            <button data-action="add-video-track">+ Video</button>
            <button data-action="add-audio-track">+ Audio</button>
            <button data-action="add-text-track">+ Text</button>
            <button data-action="split"
              ${state.selectedClipId ? "" : "disabled"}>
              Split
            </button>
            <button data-action="delete"
              ${state.selectedClipId ? "" : "disabled"}>
              Delete
            </button>
          </div>

        </div>
      `;

      this.root = this.container.querySelector(
        "[data-vyora-timeline]"
      );

      this.bindEvents();
      this.refreshIcons();
    },

    renderRuler(duration) {
      const interval =
        this.pixelsPerSecond >= 100 ? 1 :
        this.pixelsPerSecond >= 45 ? 2 : 5;

      let output = "";

      for (
        let time = 0;
        time <= duration;
        time += interval
      ) {
        output += `
          <div class="vyora-ruler-tick"
               style="left:${this.timeToPixels(time)}px">
            <span>${this.formatTime(time).slice(0, 5)}</span>
          </div>
        `;
      }

      return output;
    },

    renderTrack(track, state) {
      const icons = {
        video: "film",
        audio: "music-2",
        text: "type",
        overlay: "layers"
      };

      const clips = (track.clips || [])
        .map(clip => this.renderClip(clip, track, state))
        .join("");

      return `
        <div class="vyora-track-row">

          <div class="vyora-track-label">
            <div class="vyora-track-info">
              <span class="vyora-track-icon">
                <i data-lucide="${icons[track.type] || "layers"}"></i>
              </span>

              <span class="vyora-track-name">
                ${this.escapeHTML(track.name)}
              </span>
            </div>

            <div class="vyora-track-actions">
              <button data-track-action="mute"
                      data-track-id="${this.escapeHTML(track.id)}"
                      title="Mute">
                <i data-lucide="${
                  track.muted ? "volume-x" : "volume-2"
                }"></i>
              </button>

              <button data-track-action="lock"
                      data-track-id="${this.escapeHTML(track.id)}"
                      title="Lock">
                <i data-lucide="${
                  track.locked ? "lock" : "unlock"
                }"></i>
              </button>
            </div>
          </div>

          <div class="vyora-track-lane"
               data-lane-track="${this.escapeHTML(track.id)}">
            ${clips}
          </div>

        </div>
      `;
    },

    renderClip(clip, track, state) {
      const left = this.timeToPixels(clip.start);
      const width = Math.max(
        24,
        this.timeToPixels(clip.duration)
      );

      const selected = state.selectedClipId === clip.id;

      const type = ["video", "audio", "text", "overlay"]
        .includes(clip.type)
          ? clip.type
          : track.type;

      return `
        <div class="vyora-clip vyora-clip-${type}
                    ${selected ? "is-selected" : ""}"
             data-clip-id="${this.escapeHTML(clip.id)}"
             data-track-id="${this.escapeHTML(track.id)}"
             style="left:${left}px;width:${width}px"
             title="${this.escapeHTML(clip.name)}">

          <div class="vyora-clip-handle left"
               data-trim="left"></div>

          <div class="vyora-clip-content">
            <span class="vyora-clip-title">
              ${this.escapeHTML(clip.name || "Untitled")}
            </span>

            <span class="vyora-clip-duration">
              ${this.formatTime(clip.duration)}
            </span>
          </div>

          <div class="vyora-clip-handle right"
               data-trim="right"></div>

        </div>
      `;
    },

    bindEvents() {
      const root = this.root;
      if (!root) return;

      root.addEventListener("click", event => {
        const trackButton = event.target.closest(
          "[data-track-action]"
        );

        if (trackButton) {
          const trackId = trackButton.dataset.trackId;
          const track = this.project.getTrack(trackId);

          if (!track) return;

          if (trackButton.dataset.trackAction === "mute") {
            this.project.updateTrack(trackId, {
              muted: !track.muted
            });
          }

          if (trackButton.dataset.trackAction === "lock") {
            this.project.updateTrack(trackId, {
              locked: !track.locked
            });
          }

          return;
        }

        const actionButton = event.target.closest(
          "[data-action]"
        );

        if (actionButton) {
          this.handleAction(actionButton.dataset.action);
          return;
        }

        const clip = event.target.closest("[data-clip-id]");

        if (clip) {
          if (this.dragData?.moved) return;

          this.project.selectClip(clip.dataset.clipId);

          window.dispatchEvent(
            new CustomEvent("vyora:timeline-clip-selected", {
              detail: { clipId: clip.dataset.clipId }
            })
          );

          return;
        }

        const lane = event.target.closest("[data-lane-track]");

        if (lane) {
          const rect = lane.getBoundingClientRect();
          this.seek(
            this.pixelsToTime(event.clientX - rect.left)
          );
        }
      });

      root.addEventListener("pointerdown", event => {
        const clip = event.target.closest("[data-clip-id]");

        if (
          !clip ||
          event.target.closest("[data-trim]")
        ) return;

        if (event.button !== 0) return;

        const clipId = clip.dataset.clipId;
        const found = this.project.findClip(clipId);

        if (!found) return;

        const track = this.project.getTrack(found.trackId);

        if (!track || track.locked) return;

        this.dragData = {
          clipId,
          originalStart: found.clip.start,
          pointerX: event.clientX,
          moved: false
        };

        try {
          clip.setPointerCapture(event.pointerId);
        } catch {}
      });

      root.addEventListener("pointermove", event => {
        if (!this.dragData) return;

        const difference =
          event.clientX - this.dragData.pointerX;

        if (Math.abs(difference) > 4) {
          this.dragData.moved = true;
          this.isDragging = true;
        }

        if (!this.isDragging) return;

        const newStart = Math.max(
          0,
          this.dragData.originalStart +
          this.pixelsToTime(difference)
        );

        const clip = root.querySelector(
          `[data-clip-id="${this.dragData.clipId}"]`
        );

        if (clip) {
          clip.style.left =
            this.timeToPixels(newStart) + "px";
        }
      });

      const finishDrag = event => {
        if (!this.dragData) return;

        const data = this.dragData;
        const difference =
          event.clientX - data.pointerX;

        this.dragData = null;
        this.isDragging = false;

        if (data.moved) {
          const newStart = Math.max(
            0,
            data.originalStart +
            this.pixelsToTime(difference)
          );

          this.project.updateClip(data.clipId, {
            start: newStart
          });
        } else {
          this.render();
        }
      };

      root.addEventListener("pointerup", finishDrag);

      root.addEventListener("pointercancel", () => {
        this.dragData = null;
        this.isDragging = false;
        this.render();
      });
    },

    handleAction(action) {
      const state = this.getState();

      switch (action) {
        case "zoom-in":
          this.setZoom(this.pixelsPerSecond * 1.25);
          break;

        case "zoom-out":
          this.setZoom(this.pixelsPerSecond / 1.25);
          break;

        case "fit":
          this.fit();
          break;

        case "add-video-track":
          this.addTrack("video");
          break;

        case "add-audio-track":
          this.addTrack("audio");
          break;

        case "add-text-track":
          this.addTrack("text");
          break;

        case "split":
          this.splitSelected(state);
          break;

        case "delete":
          this.deleteSelected(state);
          break;
      }
    },

    addTrack(type) {
      const state = this.getState();
      const count = (state.tracks || [])
        .filter(track => track.type === type).length + 1;

      const names = {
        video: "Video",
        audio: "Audio",
        text: "Text"
      };

      this.project.addTrack(
        type,
        (names[type] || "Track") + " " + count
      );
    },

    setZoom(value) {
      this.pixelsPerSecond = Math.max(
        20,
        Math.min(300, Number(value) || 80)
      );

      this.render();
    },

    fit() {
      const scroll = this.container?.querySelector(
        ".vyora-timeline-scroll"
      );

      const available = scroll
        ? scroll.clientWidth - 180
        : 600;

      const duration = this.getDuration(this.getState());

      this.setZoom(available / duration);
    },

    seek(time) {
      this.project.setPlayhead(time);

      window.dispatchEvent(
        new CustomEvent("vyora:timeline-seek", {
          detail: { time }
        })
      );
    },

    splitSelected(state) {
      if (!state?.selectedClipId) return false;

      const result = this.project.splitClip(
        state.selectedClipId,
        state.playhead
      );

      if (!result) {
        window.dispatchEvent(
          new CustomEvent("vyora:timeline-split-failed", {
            detail: {
              message: "Playhead ko clip ke beech mein rakho."
            }
          })
        );

        return false;
      }

      return true;
    },

    deleteSelected(state) {
      if (!state?.selectedClipId) return false;

      return this.project.removeClip(state.selectedClipId);
    },

    refreshIcons() {
      if (window.lucide?.createIcons) {
        window.lucide.createIcons();
      }
    },

    injectStyles() {
      if (document.getElementById("vyora-timeline-styles")) {
        return;
      }

      const style = document.createElement("style");
      style.id = "vyora-timeline-styles";

      style.textContent = `
        .vyora-timeline {
          width: 100%;
          color: #f4f4f5;
          background: #101116;
          border: 1px solid #292b35;
          border-radius: 15px;
          overflow: hidden;
          font-family: Inter, Arial, sans-serif;
        }

        .vyora-timeline-toolbar,
        .vyora-timeline-heading,
        .vyora-timeline-controls,
        .vyora-timeline-footer,
        .vyora-track-info,
        .vyora-track-actions {
          display: flex;
          align-items: center;
        }

        .vyora-timeline-toolbar {
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid #292b35;
        }

        .vyora-timeline-heading {
          gap: 9px;
          font-size: 13px;
        }

        .vyora-timeline-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #8b5cf6;
        }

        .vyora-timeline-time {
          color: #a1a1aa;
          font-variant-numeric: tabular-nums;
        }

        .vyora-timeline-controls {
          gap: 8px;
          color: #a1a1aa;
          font-size: 11px;
        }

        .vyora-timeline button {
          cursor: pointer;
          color: #e4e4e7;
          background: #20212a;
          border: 1px solid #343541;
          border-radius: 7px;
          padding: 6px 9px;
        }

        .vyora-timeline button:hover:not(:disabled) {
          background: #343044;
          border-color: #8b5cf6;
        }

        .vyora-timeline button:disabled {
          opacity: .35;
          cursor: not-allowed;
        }

        .vyora-timeline-scroll {
          width: 100%;
          overflow: auto;
          position: relative;
          max-height: 350px;
          overscroll-behavior: contain;
        }

        .vyora-timeline-content {
          position: relative;
          min-width: 100%;
        }

        .vyora-ruler,
        .vyora-track-row {
          display: flex;
          min-height: 58px;
        }

        .vyora-track-label {
          width: 150px;
          min-width: 150px;
          box-sizing: border-box;
          padding: 10px;
          background: #171820;
          border-right: 1px solid #30313b;
          border-bottom: 1px solid #30313b;
          position: sticky;
          left: 0;
          z-index: 4;
        }

        .ruler-label {
          display: flex;
          align-items: center;
          color: #8b8b98;
          font-size: 10px;
          letter-spacing: 1px;
        }

        .vyora-ruler-area {
          height: 34px;
          position: relative;
          background: #171820;
          border-bottom: 1px solid #30313b;
        }

        .vyora-ruler-tick {
          position: absolute;
          height: 100%;
          border-left: 1px solid #454653;
          color: #9293a0;
          font-size: 9px;
        }

        .vyora-ruler-tick span {
          position: absolute;
          top: 8px;
          left: 5px;
          white-space: nowrap;
        }

        .vyora-track-row {
          height: 58px;
          position: relative;
        }

        .vyora-track-info {
          gap: 7px;
          overflow: hidden;
        }

        .vyora-track-icon {
          display: grid;
          place-items: center;
          color: #aaa1ff;
        }

        .vyora-track-icon svg {
          width: 15px;
          height: 15px;
        }

        .vyora-track-name {
          font-size: 11px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .vyora-track-actions {
          gap: 5px;
          margin-top: 7px;
        }

        .vyora-track-actions button {
          display: grid;
          place-items: center;
          padding: 3px;
          border: 0;
          background: transparent;
          color: #8f90a0;
        }

        .vyora-track-actions svg {
          width: 12px;
          height: 12px;
        }

        .vyora-track-lane {
          height: 58px;
          position: relative;
          flex: 1;
          min-width: 0;
          background-color: #111219;
          background-image: linear-gradient(
            to right,
            #282a34 1px,
            transparent 1px
          );
                    background-size: 40px 100%;
          border-bottom: 1px solid #30313b;
        }

        .vyora-clip {
          position: absolute;
          top: 8px;
          height: 41px;
          min-width: 24px;
          border-radius: 6px;
          overflow: hidden;
          cursor: grab;
          box-sizing: border-box;
        }

        .vyora-clip:active {
          cursor: grabbing;
        }

        .vyora-clip-video {
          background: #5140a2;
          border: 1px solid #806de5;
        }

        .vyora-clip-audio {
          background: #176c68;
          border: 1px solid #36aaa0;
        }

        .vyora-clip-text {
          background: #875322;
          border: 1px solid #d69b54;
        }

        .vyora-clip-overlay {
          background: #743c78;
          border: 1px solid #b56cbb;
        }

        .vyora-clip.is-selected {
          outline: 2px solid #fff;
          outline-offset: -2px;
        }

        .vyora-clip-content {
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
          padding: 0 8px;
          overflow: hidden;
          pointer-events: none;
        }

        .vyora-clip-title {
          font-size: 10px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .vyora-clip-duration {
          font-size: 9px;
          opacity: .75;
        }

        .vyora-clip-handle {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 5px;
          background: rgba(255,255,255,.35);
          z-index: 2;
        }

        .vyora-clip-handle.left {
          left: 0;
        }

        .vyora-clip-handle.right {
          right: 0;
        }

        .vyora-playhead {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1px;
          z-index: 5;
          pointer-events: none;
        }

        .vyora-playhead-line {
          position: absolute;
          top: 28px;
          bottom: 0;
          left: 0;
          width: 2px;
          background: #ff526d;
        }

        .vyora-playhead-handle {
          position: absolute;
          top: 25px;
          left: -5px;
          width: 11px;
          height: 11px;
          border-radius: 3px;
          background: #ff526d;
        }

        .vyora-empty-track {
          padding: 25px;
          text-align: center;
          color: #777;
          font-size: 12px;
        }

        .vyora-timeline-footer {
          gap: 7px;
          flex-wrap: wrap;
          padding: 11px;
          border-top: 1px solid #292b35;
        }

        @media (max-width: 600px) {
          .vyora-timeline-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .vyora-timeline-footer button {
            font-size: 10px;
            padding: 6px 7px;
          }
        }
      `;

      document.head.appendChild(style);
    },

    destroy() {
      if (unsubscribe) unsubscribe();
      if (container) container.innerHTML = "";
    }
  };

  function render() {
    Timeline.render();
  }

  function addStyles() {
    Timeline.injectStyles();
  }

  function init(element) {
    Timeline.container = element;
    Timeline.project = window.VYORAProject;

    if (!Timeline.container) {
      throw new Error("Timeline container missing");
    }

    addStyles();
    Timeline.bindProject();
    render();

    return {
      render,
      destroy() {
        Timeline.destroy();
      }
    };
  }

  window.VYORATimeline = {
    init,
    render,
    destroy: () => Timeline.destroy()
  };

})();
