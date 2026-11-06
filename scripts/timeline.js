
(() => {
  "use strict";

  const Timeline = {
    project: null,
    container: null,
    unsubscribe: null,
    dragging: null,
    pixelsPerSecond: 60,
    rulerHeight: 30,
    trackHeight: 58,

    init(options = {}) {
      if (options instanceof HTMLElement) {
        options = { container: options };
      }

      this.project = options.project || window.VYORAProject;
      this.container = typeof options.container === "string"
        ? document.querySelector(options.container)
        : options.container;

      if (!this.project || !this.container) {
        console.error("VYORA Timeline: project or container missing.");
        return false;
      }

      this.addStyles();
      this.bindEvents();
      this.render();

      if (this.unsubscribe) this.unsubscribe();

      if (typeof this.project.subscribe === "function") {
        this.unsubscribe = this.project.subscribe(() => {
          this.render();
        });
      }

      return this;
    },

    getState() {
      if (typeof this.project.getSnapshot === "function") {
        return this.project.getSnapshot();
      }

      return this.project.data || this.project.state;
    },

    getTracks() {
      return this.getState()?.tracks || [];
    },

    getDuration() {
      const state = this.getState();
      let duration = Number(state?.duration) || 0;

      this.getTracks().forEach(track => {
        (track.clips || []).forEach(clip => {
          duration = Math.max(
            duration,
            (Number(clip.start) || 0) +
            (Number(clip.duration) || 0)
          );
        });
      });

      return Math.max(10, duration);
    },

    getSelectedId() {
      return this.getState()?.selectedClipId || null;
    },

    addStyles() {
      if (document.getElementById("vyora-timeline-styles")) return;

      const style = document.createElement("style");
      style.id = "vyora-timeline-styles";

      style.textContent = `
        .vyora-timeline {
          width: 100%;
          min-width: 0;
          overflow: auto;
          background: #101116;
          color: #f4f4f5;
          border-radius: 10px;
          scrollbar-width: thin;
          touch-action: pan-y;
        }

        .vyora-timeline-inner {
          position: relative;
          min-width: 100%;
          padding-bottom: 12px;
        }

        .vyora-time-ruler {
          position: sticky;
          top: 0;
          z-index: 5;
          height: 30px;
          background: #191a22;
          border-bottom: 1px solid #30313a;
          display: flex;
          align-items: center;
        }

        .vyora-ruler-label {
          position: absolute;
          top: 7px;
          font-size: 10px;
          color: #9ca3af;
          transform: translateX(-50%);
          white-space: nowrap;
        }

        .vyora-track-row {
          position: relative;
          height: 58px;
          border-bottom: 1px solid #292a33;
          background: #14151b;
        }

        .vyora-track-label {
          position: sticky;
          left: 0;
          z-index: 4;
          width: 90px;
          height: 100%;
          float: left;
          display: flex;
          align-items: center;
          padding: 0 8px;
          font-size: 11px;
          color: #c4c5ce;
          background: #20212a;
          border-right: 1px solid #343540;
          overflow: hidden;
        }

        .vyora-track-lane {
          position: relative;
          height: 100%;
          margin-left: 90px;
        }

        .vyora-clip {
          position: absolute;
          top: 8px;
          height: 41px;
          min-width: 24px;
          border-radius: 6px;
          overflow: hidden;
          cursor: grab;
          user-select: none;
          touch-action: none;
          border: 1px solid rgba(255,255,255,.22);
          display: flex;
          align-items: center;
          padding: 0 8px;
          font-size: 11px;
          white-space: nowrap;
          color: white;
          box-sizing: border-box;
        }

        .vyora-clip:active {
          cursor: grabbing;
        }

        .vyora-clip.video {
          background: linear-gradient(135deg,#2563eb,#1d4ed8);
        }

        .vyora-clip.audio {
          background: linear-gradient(135deg,#0f9f77,#047857);
        }

        .vyora-clip.text {
          background: linear-gradient(135deg,#9333ea,#6b21a8);
        }

        .vyora-clip.overlay {
          background: linear-gradient(135deg,#d97706,#b45309);
        }

        .vyora-clip.selected {
          outline: 2px solid #fff;
          outline-offset: 1px;
        }

        .vyora-playhead {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #ff496c;
          z-index: 8;
          pointer-events: none;
        }

        .vyora-playhead::before {
          content: "";
          position: absolute;
          top: 0;
          left: -5px;
          width: 12px;
          height: 12px;
          border-radius: 3px;
          background: #ff496c;
        }

        .vyora-empty-track {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          padding-left: 12px;
          color: #656775;
          font-size: 10px;
          pointer-events: none;
        }
      `;

      document.head.appendChild(style);
    },

    render() {
      if (!this.container || !this.project) return;

      const tracks = this.getTracks();
      const duration = this.getDuration();
      const selectedId = this.getSelectedId();

      const width = Math.max(
        600,
        duration * this.pixelsPerSecond
      );

      this.container.innerHTML = "";

      const root = document.createElement("div");
      root.className = "vyora-timeline";

      const inner = document.createElement("div");
      inner.className = "vyora-timeline-inner";
      inner.style.width = (width + 90) + "px";

      const ruler = this.createRuler(width);
      inner.appendChild(ruler);

      tracks.forEach(track => {
        inner.appendChild(
          this.createTrack(track, width, selectedId)
        );
      });

      const playhead = document.createElement("div");
      playhead.className = "vyora-playhead";
      playhead.style.left =
        (90 + (Number(this.getState()?.playhead) || 0) *
          this.pixelsPerSecond) + "px";

      inner.appendChild(playhead);
      root.appendChild(inner);
      this.container.appendChild(root);
    },

    createRuler(width) {
      const ruler = document.createElement("div");
      ruler.className = "vyora-time-ruler";
      ruler.style.width = (width + 90) + "px";

      for (let second = 0; second <= this.getDuration(); second += 1) {
        const label = document.createElement("span");
        label.className = "vyora-ruler-label";
        label.style.left =
          (90 + second * this.pixelsPerSecond) + "px";
        label.textContent = second + "s";
        ruler.appendChild(label);
      }

      return ruler;
    },

    createTrack(track, width, selectedId) {
      const row = document.createElement("div");
      row.className = "vyora-track-row";
      row.style.width = (width + 90) + "px";
      row.dataset.trackId = track.id;

      const label = document.createElement("div");
      label.className = "vyora-track-label";
      label.textContent = track.name || track.type || "Track";
      row.appendChild(label);

      const lane = document.createElement("div");
      lane.className = "vyora-track-lane";
      lane.style.width = width + "px";
      lane.dataset.trackId = track.id;

      if (!track.clips || !track.clips.length) {
        const empty = document.createElement("span");
        empty.className = "vyora-empty-track";
        empty.textContent = "Drop or add clips here";
        lane.appendChild(empty);
      } else {
        track.clips.forEach(clip => {
          lane.appendChild(
            this.createClip(clip, selectedId)
          );
        });
      }

      row.appendChild(lane);
      return row;
    },

    createClip(clip, selectedId) {
      const element = document.createElement("div");
      element.className = "vyora-clip " +
        (clip.type || "video");

      if (clip.id === selectedId) {
        element.classList.add("selected");
      }

      element.dataset.clipId = clip.id;
      element.dataset.start = Number(clip.start) || 0;

      element.style.left =
        ((Number(clip.start) || 0) * this.pixelsPerSecond) + "px";

      element.style.width = Math.max(
        24,
        (Number(clip.duration) || 0) * this.pixelsPerSecond
      ) + "px";

      element.textContent = clip.name || "Clip";
      element.title = clip.name || "Clip";

      return element;
    },

    bindEvents() {
      this.container.addEventListener("click", event => {
        const clipElement = event.target.closest(".vyora-clip");

        if (clipElement) {
          this.project.selectClip(clipElement.dataset.clipId);
          return;
        }

        const lane = event.target.closest(".vyora-track-lane");

        if (lane) {
          const bounds = lane.getBoundingClientRect();
          const x = event.clientX - bounds.left;
          const time = Math.max(0, x / this.pixelsPerSecond);

          this.project.setPlayhead(time);

          window.dispatchEvent(new CustomEvent("vyora:timeline-seek", {
            detail: { time }
          }));
        }
      });

      this.container.addEventListener("pointerdown", event => {
        const clip = event.target.closest(".vyora-clip");
        if (!clip || event.button !== 0) return;

        this.dragging = {
          clipId: clip.dataset.clipId,
          startX: event.clientX,
          originalStart: Number(clip.dataset.start) || 0,
          pointerId: event.pointerId
        };

        try {
          clip.setPointerCapture(event.pointerId);
        } catch (_) {}
      });

      this.container.addEventListener("pointermove", event => {
        if (!this.dragging) return;

        const difference =
          (event.clientX - this.dragging.startX) /
          this.pixelsPerSecond;

        const newStart = Math.max(
          0,
          this.dragging.originalStart + difference
        );

        const clip = this.container.querySelector(
          '[data-clip-id="' + this.dragging.clipId + '"]'
        );

        if (clip) {
          clip.style.left =
            (newStart * this.pixelsPerSecond) + "px";
        }
      });

      const finishDrag = event => {
        if (!this.dragging) return;

        const drag = this.dragging;
        this.dragging = null;

        const difference =
          (event.clientX - drag.startX) /
          this.pixelsPerSecond;

        const newStart = Math.max(
          0,
          drag.originalStart + difference
        );

        if (Math.abs(difference) > 0.04) {
          this.project.moveClip(drag.clipId, newStart);
        } else {
          this.project.selectClip(drag.clipId);
        }
      };

      this.container.addEventListener("pointerup", finishDrag);
      this.container.addEventListener("pointercancel", finishDrag);
    },

    
    destroy() {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }

      if (this.container) {
        this.container.innerHTML = "";
      }

      this.dragging = null;
      this.container = null;
    }
  };

  window.VYORATimeline = Timeline;

})();
