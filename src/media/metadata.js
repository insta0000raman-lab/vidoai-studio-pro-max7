const VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime"
];

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif"
];

function getFileType(file) {
  if (!file) return "unknown";

  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";

  return "unknown";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";

  if (bytes === 0) return "0 Bytes";

  const units = ["Bytes", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function getAspectRatio(width, height) {
  if (!width || !height) return null;

  const divisor = greatestCommonDivisor(width, height);

  return {
    width: width / divisor,
    height: height / divisor,
    decimal: Number((width / height).toFixed(5)),
    label: `${width / divisor}:${height / divisor}`
  };
}

function greatestCommonDivisor(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));

  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a || 1;
}

function createMediaElement(type) {
  if (type === "video") {
    return document.createElement("video");
  }

  if (type === "image") {
    return new Image();
  }

  return null;
}

function loadMediaElement(element, url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    let finished = false;

    const timer = setTimeout(() => {
      finish(new Error("Media loading timed out"));
    }, timeout);

    function cleanup() {
      clearTimeout(timer);

      element.removeEventListener("loadedmetadata", onLoaded);
      element.removeEventListener("loadeddata", onLoaded);
      element.removeEventListener("load", onLoaded);
      element.removeEventListener("error", onError);
    }

    function finish(error) {
      if (finished) return;

      finished = true;
      cleanup();

      if (error) {
        reject(error);
      } else {
        resolve(element);
      }
    }

    function onLoaded() {
      finish(null);
    }

    function onError() {
      finish(new Error("Could not read media file"));
    }

    if (element instanceof HTMLVideoElement) {
      element.preload = "metadata";
      element.muted = true;
      element.playsInline = true;
      element.addEventListener("loadedmetadata", onLoaded, { once: true });
    } else {
      element.addEventListener("load", onLoaded, { once: true });
    }

    element.addEventListener("error", onError, { once: true });

    element.src = url;

    if (element instanceof HTMLImageElement && element.complete) {
      if (element.naturalWidth > 0) {
        finish(null);
      }
    }
  });
}

function getVideoDimensions(video) {
  return {
    width: video.videoWidth || 0,
    height: video.videoHeight || 0
  };
}

function getImageDimensions(image) {
  return {
    width: image.naturalWidth || image.width || 0,
    height: image.naturalHeight || image.height || 0
  }
}

function getVideoDuration(video) {
  const duration = Number(video.duration);

  if (!Number.isFinite(duration) || duration < 0) {
    return null;
  }

  return duration;
}

function getFrameRateHint(file) {
  const name = file.name || "";

  const match = name.match(
    /(?:^|[_\-. ])(\d{2,3})(?:fps|[_\-. ]fps)/i
  );

  if (!match) return null;

  const value = Number(match[1]);

  if (value < 1 || value > 240) return null;

  return {
    value,
    source: "filename-hint",
    reliable: false
  };
}

function getVideoInfo(video, file) {
  const dimensions = getVideoDimensions(video);

  return {
    type: "video",
    duration: getVideoDuration(video),
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: getAspectRatio(
      dimensions.width,
      dimensions.height
    ),
    frameRate: null,
    frameRateHint: getFrameRateHint(file),
    readyState: video.readyState,
    hasAudio: null,
    fileSize: file.size,
    fileSizeText: formatBytes(file.size),
    mimeType: file.type || "unknown",
    fileName: file.name,
    lastModified: file.lastModified || null
  };
}

function getImageInfo(image, file) {
  const dimensions = getImageDimensions(image);

  return {
    type: "image",
    duration: null,
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: getAspectRatio(
      dimensions.width,
      dimensions.height
    ),
    frameRate: null,
    fileSize: file.size,
    fileSizeText: formatBytes(file.size),
    mimeType: file.type || "unknown",
    fileName: file.name,
    lastModified: file.lastModified || null
  };
}

export async function readMediaMetadata(file, options = {}) {
  if (!(file instanceof Blob)) {
    throw new TypeError("A valid media file is required");
  }

  const type = getFileType(file);

  if (type !== "video" && type !== "image") {
    throw new Error("Unsupported media type");
  }

  const allowedTypes = type === "video"
    ? VIDEO_TYPES
    : IMAGE_TYPES;

  if (file.type && !allowedTypes.includes(file.type)) {
    throw new Error(`Unsupported ${type} format`);
  }

  const url = URL.createObjectURL(file);
  const element = createMediaElement(type);

  if (!element) {
    URL.revokeObjectURL(url);
    throw new Error("Could not create media reader");
  }

  try {
    await loadMediaElement(
      element,
      url,
      options.timeout || 20000
    );

    const metadata = type === "video"
      ? getVideoInfo(element, file)
      : getImageInfo(element, file);

    return {
      ...metadata,
      id: options.id || null,
      sourceUrl: url,
      readable: true,
      metadataReadAt: new Date().toISOString()
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    if (element instanceof HTMLVideoElement) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
  }
}

export function releaseMediaMetadata(metadata) {
  if (!metadata?.sourceUrl) return;

  URL.revokeObjectURL(metadata.sourceUrl);
}

export function validateMediaFile(file) {
  if (!(file instanceof Blob)) {
    return {
      valid: false,
      reason: "Invalid file"
    };
  }

  const type = getFileType(file);

  if (type === "unknown" || type === "audio") {
    return {
      valid: false,
      reason: "Unsupported media type"
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      reason: "File is empty"
    };
  }

  return {
    valid: true,
    type,
    size: file.size,
    sizeText: formatBytes(file.size)
  };
}

export {
  getFileType,
  formatBytes,
  getAspectRatio,
  getFrameRateHint
};
