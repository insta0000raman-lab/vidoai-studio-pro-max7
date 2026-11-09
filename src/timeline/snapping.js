import { projectManager } from "../project/project-manager.js";
import { eventBus } from "../core/event-bus.js";

const DEFAULT_OPTIONS = {
  enabled: true,
  thresholdPixels: 10,
  minimumThreshold: 0.02,
  maximumThreshold: 0.25,
  snapToPlayhead: true,
  snapToMarkers: true,
  snapToClipEdges: true,
  snapToClipCenters: false
};

class TimelineSnapping {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options
    };

    this.lastResult = null;
  }

  configure(options = {}) {
    this.options = {
      ...this.options,
      ...options
    };

    eventBus.emit("timeline:snap-settings-changed", {
      ...this.options
    });

    return this.options;
  }

  setEnabled(enabled) {
    this.options.enabled = Boolean(enabled);

    if (!this.options.enabled) {
      this.lastResult = null;
    }

    return this.options.enabled;
  }

  getThreshold(zoom = 100) {
    const pixels = Number(zoom);

    if (!Number.isFinite(pixels) || pixels <= 0) {
      return this.options.minimumThreshold;
    }

    const seconds = this.options.thresholdPixels / pixels;

    return Math.max(
      this.options.minimumThreshold,
      Math.min(this.options.maximumThreshold, seconds)
    );
  }

  getProject() {
    const project = projectManager.getCurrent();

    if (!project) {
      throw new Error("No project is open");
    }

    return project;
  }

  getSnapPoints(excludedClipId = null) {
    const project = this.getProject();
    const points = [];

    if (this.options.snapToClipEdges) {
      for (const track of project.tracks || []) {
        for (const clip of track.clips || []) {
          if (clip.id === excludedClipId) continue;

          const start = Number(clip.start);
          const duration = Number(clip.duration);

          if (
            !Number.isFinite(start) ||
            !Number.isFinite(duration) ||
            duration <= 0
          ) {
            continue;
          }

          points.push({
            time: start,
            type: "clip-start",
            trackId: track.id,
            clipId: clip.id
          });

          points.push({
            time: start + duration,
            type: "clip-end",
            trackId: track.id,
            clipId: clip.id
          });

          if (this.options.snapToClipCenters) {
            points.push({
              time: start + duration / 2,
              type: "clip-center",
              trackId: track.id,
              clipId: clip.id
            });
          }
        }
      }
    }

    if (this.options.snapToMarkers) {
      for (const marker of project.markers || []) {
        const time = Number(
          marker.time ?? marker.position
        );

        if (!Number.isFinite(time)) continue;

        points.push({
          time,
          type: "marker",
          markerId: marker.id
        });
      }
    }

    return points;
  }

  addPlayheadPoint(points, playheadTime) {
    if (!this.options.snapToPlayhead) return points;

    const time = Number(playheadTime);

    if (!Number.isFinite(time)) return points;

    return [
      ...points,
      {
        time,
        type: "playhead"
      }
    ];
  }

  findNearestPoint(time, points, threshold) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const point of points) {
      const distance = Math.abs(point.time - time);

      if (
        distance <= threshold &&
        distance < nearestDistance
      ) {
        nearest = point;
        nearestDistance = distance;
      }
    }

    if (!nearest) return null;

    return {
      ...nearest,
      distance: nearestDistance
    };
  }

  snapTime(time, options = {}) {
    const originalTime = Number(time);

    if (!Number.isFinite(originalTime)) {
      throw new Error("Invalid timeline position");
    }

    if (!this.options.enabled || options.enabled === false) {
      return {
        time: originalTime,
        snapped: false,
        target: null
      };
    }

    const threshold = this.getThreshold(
      options.zoom || 100
    );

    let points = this.getSnapPoints(
      options.excludeClipId || null
    );

    points = this.addPlayheadPoint(
      points,
      options.playheadTime
    );

    const nearest = this.findNearestPoint(
      originalTime,
      points,
      threshold
    );

    const result = nearest
      ? {
          time: nearest.time,
          snapped: true,
          target: nearest,
          originalTime,
          difference: nearest.time - originalTime
        }
      : {
          time: originalTime,
          snapped: false,
          target: null,
          originalTime,
          difference: 0
        };

    this.lastResult = result;

    if (result.snapped) {
      eventBus.emit("timeline:snap-applied", result);
    }

    return result;
  }

  snapClipStart(trackId, clipId, proposedStart, options = {}) {
    const project = this.getProject();

    const track = project.tracks.find(
      item => item.id === trackId
    );

    if (!track) {
      throw new Error("Track not found");
    }

    const clip = track.clips.find(
      item => item.id === clipId
    );

    if (!clip) {
      throw new Error("Clip not found");
    }

    return this.snapTime(proposedStart, {
      ...options,
      excludeClipId: clipId
    });
  }

  snapClipEnd(proposedEnd, options = {}) {
    return this.snapTime(proposedEnd, options);
  }

  snapPlayhead(proposedTime, options = {}) {
    return this.snapTime(proposedTime, {
      ...options,
      snapToPlayhead: false
    });
  }

  getLastResult() {
    return this.lastResult;
  }

  clearLastResult() {
    this.lastResult = null;
  }

  getSettings() {
    return {
      ...this.options
    };
  }
}

export const timelineSnapping = new TimelineSnapping();

export { DEFAULT_OPTIONS };
