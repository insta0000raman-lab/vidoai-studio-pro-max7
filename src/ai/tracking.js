import { createId } from "../project/schema.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function center(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

function iou(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  const intersection =
    Math.max(0, right - left) *
    Math.max(0, bottom - top);

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

function distance(a, b) {
  const ca = center(a);
  const cb = center(b);

  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

function normalizeBox(box) {
  if (!box) return null;

  const result = {
    x: Number(box.x),
    y: Number(box.y),
    width: Number(box.width),
    height: Number(box.height)
  };

  if (!Object.values(result).every(Number.isFinite)) {
    return null;
  }

  if (result.width <= 0 || result.height <= 0) {
    return null;
  }

  return result;
}

export class ObjectTracker {
  constructor(options = {}) {
    this.options = {
      maxMissingFrames: options.maxMissingFrames ?? 12,
      minimumConfidence: options.minimumConfidence ?? 0.35,
      minimumIoU: options.minimumIoU ?? 0.02,
      maximumDistance: options.maximumDistance ?? 0.35,
      distanceWeight: options.distanceWeight ?? 0.45,
      iouWeight: options.iouWeight ?? 0.55
    };

    this.tracks = new Map();
    this.frameIndex = 0;
    this.lastTimestamp = null;
    this.listeners = new Set();
  }

  createTrack(detection, timestamp) {
    const track = {
      id: createId("track"),
      label: detection.label || "object",
      classId: detection.classId ?? null,

      box: { ...detection.box },
      lastReliableBox: { ...detection.box },

      confidence: detection.confidence,
      status: "tracking",

      firstSeen: timestamp,
      lastSeen: timestamp,
      lastReliableTimestamp: timestamp,

      frameIndex: this.frameIndex,
      missingFrames: 0,

      history: [{
        timestamp,
        frameIndex: this.frameIndex,
        box: { ...detection.box },
        confidence: detection.confidence
      }]
    };

    this.tracks.set(track.id, track);
    return track;
  }

  calculateMatch(track, detection) {
    if (track.label !== detection.label) {
      return -1;
    }

    const overlap = iou(track.box, detection.box);
    const gap = distance(track.box, detection.box);

    const scale = Math.max(
      1,
      Math.hypot(track.box.width, track.box.height)
    );

    const normalizedDistance = gap / scale;

    if (
      overlap < this.options.minimumIoU &&
      normalizedDistance > this.options.maximumDistance
    ) {
      return -1;
    }

    const distanceScore = clamp(
      1 - normalizedDistance / this.options.maximumDistance,
      0,
      1
    );

    return (
      overlap * this.options.iouWeight +
      distanceScore * this.options.distanceWeight
    );
  }

  updateTrack(track, detection, timestamp) {
    track.box = { ...detection.box };
    track.lastReliableBox = { ...detection.box };

    track.confidence = detection.confidence;
    track.status = "tracking";

    track.lastSeen = timestamp;
    track.lastReliableTimestamp = timestamp;

    track.frameIndex = this.frameIndex;
    track.missingFrames = 0;

    track.history.push({
      timestamp,
      frameIndex: this.frameIndex,
      box: { ...detection.box },
      confidence: detection.confidence
    });

    if (track.history.length > 300) {
      track.history.shift();
    }

    return track;
  }

  markMissing(track) {
    track.missingFrames += 1;
    track.frameIndex = this.frameIndex;

    if (
      track.missingFrames <=
      this.options.maxMissingFrames
    ) {
      track.status = "temporarily-missing";
      track.box = { ...track.lastReliableBox };
    } else {
      track.status = "lost";
    }

    return track;
  }

  update(detections = [], timestamp = 0) {
    this.frameIndex += 1;

    this.lastTimestamp = Number(timestamp);

    const validDetections = detections
      .map(item => {
        const box = normalizeBox(item.box);

        if (!box) return null;

        const confidence = Number(item.confidence ?? 0);

        if (
          !Number.isFinite(confidence) ||
          confidence < this.options.minimumConfidence
        ) {
          return null;
        }

        return {
          ...item,
          box,
          confidence,
          label: item.label || "object"
        };
      })
      .filter(Boolean);

    const usedDetectionIndexes = new Set();
    const usedTrackIds = new Set();

    const candidates = [];

    for (const track of this.tracks.values()) {
      if (track.status === "lost") continue;

      validDetections.forEach((detection, index) => {
        const score = this.calculateMatch(track, detection);

        if (score >= 0) {
          candidates.push({
            trackId: track.id,
            detectionIndex: index,
            score
          });
        }
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    for (const candidate of candidates) {
      if (usedTrackIds.has(candidate.trackId)) continue;

      if (
        usedDetectionIndexes.has(candidate.detectionIndex)
      ) {
        continue;
      }

      const track = this.tracks.get(candidate.trackId);
      const detection = validDetections[
        candidate.detectionIndex
      ];

      this.updateTrack(track, detection, timestamp);

      usedTrackIds.add(track.id);
      usedDetectionIndexes.add(candidate.detectionIndex);
    }

    for (const track of this.tracks.values()) {
      if (
        track.status !== "lost" &&
        !usedTrackIds.has(track.id)
      ) {
        this.markMissing(track);
      }
    }

    validDetections.forEach((detection, index) => {
      if (!usedDetectionIndexes.has(index)) {
        this.createTrack(detection, timestamp);
      }
    });

    this.removeExpiredTracks();
    this.emit();

    return this.getTracks();
  }

  removeExpiredTracks() {
    for (const [id, track] of this.tracks) {
      if (
        track.status === "lost" &&
        track.missingFrames >
          this.options.maxMissingFrames + 30
      ) {
        this.tracks.delete(id);
      }
    }
  }

  getTrack(id) {
    const track = this.tracks.get(id);
    return track ? structuredClone(track) : null;
  }

  getTracks(options = {}) {
    const includeLost = options.includeLost ?? true;

    return [...this.tracks.values()]
      .filter(track =>
        includeLost || track.status !== "lost"
      )
      .map(track => structuredClone(track));
  }

  getBestTrack(label = null) {
    const candidates = [...this.tracks.values()]
      .filter(track =>
        track.status === "tracking" &&
        (!label || track.label === label)
      );

    candidates.sort(
      (a, b) => b.confidence - a.confidence
    );

    return candidates.length
      ? structuredClone(candidates[0])
      : null;
  }

  selectTrack(id) {
    const track = this.tracks.get(id);

    if (!track) {
      throw new Error("Selected object track not found.");
    }

    return structuredClone(track);
  }

  getPositionAt(id, timestamp) {
    const track = this.tracks.get(id);

    if (!track || !track.history.length) {
      return null;
    }

    const history = track.history;

    let previous = null;
    let next = null;

    for (const point of history) {
      if (point.timestamp <= timestamp) {
        previous = point;
      }

      if (point.timestamp >= timestamp) {
        next = point;
        break;
      }
    }

    if (!previous) return null;
    if (!next || previous === next) {
      return { ...previous.box };
    }

    const duration = next.timestamp - previous.timestamp;

    if (duration <= 0) {
      return { ...previous.box };
    }

    const progress = clamp(
      (timestamp - previous.timestamp) / duration,
      0,
      1
    );

    return {
      x: previous.box.x +
        (next.box.x - previous.box.x) * progress,

      y: previous.box.y +
        (next.box.y - previous.box.y) * progress,

      width: previous.box.width +
        (next.box.width - previous.box.width) * progress,

      height: previous.box.height +
        (next.box.height - previous.box.height) * progress
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit() {
    const snapshot = this.getTracks();

    for (const callback of this.listeners) {
      callback(snapshot);
    }
  }

  reset() {
    this.tracks.clear();
    this.frameIndex = 0;
    this.lastTimestamp = null;
    this.emit();
  }

  destroy() {
    this.reset();
    this.listeners.clear();
  }
}

export const objectTracker = new ObjectTracker();
