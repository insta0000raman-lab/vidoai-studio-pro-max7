/* ZERO X MOTION — VALIDATION ENGINE */

import {
  APP_CONFIG,
  TRACK_TYPES,
  CLIP_TYPES
} from "../config.js";

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function check(condition, message, field) {
  if (!condition) {
    throw new ValidationError(message, field);
  }
}

export function validateProject(project) {
  check(project && typeof project === "object",
    "Invalid project data.", "project");

  check(isNonEmptyString(project.name),
    "Project name cannot be empty.", "name");

  check(isNumber(project.width) && project.width > 0,
    "Project width must be a positive number.", "width");

  check(isNumber(project.height) && project.height > 0,
    "Project height must be a positive number.", "height");

  check(isNumber(project.fps) && project.fps > 0 && project.fps <= 240,
    "FPS must be between 1 and 240.", "fps");

  check(isNumber(project.duration) && project.duration >= 0,
    "Project duration cannot be negative.", "duration");

  check(Array.isArray(project.tracks),
    "Project tracks must be an array.", "tracks");

  check(Array.isArray(project.assets),
    "Project assets must be an array.", "assets");

  check(Array.isArray(project.markers),
    "Project markers must be an array.", "markers");

  project.tracks.forEach(validateTrack);
  project.assets.forEach(validateAsset);
  project.markers.forEach(validateMarker);

  return {
    valid: true,
    errors: []
  };
}

export function validateTrack(track) {
  check(track && typeof track === "object",
    "Invalid track.", "track");

  check(isNonEmptyString(track.id),
    "Track ID is required.", "track.id");

  check(
    Object.values(TRACK_TYPES).includes(track.type),
    "Unsupported track type.", "track.type"
  );

  check(Array.isArray(track.clips),
    "Track clips must be an array.", "track.clips");

  track.clips.forEach(validateClip);

  return true;
}

export function validateClip(clip) {
  check(clip && typeof clip === "object",
    "Invalid clip.", "clip");

  check(isNonEmptyString(clip.id),
    "Clip ID is required.", "clip.id");

  check(
    Object.values(CLIP_TYPES).includes(clip.type),
    "Unsupported clip type.", "clip.type"
  );

  check(isNumber(clip.start) && clip.start >= 0,
    "Clip start time is invalid.", "clip.start");

  check(isNumber(clip.duration) && clip.duration > 0,
    "Clip duration must be greater than zero.", "clip.duration");

  if (clip.sourceStart !== undefined) {
    check(isNumber(clip.sourceStart) && clip.sourceStart >= 0,
      "Invalid source start time.", "clip.sourceStart");
  }

  if (clip.speed !== undefined) {
    check(isNumber(clip.speed) && clip.speed > 0,
      "Clip speed must be greater than zero.", "clip.speed");
  }

  if (clip.opacity !== undefined) {
    check(isNumber(clip.opacity) &&
      clip.opacity >= 0 && clip.opacity <= 1,
      "Opacity must be between 0 and 1.", "clip.opacity");
  }

  if (clip.keyframes !== undefined) {
    check(Array.isArray(clip.keyframes),
      "Keyframes must be an array.", "clip.keyframes");
  }

  return true;
}

export function validateAsset(asset) {
  check(asset && typeof asset === "object",
    "Invalid media asset.", "asset");

  check(isNonEmptyString(asset.id),
    "Media asset ID is required.", "asset.id");

  check(isNonEmptyString(asset.name),
    "Media asset name is required.", "asset.name");

  check(
    ["video", "audio", "image"].includes(asset.type),
    "Unsupported media asset type.", "asset.type"
  );

  return true;
}

export function validateMarker(marker) {
  check(marker && typeof marker === "object",
    "Invalid timeline marker.", "marker");

  check(isNonEmptyString(marker.id),
    "Marker ID is required.", "marker.id");

  check(isNumber(marker.time) && marker.time >= 0,
    "Marker time must be zero or greater.", "marker.time");

  return true;
}

export function validateMediaFile(file) {
  check(file instanceof Blob,
    "Selected file is invalid.", "file");

  check(file.size > 0,
    "Selected file is empty.", "file");

  check(
    file.size <= APP_CONFIG.media.maximumImportSize,
    "File exceeds the maximum import size.", "file"
  );

  const allowedTypes = [
    ...APP_CONFIG.media.allowedVideoTypes,
    ...APP_CONFIG.media.allowedAudioTypes,
    ...APP_CONFIG.media.allowedImageTypes
  ];

  check(
    allowedTypes.includes(file.type),
    "This media format is not supported.", "file.type"
  );

  return true;
}

export function validateExportSettings(settings) {
  check(settings && typeof settings === "object",
    "Export settings are missing.", "settings");

  const allowedFormats = ["mp4", "webm"];

  check(
    allowedFormats.includes(settings.format),
    "Unsupported export format.", "format"
  );

  check(
    isNumber(settings.width) &&
    settings.width > 0 &&
    settings.width <= 7680,
    "Export width must be between 1 and 7680.", "width"
  );

  check(
    isNumber(settings.height) &&
    settings.height > 0 &&
    settings.height <= 7680,
    "Export height must be between 1 and 7680.", "height"
  );

  check(
    isNumber(settings.fps) &&
    settings.fps > 0 &&
    settings.fps <= 240,
    "Export FPS must be between 1 and 240.", "fps"
  );

  if (settings.bitrate !== undefined) {
    check(
      isNumber(settings.bitrate) &&
      settings.bitrate >= 100000 &&
      settings.bitrate <= 100000000,
      "Export bitrate is outside the supported range.",
      "bitrate"
    );
  }

  return true;
}

export function validateSafely(validator, value) {
  try {
    validator(value);

    return {
      valid: true,
      errors: []
    };
  } catch (error) {
    return {
      valid: false,
      errors: [{
        message: error.message,
        field: error.field || null
      }]
    };
  }
}
