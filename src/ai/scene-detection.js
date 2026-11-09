import { eventBus } from "../core/event-bus.js";

class SceneDetection {
  constructor() {
    this.threshold = 0.22;
    this.sampleInterval = 0.25;
    this.minSceneDuration = 0.4;
    this.cancelled = false;
    this.running = false;
  }

  configure(options = {}) {
    if (options.threshold !== undefined) {
      this.threshold = Math.max(
        0.01,
        Math.min(1, Number(options.threshold))
      );
    }

    if (options.sampleInterval !== undefined) {
      this.sampleInterval = Math.max(
        0.05,
        Number(options.sampleInterval)
      );
    }

    if (options.minSceneDuration !== undefined) {
      this.minSceneDuration = Math.max(
        0,
        Number(options.minSceneDuration)
      );
    }
  }

  async detect(video, options = {}) {
    if (!video || !Number.isFinite(video.duration)) {
      throw new Error("Valid video element required.");
    }

    if (this.running) {
      throw new Error("Scene detection is already running.");
    }

    this.running = true;
    this.cancelled = false;

    const settings = {
      ...options
    };

    this.configure(settings);

    const duration = video.duration;
    const originalTime = video.currentTime;
    const cuts = [];

    const canvas = document.createElement("canvas");
    const width = Math.min(160, video.videoWidth || 160);
    const height = Math.max(
      1,
      Math.round(
        width * (video.videoHeight / video.videoWidth)
      )
    );

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });

    if (!context) {
      this.running = false;
      throw new Error("Canvas processing unavailable.");
    }

    let previousFrame = null;

    try {
      await this.waitForVideo(video);

      for (
        let time = 0;
        time < duration;
        time += this.sampleInterval
      ) {
        if (this.cancelled) break;

        await this.seek(video, time);

        const currentFrame = this.capture(
          video,
          context,
          width,
          height
        );

        if (previousFrame) {
          const difference = this.compare(
            previousFrame,
            currentFrame
          );

          if (difference >= this.threshold) {
            const boundary = await this.refineBoundary(
              video,
              Math.max(0, time - this.sampleInterval),
              time,
              previousFrame,
              context,
              width,
              height
            );

            const lastCut = cuts[cuts.length - 1];
            const lastTime = lastCut?.time ?? 0;

            if (
              boundary - lastTime >= this.minSceneDuration
            ) {
              cuts.push({
                id: this.createId(),
                time: boundary,
                frameNumber: null,
                sourceTimestamp: boundary,
                confidence: Math.min(
                  1,
                  difference / Math.max(this.threshold, 0.001)
                ),
                type: "detected",
                reviewed: false
              });
            }
          }
        }

        previousFrame = currentFrame;

        eventBus.emit("SCENE_DETECTION_PROGRESS", {
          progress: Math.min(100, time / duration * 100),
          currentTime: time,
          duration
        });
      }

      const result = {
        duration,
        cuts,
        scenes: this.createScenes(duration, cuts),
        cancelled: this.cancelled,
        detectedAt: Date.now()
      };

      eventBus.emit("SCENE_DETECTION_COMPLETE", result);

      return result;
    } finally {
      try {
        await this.seek(video, originalTime);
      } catch (_) {}

      this.running = false;
    }
  }

  async waitForVideo(video) {
    if (video.readyState >= 2) return;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Video loading timed out."));
      }, 15000);

      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener("loadeddata", ready);
        video.removeEventListener("error", failed);
      };

      const ready = () => {
        cleanup();
        resolve();
      };

      const failed = () => {
        cleanup();
        reject(new Error("Video could not be decoded."));
      };

      video.addEventListener("loadeddata", ready, {
        once: true
      });

      video.addEventListener("error", failed, {
        once: true
      });
    });
  }

  async seek(video, time) {
    const target = Math.max(
      0,
      Math.min(video.duration, time)
    );

    if (Math.abs(video.currentTime - target) < 0.0001) {
      return;
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Video seek timed out."));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener("seeked", done);
        video.removeEventListener("error", failed);
      };

      const done = () => {
        cleanup();
        resolve();
      };

      const failed = () => {
        cleanup();
        reject(new Error("Video seek failed."));
      };

      video.addEventListener("seeked", done, {
        once: true
      });

      video.addEventListener("error", failed, {
        once: true
      });

      video.currentTime = target;
    });
  }

  capture(video, context, width, height) {
    context.drawImage(video, 0, 0, width, height);

    const image = context.getImageData(
      0,
      0,
      width,
      height
    );

    return image.data;
  }

  compare(previous, current) {
    let difference = 0;
    const pixels = current.length / 4;

    for (let i = 0; i < current.length; i += 16) {
      const r = Math.abs(current[i] - previous[i]);
      const g = Math.abs(current[i + 1] - previous[i + 1]);
      const b = Math.abs(current[i + 2] - previous[i + 2]);

      difference += (r + g + b) / 3;
    }

    const sampledPixels = Math.ceil(pixels / 4);

    return difference / sampledPixels / 255;
  }

  async refineBoundary(
    video,
    start,
    end,
    previousFrame,
    context,
    width,
    height
  ) {
    let low = start;
    let high = end;

    for (let i = 0; i < 7; i++) {
      if (this.cancelled) break;

      const middle = (low + high) / 2;

      await this.seek(video, middle);

      const frame = this.capture(
        video,
        context,
        width,
        height
      );

      const difference = this.compare(
        previousFrame,
        frame
      );

      if (difference >= this.threshold) {
        high = middle;
      } else {
        low = middle;
      }
    }

    return high;
  }

  createScenes(duration, cuts) {
    const boundaries = [
      0,
      ...cuts.map(cut => cut.time),
      duration
    ];

    const scenes = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      scenes.push({
        id: this.createId(),
        index: i,
        startTime: boundaries[i],
        endTime: boundaries[i + 1],
        duration: boundaries[i + 1] - boundaries[i],
        cutBefore: i > 0 ? cuts[i - 1].id : null
      });
    }

    return scenes;
  }

  cancel() {
    this.cancelled = true;

    eventBus.emit("SCENE_DETECTION_CANCELLED");
  }

  createId() {
    return `scene_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
  }
}

export const sceneDetection = new SceneDetection();
