
(() => {
  "use strict";

  const Timeline = {
    project: null,
    container: null,
    scale: 80,
    pixelsPerSecond: 80,
    rowHeight: 58,
    rulerHeight: 34,
    isDragging: false,
    dragData: null,
    unsubscribe: null,

    init(options = {}) {
      this.project = options.project || window.VYORAProject;

      if (!this.project) {
        console.error("VYORA project manager not found.");
        return false;
      }

      this.container =
        typeof options.container === "string"
          ? document.querySelector(options.container)
          : options.container || null;

      this.bindProject();
      this.render();

      return true;
    },

    bindProject() {
      if (this.unsubscribe) {
        this.unsubscribe();
      }

      this.unsubscribe = this.project.subscribe(() => {
        if (!this.isDragging) {
          this.render();
        }
      });
    },

    setContainer(container) {
      this.container =
        typeof container === "string"
          ? document.querySelector(container)
          : container;

      this.render();
    },

    getState() {
      return this.project?.getState() || null;
    },

    getDuration() {
      const duration = this.project?.duration || 0;
      return Math.max(10, duration + 3);
    },

    timeToPixels(time) {
      return Math.max(0, Number(time) || 0) * this.pixelsPerSecond;
    },

    pixelsToTime(pixels) {
      return Math.max(0, Number(pixels) || 0) / this.pixelsPerSecond;
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

    getTrackIcon(type) {
      const icons = {
        video: "film",
        audio: "music-2",
        text: "type",
        overlay: "layers"
      };

      return icons[type] || "layers";
    },

    getClipColor(type) {
      const colors = {
        video: "video",
        audio: "audio",
        text: "text",
        overlay: "overlay"
      };

      return colors[type] || "video";
    },

    render() {
      if (!this.container || !this.project) return;

      const state = this.getState();
      if (!state) return;

      const tracks = state.tracks || [];
      const duration = this.getDuration();
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
                ${this.escapeHTML(this.project.formatTime?.(state.playhead) || this.formatTime(state.playhead))}
              </span>
            </div>

            <div class="vyora-timeline-controls">
              <button type="button" data-action="zoom-out" title="Zoom out">−</button>
              <span>${Math.round(this.pixelsPerSecond)} px/s</span>
              <button type="button" data-action="zoom-in" title="Zoom in">+</button>
              <button type="button" data-action="fit" title="Fit timeline">Fit</button>
            </div>
          </div>

          <div class="vyora-timeline-scroll">
            <div class="vyora-timeline-content" style="width:${totalWidth + 150}px">
              <div class="vyora-ruler">
                <div class="vyora-track-label ruler-label">TRACKS</div>
                <div class="vyora-ruler-area" style="width:${totalWidth}px">
                  ${this.renderRuler(duration)}
                </div>
              </div>

              <div class="vyora-track-list">
                ${tracks.length
                  ? tracks.map(track => this.renderTrack(track, state)).join("")
                  : `<div class="vyora-empty-track">No tracks available</div>`
                }
              </div>

              <div class="vyora-playhead" style="left:${150 + this.timeToPixels(state.playhead)}px">
                <div class="vyora-playhead-handle"></div>
                <div class="vyora-playhead-line"></div>
              </div>
            </div>
          </div>

          <div class="vyora-timeline-footer">
            <button type="button" data-action="add-video-track">+ Video</button>
            <button type="button" data-action="add-audio-track">+ Audio</button>
            <button type="button" data-action="add-text-track">+ Text</button>
            <button type="button" data-action="split" ${state.selectedClipId ? "" : "disabled"}>Split clip</button>
            <button type="button" data-action="delete" ${state.selectedClipId ? "" : "disabled"}>Delete</button>
          </div>
        </div>
      `;

      this.injectStyles();
      this.bindEvents();
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

    renderRuler(duration) {
      const interval = this.pixelsPerSecond >= 100
        ? 1
        : this.pixelsPerSecond >= 45
          ? 2
          : 5;

      let output = "";

      for (let time = 0; time <= duration; time += interval) {
        const left = this.timeToPixels(time);

        output += `
          <div class="vyora-ruler-tick" style="left:${left}px">
            <span>${this.formatTime(time).slice(0, 5)}</span>
          </div>
        `;
      }

      return output;
    },

    renderTrack(track, state) {
      const selectedTrack =
        state.selectedTrackId === track.id;

      const clips = (track.clips || [])
        .map(clip => this.renderClip(clip, track, state))
        .join("");

      return `
        <div class="vyora-track-row ${selectedTrack ? "is-selected" : ""}"
             data-track-id="${this.escapeHTML(track.id)}">

          <div class="vyora-track-label">
            <div class="vyora-track-info">
              <span class="vyora-track-icon">
                <i data-lucide="${this.getTrackIcon(track.type)}"></i>
              </span>
              <span class="vyora-track-name">
                ${this.escapeHTML(track.name)}
              </span>
            </div>

            <div class="vyora-track-actions">
              <button type="button" data-track-action="mute"
                      data-track-id="${this.escapeHTML(track.id)}"
                      title="Mute track">
                <i data-lucide="${track.muted ? "volume-x" : "volume-2"}"></i>
              </button>

              <button type="button" data-track-action="lock"
                      data-track-id="${this.escapeHTML(track.id)}"
                      title="Lock track">
                <i data-lucide="${track.locked ? "lock" : "unlock"}"></i>
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

      const selected =
        state.selectedClipId === clip.id;

      const color = this.getClipColor(clip.type);

      return `
        <div class="vyora-clip vyora-clip-${color} ${selected ? "is-selected" : ""}"
             data-clip-id="${this.escapeHTML(clip.id)}"
             data-track-id="${this.escapeHTML(track.id)}"
             style="left:${left}px;width:${width}px"
             title="${this.escapeHTML(clip.name)}">

          <div class="vyora-clip-handle left"
               data-trim="left"></div>

          <div class="vyora-clip-content">
            <span class="vyora-clip-title">
              ${this.escapeHTML(clip.name)}
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
      const root = this.container.querySelector(
        "[data-vyora-timeline]"
      );

      if (!root) return;

      root.addEventListener("click", event => {
        const trackButton = event.target.closest(
          "[data-track-action]"
        );

        if (trackButton) {
          event.stopPropagation();

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

        const actionButton = event.target.closest("[data-action]");

        if (actionButton) {
          this.handleAction(actionButton.dataset.action);
          return;
        }

        const clipElement = event.target.closest("[data-clip-id]");

        if (clipElement) {
          this.project.selectClip(clipElement.dataset.clipId);
          this.emit("clip-selected", {
            clipId: clipElement.dataset.clipId
          });
          return;
        }

        const lane = event.target.closest("[data-lane-track]");

        if (lane) {
          const rect = lane.getBoundingClientRect();
          const x = event.clientX - rect.left;
          this.seek(this.pixelsToTime(x));
        }
      });

      root.addEventListener("pointerdown", event => {
        const clip = event.target.closest("[data-clip-id]");

        if (!clip || event.target.closest("[data-trim]")) {
          return;
        }

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
          originalTrackId: found.trackId,
          targetTrackId: found.trackId,
          moved: false
        };

        this.isDragging = false;

        try {
          clip.setPointerCapture(event.pointerId);
        } catch {}
      });

      root.addEventListener("pointermove", event => {
        if (!this.dragData) return;

        const difference =
          event.clientX - this.dragData.pointerX;

        if (Math.abs(difference) > 4) {
          this.isDragging = true;
          this.dragData.moved = true;
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

      root.addEventListener("pointerup", event => {
        if (!this.dragData) return;

        const data = this.dragData;
        this.dragData = null;

        if (data.moved) {
          const difference =
            event.clientX - data.pointerX;

          const newStart = Math.max(
            0,
            data.originalStart +
              this.pixelsToTime(difference)
          );

          this.project.updateClip(data.clipId, {
            start: newStart
          });
        }

        this.isDragging = false;
        this.render();
      });

      root.addEventListener("pointercancel", () => {
        this.dragData = null;
        this.isDragging = false;
        this.render();
      });
    },

    handleAction(action) {
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
          this.project.addTrack("video", "Video " + (this.project.tracks.filter(t => t.type === "video").length + 1));
          break;

        case "add-audio-track":
          this.project.addTrack("audio", "Audio " + (this.project.tracks.filter(t => t.type === "audio").length + 1));
          break;

        case "add-text-track":
          this.project.addTrack("text", "Text " + (this.project.tracks.filter(t => t.type === "text").length + 1));
          break;

        case "split":
          this.splitSelected();
          break;

        case "delete":
          this.deleteSelected();
          break;
      }
    },

    setZoom(value) {
      this.pixelsPerSecond = Math.max(
        20,
        Math.min(300, Number(value) || 80)
      );

      this.render();
    },

    fit() {
      if (!this.container) return;

      const scroll = this.container.querySelector(
        ".vyora-timeline-scroll"
      );

      const available = scroll
        ? scroll.clientWidth - 180
        : 600;

      const duration = this.getDuration();

      this.pixelsPerSecond = Math.max(
        20,
        Math.min(300, available / duration)
      );

      this.render();
    },

    seek(time) {
      this.project.setPlayhead(time);

      this.emit("seek", {
        time,
        formatted: this.formatTime(time)
      });

      window.dispatchEvent(
        new CustomEvent("vyora:timeline-seek", {
          detail: { time }
        })
      );
    },

    splitSelected() {
      const state = this.getState();

      if (!state.selectedClipId) return false;

      const result = this.project.splitClip(
        state.selectedClipId,
        state.playhead
      );

      if (!result) {
        this.emit("split-failed", {
          message: "Playhead ko clip ke beech mein rakho."
        });

        return false;
      }

      this.emit("clip-split", result);
      return true;
    },

    deleteSelected() {
      const state = this.getState();

      if (!state.selectedClipId) return false;

      const success = this.project.removeClip(
        state.selectedClipId
      );

      if (success) {
        this.emit("clip-deleted", {
          clipId: state.selectedClipId
        });
      }

      return success;
    },

    emit(name, detail = {}) {
      window.dispatchEvent(
        new CustomEvent("vyora:timeline-" + name, {
          detail
        })
      );
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

        .vyora-track-row.is-selected .vyora-track-label {
          background: #211d32;
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
          cursor: grab;        }

        .vyora-clip:hover {
          filter: brightness(1.15);
        }

        .vyora-clip.selected {
          outline: 2px solid #ffffff;
          outline-offset: -2px;
        }

        .vyora-clip-label {
          padding: 5px 7px;
          font-size: 11px;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
        }

        .vyora-playhead {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #ff4d83;
          z-index: 10;
          pointer-events: none;
        }

        .vyora-playhead::before {
          content: "";
          position: absolute;
          top: 0;
          left: -4px;
          width: 10px;
          height: 10px;
          background: #ff4d83;
          border-radius: 50%;
        }

        .vyora-timeline-empty {
          padding: 25px;
          text-align: center;
          color: #858595;
          font-size: 13px;
        }
      `;
      document.head.appendChild(style);
    }

    function render() {
      if (!container) return;

      const state = project.state;
      const clips = state.clips || [];
      const tracks = state.tracks || [];
      const duration = Math.max(10, state.duration || 30);
      const pixelsPerSecond = zoom * 10;

      container.innerHTML = `
        <div class="vyora-timeline">
          <div class="vyora-timeline-toolbar">
            <button data-action="add-track">+ Track</button>
            <button data-action="split">Split</button>
            <button data-action="delete">Delete</button>
            <button data-action="zoom-out">−</button>
            <button data-action="zoom-in">+</button>
            <button data-action="fit">Fit</button>
          </div>

          <div class="vyora-timeline-scroll">
            <div class="vyora-timeline-content"
                 style="width:${Math.max(600, duration * pixelsPerSecond + 100)}px">

              <div class="vyora-ruler">
                ${Array.from({ length: Math.ceil(duration) + 1 }, (_, i) =>
                  `<span style="left:${i * pixelsPerSecond}px">${i}s</span>`
                ).join("")}
              </div>

              ${tracks.map(track => `
                <div class="vyora-track">
                  <div class="vyora-track-header">
                    <span>${escapeHTML(track.name || "Track")}</span>
                    <button data-action="mute-track"
                            data-id="${track.id}">M</button>
                    <button data-action="lock-track"
                            data-id="${track.id}">L</button>
                  </div>

                  <div class="vyora-track-lane"
                       data-track="${track.id}">
                    ${clips.filter(c => c.trackId === track.id).map(clip => `
                      <div class="vyora-clip ${selectedClipId === clip.id ? "selected" : ""}"
                           data-clip="${clip.id}"
                           style="left:${clip.start * pixelsPerSecond}px;
                                  width:${Math.max(24, clip.duration * pixelsPerSecond)}px">
                        <div class="vyora-clip-label">
                          ${escapeHTML(clip.name || clip.type || "Clip")}
                        </div>
                      </div>
                    `).join("")}
                  </div>
                </div>
              `).join("")}

              <div class="vyora-playhead"
                   style="left:${(state.playhead || 0) * pixelsPerSecond}px">
              </div>

              ${clips.length === 0 ? `
                <div class="vyora-timeline-empty">
                  Import media to start editing
                </div>
              ` : ""}
            </div>
          </div>
        </div>
      `;

      bindEvents();
    }

    function escapeHTML(value) {
      return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function bindEvents() {
      container.querySelectorAll("[data-action]").forEach(button => {
        button.addEventListener("click", () => {
          const action = button.dataset.action;

          if (action === "add-track") {
            project.addTrack();
          } else if (action === "split") {
            if (selectedClipId) {
              project.splitClip(selectedClipId, project.state.playhead || 0);
            }
          } else if (action === "delete") {
            if (selectedClipId) {
              project.removeClip(selectedClipId);
              selectedClipId = null;
            }
          } else if (action === "zoom-in") {
            zoom = Math.min(20, zoom + 2);
            render();
          } else if (action === "zoom-out") {
            zoom = Math.max(2, zoom - 2);
            render();
          } else if (action === "fit") {
            zoom = 5;
            render();
          } else if (action === "mute-track") {
            project.updateTrack(button.dataset.id, { muted: true });
          } else if (action === "lock-track") {
            project.updateTrack(button.dataset.id, { locked: true });
          }
        });
      });

      container.querySelectorAll(".vyora-clip").forEach(clipElement => {
        clipElement.addEventListener("click", event => {
          event.stopPropagation();
          selectedClipId = clipElement.dataset.clip;
          project.selectClip(selectedClipId);
          render();
        });
      });

      container.querySelectorAll(".vyora-track-lane").forEach(lane => {
        lane.addEventListener("click", event => {
          if (event.target.closest(".vyora-clip")) return;

          const rect = lane.getBoundingClientRect();
          const seconds = Math.max(0, (event.clientX - rect.left) / (zoom * 10));

          project.setPlayhead(seconds);
          window.dispatchEvent(new CustomEvent("vyora:timeline-seek", {
            detail: { time: seconds }
          }));
        });
      });
    }

    function init(element) {
      container = element;
      if (!container) throw new Error("Timeline container missing");

      addStyles();
      render();

      if (project.subscribe) {
        unsubscribe = project.subscribe(render);
      }

      return {
        render,
        destroy() {
          if (unsubscribe) unsubscribe();
          container.innerHTML = "";
        }
      };
    }

    window.VYORATimeline = { init };

  })();
   
