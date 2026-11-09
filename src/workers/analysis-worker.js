const analysisJobs = new Map();

function send(type, jobId, data = {}) {
  self.postMessage({
    type,
    jobId,
    ...data
  });
}

function isCancelled(jobId) {
  return analysisJobs.get(jobId)?.cancelled === true;
}

function checkCancelled(jobId) {
  if (isCancelled(jobId)) {
    throw new Error("Analysis cancelled.");
  }
}

function calculateFrameDifference(previous, current) {
  if (
    !previous ||
    !current ||
    previous.length !== current.length
  ) {
    throw new Error("Invalid frame image data.");
  }

  let totalDifference = 0;
  let samples = 0;

  const step = 16;

  for (let i = 0; i < previous.length; i += step * 4) {
    const r1 = previous[i];
    const g1 = previous[i + 1];
    const b1 = previous[i + 2];

    const r2 = current[i];
    const g2 = current[i + 1];
    const b2 = current[i + 2];

    const difference =
      Math.abs(r1 - r2) +
      Math.abs(g1 - g2) +
      Math.abs(b1 - b2);

    totalDifference += difference / 3;
    samples++;
  }

  return samples
    ? totalDifference / (samples * 255)
    : 0;
}

function detectSceneCuts(message, jobId) {
  const {
    frames = [],
    threshold = 0.28,
    fps = 30
  } = message;

  if (frames.length < 2) {
    return [];
  }

  const cuts = [];

  for (let i = 1; i < frames.length; i++) {
    checkCancelled(jobId);

    const difference = calculateFrameDifference(
      frames[i - 1].data,
      frames[i].data
    );

    if (difference >= threshold) {
      const frame = frames[i].frameNumber ?? i;

      cuts.push({
        frameNumber: frame,
        timestamp: frames[i].timestamp ??
          frame / fps,
        difference,
        confidence: Math.min(1, difference / threshold)
      });
    }

    if (i % 20 === 0) {
      send("progress", jobId, {
        completed: i,
        total: frames.length - 1,
        progress: i / (frames.length - 1)
      });
    }
  }

  return cuts;
}

function calculateBrightness(imageData) {
  const data = imageData.data;
  let total = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 16) {
    const brightness =
      0.2126 * data[i] +
      0.7152 * data[i + 1] +
      0.0722 * data[i + 2];

    total += brightness;
    count++;
  }

  return count ? total / count : 0;
}

function calculateContrast(imageData) {
  const data = imageData.data;
  let sum = 0;
  let squareSum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 16) {
    const value =
      0.2126 * data[i] +
      0.7152 * data[i + 1] +
      0.0722 * data[i + 2];

    sum += value;
    squareSum += value * value;
    count++;
  }

  if (!count) return 0;

  const mean = sum / count;
  const variance = squareSum / count - mean * mean;

  return Math.sqrt(Math.max(0, variance));
}

function analyzeFrame(message) {
  const { imageData } = message;

  if (!imageData?.data) {
    throw new Error("Frame image data is missing.");
  }

  return {
    brightness: calculateBrightness(imageData),
    contrast: calculateContrast(imageData),
    width: imageData.width,
    height: imageData.height
  };
}

async function runObjectDetection(message, jobId) {
  const { imageData, modelUrl, threshold = 0.45 } = message;

  if (!modelUrl) {
    throw new Error(
      "Object detection model is not connected."
    );
  }

  if (typeof importScripts !== "function") {
    throw new Error(
      "This worker cannot load the requested model script."
    );
  }

  checkCancelled(jobId);

  importScripts(modelUrl);

  if (typeof self.ZEROX_OBJECT_MODEL === "undefined") {
    throw new Error(
      "Model script did not expose ZEROX_OBJECT_MODEL."
    );
  }

  const model = self.ZEROX_OBJECT_MODEL;

  if (typeof model.detect !== "function") {
    throw new Error(
      "Model must provide a detect(imageData) method."
    );
  }

  const predictions = await model.detect(imageData);

  checkCancelled(jobId);

  return predictions
    .filter(item => Number(item.score) >= threshold)
    .map(item => ({
      label: String(item.label || "unknown"),
      score: Number(item.score),
      box: item.box || null
    }));
}

async function runJob(message) {
  const jobId = message.jobId;

  analysisJobs.set(jobId, {
    cancelled: false
  });

  try {
    let result;

    switch (message.task) {
      case "scene-detection":
        result = detectSceneCuts(message, jobId);
        break;

      case "frame-analysis":
        result = analyzeFrame(message);
        break;

      case "object-detection":
        result = await runObjectDetection(message, jobId);
        break;

      default:
        throw new Error(
          `Unknown analysis task: ${message.task}`
        );
    }

    checkCancelled(jobId);

    send("complete", jobId, {
      task: message.task,
      result
    });

  } catch (error) {
    send("error", jobId, {
      task: message.task,
      message: error.message
    });

  } finally {
    analysisJobs.delete(jobId);
  }
}

self.addEventListener("message", event => {
  const message = event.data || {};

  if (message.type === "analyze") {
    runJob(message);
    return;
  }

  if (message.type === "cancel") {
    const job = analysisJobs.get(message.jobId);

    if (job) {
      job.cancelled = true;
    }

    return;
  }

  if (message.type === "ping") {
    send("pong", message.jobId);
  }
});
