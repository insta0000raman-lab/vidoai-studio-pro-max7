/* ZERO X MOTION
   Central Application Configuration
*/

export const APP_CONFIG = Object.freeze({
  name: "ZERO X MOTION",
  shortName: "ZXM",
  tagline: "CREATE WITHOUT LIMITS",
  version: "1.0.0",
  build: "development",
  projectFormatVersion: 1,

  storage: {
    databaseName: "zero-x-motion-db",
    databaseVersion: 1,
    projectStore: "projects",
    mediaStore: "media",
    settingsStore: "settings",
    autosaveDelay: 1500,
    recoveryEnabled: true
  },

  editor: {
    defaultWidth: 1080,
    defaultHeight: 1920,
    defaultFPS: 30,
    defaultDuration: 30,
    defaultBackground: "#080b13",
    minZoom: 10,
    maxZoom: 400,
    defaultZoom: 100,
    snapEnabled: true,
    autosaveEnabled: true,
    frameStep: 1
  },

  timeline: {
    pixelsPerSecond: 80,
    minimumPixelsPerSecond: 10,
    maximumPixelsPerSecond: 500,
    trackHeight: 46,
    rulerHeight: 28,
    defaultVideoTracks: 1,
    defaultAudioTracks: 1,
    defaultTextTracks: 1,
    snappingThreshold: 8,
    maximumUndoSteps: 100
  },

  preview: {
    maxPreviewWidth: 1920,
    maxPreviewHeight: 1920,
    playbackBuffer: 2,
    useProxyWhenAvailable: true,
    showSafeArea: false,
    showGrid: false
  },

  export: {
    defaultFormat: "mp4",
    defaultCodec: "avc1.42E01E",
    defaultAudioCodec: "mp4a.40.2",
    defaultFPS: 30,
    defaultBitrate: 8000000,
    defaultAudioBitrate: 192000,
    defaultResolution: "1080p",
    useWebCodecsWhenSupported: true,
    allowFFmpegFallback: true
  },

  media: {
    allowedVideoTypes: [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-matroska"
    ],
    allowedAudioTypes: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/mp4",
      "audio/aac"
    ],
    allowedImageTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ],
    maximumImportSize: 1024 * 1024 * 1024
  },

  animation: {
    defaultInterpolation: "linear",
    defaultEasing: "ease",
    defaultKeyframeDuration: 1,
    supportedProperties: [
      "x",
      "y",
      "scaleX",
      "scaleY",
      "rotation",
      "opacity",
      "anchorX",
      "anchorY",
      "volume",
      "brightness",
      "contrast",
      "saturation",
      "blur"
    ]
  },

  ratios: [
    {
      id: "9:16",
      name: "Portrait",
      width: 1080,
      height: 1920
    },
    {
      id: "16:9",
      name: "Landscape",
      width: 1920,
      height: 1080
    },
    {
      id: "1:1",
      name: "Square",
      width: 1080,
      height: 1080
    },
    {
      id: "4:5",
      name: "Social Portrait",
      width: 1080,
      height: 1350
    }
  ],

  colors: {
    background: "#080b13",
    panel: "#101522",
    accent: "#8b7cff",
    accentSecondary: "#45dfba",
    text: "#edf0fa",
    muted: "#8993a8",
    danger: "#ff647c",
    warning: "#ffbd69",
    success: "#45dfba"
  },

  features: {
    multiTrackTimeline: true,
    textLayers: true,
    keyframeAnimation: true,
    undoRedo: true,
    projectAutosave: true,
    offlineMode: true,
    audioTracks: true,
    effectsStack: true,
    sceneDetection: true,
    objectTracking: true,
    autoFrame: true,
    lyricsMode: true
  }
});

export const DEFAULT_PROJECT = Object.freeze({
  id: null,
  name: "Untitled Project",
  formatVersion: APP_CONFIG.projectFormatVersion,
  width: APP_CONFIG.editor.defaultWidth,
  height: APP_CONFIG.editor.defaultHeight,
  fps: APP_CONFIG.editor.defaultFPS,
  duration: APP_CONFIG.editor.defaultDuration,
  background: APP_CONFIG.editor.defaultBackground,
  tracks: [],
  assets: [],
  markers: [],
  createdAt: null,
  updatedAt: null
});

export const TOOL_IDS = Object.freeze([
  "media",
  "text",
  "effects",
  "audio",
  "elements",
  "ai",
  "project"
]);

export const TRACK_TYPES = Object.freeze({
  VIDEO: "video",
  AUDIO: "audio",
  TEXT: "text",
  IMAGE: "image",
  EFFECT: "effect"
});

export const CLIP_TYPES = Object.freeze({
  VIDEO: "video",
  AUDIO: "audio",
  TEXT: "text",
  IMAGE: "image"
});

export const APP_EVENTS = Object.freeze({
  PROJECT_CREATED: "project:created",
  PROJECT_LOADED: "project:loaded",
  PROJECT_UPDATED: "project:updated",
  PROJECT_SAVED: "project:saved",
  PROJECT_ERROR: "project:error",

  MEDIA_IMPORTED: "media:imported",
  MEDIA_REMOVED: "media:removed",

  CLIP_ADDED: "clip:added",
  CLIP_UPDATED: "clip:updated",
  CLIP_REMOVED: "clip:removed",
  CLIP_SELECTED: "clip:selected",

  TRACK_ADDED: "track:added",
  TRACK_REMOVED: "track:removed",

  PLAYBACK_STARTED: "playback:started",
  PLAYBACK_PAUSED: "playback:paused",
  PLAYBACK_SEEKED: "playback:seeked",

  HISTORY_CHANGED: "history:changed",
  EXPORT_STARTED: "export:started",
  EXPORT_PROGRESS: "export:progress",
  EXPORT_COMPLETED: "export:completed",
  EXPORT_FAILED: "export:failed",

  NOTIFICATION: "app:notification"
});

export function getRatioById(id) {
  return APP_CONFIG.ratios.find(ratio => ratio.id === id) || null;
}

export function getSupportedMediaType(file) {
  if (!file) return null;

  const type = file.type || "";

  if (APP_CONFIG.media.allowedVideoTypes.includes(type)) {
    return "video";
  }

  if (APP_CONFIG.media.allowedAudioTypes.includes(type)) {
    return "audio";
  }

  if (APP_CONFIG.media.allowedImageTypes.includes(type)) {
    return "image";
  }

  return null;
}

export function createProjectDefaults(name = "Untitled Project") {
  const now = new Date().toISOString();

  return {
    ...DEFAULT_PROJECT,
    id: crypto.randomUUID(),
    name,
    tracks: [],
    assets: [],
    markers: [],
    createdAt: now,
    updatedAt: now
  };
}

export function isFeatureEnabled(featureName) {
  return APP_CONFIG.features[featureName] === true;
  }
