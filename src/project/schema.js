/* ZERO X MOTION — PROJECT SCHEMA */

import { APP_CONFIG, TRACK_TYPES, CLIP_TYPES } from "../config.js";

export const PROJECT_SCHEMA_VERSION = 1;

export const PROJECT_DEFAULTS = Object.freeze({
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 30,
  background: "#080b13"
});

export function createId(prefix = "item") {
  const id = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${id}`;
}

export function createProject(name = "Untitled Project", options = {}) {
  const now = new Date().toISOString();

  return {
    id: createId("project"),
    name,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    appVersion: APP_CONFIG.version,

    settings: {
      width: options.width || PROJECT_DEFAULTS.width,
      height: options.height || PROJECT_DEFAULTS.height,
      fps: options.fps || PROJECT_DEFAULTS.fps,
      duration: options.duration ?? PROJECT_DEFAULTS.duration,
      background: options.background || PROJECT_DEFAULTS.background,
      aspectRatio: options.aspectRatio || "9:16"
    },

    tracks: [],
    assets: [],
    markers: [],

    metadata: {
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    }
  };
}

export function createTrack(type = TRACK_TYPES.VIDEO, name = null) {
  if (!Object.values(TRACK_TYPES).includes(type)) {
    throw new Error(`Unsupported track type: ${type}`);
  }

  return {
    id: createId("track"),
    type,
    name: name || `${type.toUpperCase()} Track`,
    enabled: true,
    locked: false,
    muted: false,
    solo: false,
    volume: 1,
    clips: [],
    order: 0
  };
}

export function createClip(type, assetId, options = {}) {
  if (!Object.values(CLIP_TYPES).includes(type)) {
    throw new Error(`Unsupported clip type: ${type}`);
  }

  return {
    id: createId("clip"),
    type,
    assetId: assetId || null,

    name: options.name || "New Clip",

    // Timeline position and source range are in seconds.
    start: options.start ?? 0,
    duration: options.duration ?? 5,
    sourceStart: options.sourceStart ?? 0,
    sourceEnd: options.sourceEnd ?? null,

    speed: options.speed ?? 1,
    reverse: false,
    frozen: false,

    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      opacity: 1
    },

    crop: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    },

    audio: {
      enabled: type === CLIP_TYPES.AUDIO || type === CLIP_TYPES.VIDEO,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0
    },

    effects: [],
    keyframes: [],
    animation: {
      enabled: true,
      interpolation: "linear"
    },

    metadata: {
      createdAt: new Date().toISOString()
    }
  };
}

export function createAsset(file, type, metadata = {}) {
  if (!file || typeof file !== "object") {
    throw new TypeError("A valid media file is required.");
  }

  if (!["video", "audio", "image"].includes(type)) {
    throw new Error(`Unsupported asset type: ${type}`);
  }

  return {
    id: createId("asset"),
    name: file.name || "Untitled Media",
    type,
    mimeType: file.type || "application/octet-stream",
    size: file.size || 0,

    // Actual file data is stored separately in media storage.
    storageKey: null,

    metadata: {
      duration: metadata.duration ?? null,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      frameRate: metadata.frameRate ?? null,
      hasAudio: metadata.hasAudio ?? null,
      ...metadata
    },

    createdAt: new Date().toISOString()
  };
}

export function createKeyframe(property, time, value, easing = "linear") {
  if (typeof property !== "string" || !property.trim()) {
    throw new TypeError("Keyframe property is required.");
  }

  if (!Number.isFinite(time) || time < 0) {
    throw new TypeError("Keyframe time must be non-negative.");
  }

  return {
    id: createId("keyframe"),
    property,
    time,
    value,
    easing,
    interpolation: "linear",
    handles: {
      in: null,
      out: null
    }
  };
}

export function createEffect(type, parameters = {}) {
  if (!type || typeof type !== "string") {
    throw new TypeError("Effect type is required.");
  }

  return {
    id: createId("effect"),
    type,
    enabled: true,
    amount: 1,
    parameters: { ...parameters },
    keyframes: [],
    createdAt: new Date().toISOString()
  };
}

export function createMarker(time, label = "Marker", color = "#45dfba") {
  if (!Number.isFinite(time) || time < 0) {
    throw new TypeError("Marker time must be non-negative.");
  }

  return {
    id: createId("marker"),
    time,
    label,
    color
  };
}

export function createTextClip(options = {}) {
  const clip = createClip(
    CLIP_TYPES.TEXT,
    null,
    {
      name: options.name || "Text Layer",
      start: options.start ?? 0,
      duration: options.duration ?? 5
    }
  );

  clip.text = {
    content: options.content || "Your Text",
    fontFamily: options.fontFamily || "Arial",
    fontSize: options.fontSize || 72,
    fontWeight: options.fontWeight || 700,
    color: options.color || "#ffffff",
    alignment: options.alignment || "center",
    letterSpacing: 0,
    lineHeight: 1.2,
    stroke: {
      enabled: false,
      color: "#000000",
      width: 2
    },
    shadow: {
      enabled: false,
      color: "#000000",
      blur: 10,
      x: 0,
      y: 4
    }
  };

  return clip;
}

export function createAutoFrameData() {
  return {
    enabled: false,
    target: null,
    mode: "object",
    scenes: [],
    confidenceThreshold: 0.65,
    lastAnalysisAt: null
  };
}

export function createSceneFrame(options = {}) {
  return {
    id: createId("scene"),
    startTimestamp: options.startTimestamp ?? 0,
    endTimestamp: options.endTimestamp ?? 0,
    startFrame: options.startFrame ?? null,
    endFrame: options.endFrame ?? null,
    timebase: options.timebase ?? null,

    framing: {
      x: options.x ?? 0.5,
      y: options.y ?? 0.5,
      scale: options.scale ?? 1
    },

    confidence: options.confidence ?? null,
    needsReview: options.needsReview ?? false,
    manuallyAdjusted: false
  };
}

export function touchProject(project) {
  if (!project.metadata) {
    project.metadata = {};
  }

  project.metadata.updatedAt = new Date().toISOString();

  return project;
}

export function serializeProject(project) {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json) {
  const project = typeof json === "string"
    ? JSON.parse(json)
    : json;

  if (!project || typeof project !== "object") {
    throw new Error("Invalid project file.");
  }

  if (!project.id || !project.settings || !Array.isArray(project.tracks)) {
    throw new Error("Project file is missing required fields.");
  }

  return project;
      }
