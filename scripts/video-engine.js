
/* =====================================================
   VPEET STUDIO — VIDEO PROCESSING ENGINE
   FFmpeg WebAssembly Integration
   Trim / Crop / Blur / Resize / FPS / Color / Text / Audio
===================================================== */

(function () {
  "use strict";

  const project = window.VPEET_PROJECT =
    window.VPEET_PROJECT || {};

  let ffmpeg = null;
  let loaded = false;
  let busy = false;
  let cancelled = false;

  let progressCallback = () => {};
  let logCallback = () => {};

  const state = {
    inputName: "vpeet_input.mp4",
    outputName: "vpeet_export.mp4",
    progress: 0,
    status: "idle"
  };

  /* =========================================
     HELPERS
  ========================================= */

  function emit(name, detail = {}) {
    window.dispatchEvent(
      new CustomEvent("vpeet:" + name, {
        detail
      })
    );
  }

  function log(message) {
    console.log("[VPEET ENGINE]", message);
    logCallback(message);
    emit("engine-log", { message });
  }

  function setProgress(value) {
    state.progress = Math.max(
      0,
      Math.min(100, Number(value) || 0)
    );

    progressCallback(state.progress);

    emit("render-progress", {
      progress: state.progress
    });
  }

  function getFFmpegClass() {
    if (window.FFmpegWASM?.FFmpeg) {
      return window.FFmpegWASM.FFmpeg;
    }

    if (window.FFmpeg?.FFmpeg) {
      return window.FFmpeg.FFmpeg;
    }

    return null;
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function seconds(value) {
    return Math.max(0, safeNumber(value))
      .toFixed(3);
  }

  function escapeDrawtext(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "\\'")
      .replace(/%/g, "\\%")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  /* =========================================
     LOAD FFMPEG
  ========================================= */

  async function initialize(options = {}) {
    if (loaded && ffmpeg) return true;

    const FFmpegClass = getFFmpegClass();

    if (!FFmpegClass) {
      throw new Error(
        "FFmpeg WebAssembly library is not loaded. " +
        "FFmpeg core must be added to index.html first."
      );
    }

    ffmpeg = new FFmpegClass();

    ffmpeg.on("progress", event => {
      const percent = event.progress * 100;

      setProgress(percent);
    });

    ffmpeg.on("log", event => {
      log(event.message);
    });

    const loadOptions = {};

    if (options.coreURL && options.wasmURL) {
      loadOptions.coreURL = options.coreURL;
      loadOptions.wasmURL = options.wasmURL;
    }

    await ffmpeg.load(loadOptions);

    loaded = true;

    state.status = "ready";

    emit("engine-ready");

    log("FFmpeg WebAssembly loaded.");

    return true;
  }

  /* =========================================
     INPUT FILE
  ========================================= */

  async function writeInput(file) {
    if (!ffmpeg || !loaded) {
      throw new Error("Initialize the engine first.");
    }

    if (!(file instanceof Blob)) {
      throw new Error("A valid video file is required.");
    }

    await ffmpeg.writeFile(
      state.inputName,
      new Uint8Array(await file.arrayBuffer())
    );

    log("Video added to processing memory.");
  }

  /* =========================================
     VIDEO SETTINGS
  ========================================= */

  function getVideoSettings() {
    const settings = {
      ...(project.export || {}),
      ...(project.defaults?.export || {})
    };

    return settings;
  }

  function getEffectSettings() {
    if (window.VPEET_EFFECTS) {
      return window.VPEET_EFFECTS.getExportSettings();
    }

    return project.effects || {};
  }

  function getTextLayers() {
    return (project.textLayers || []).filter(
      layer => !layer.hidden
    );
  }

  /* =========================================
     RESOLUTION
  ========================================= */

  function getResolution() {
    const settings = getVideoSettings();

    const resolution =
      settings.resolution ||
      settings.quality ||
      "1080p";

    const resolutions = {
      "480p": 480,
      "720p": 720,
      "1080p": 1080,
      "1440p": 1440,
      "2160p": 2160
    };

    return resolutions[resolution] || 1080;
  }

  function getFPS() {
    const settings = getVideoSettings();

    const fps = safeNumber(
      settings.fps,
      30
    );

    return Math.max(24, Math.min(60, fps));
  }

  function getBitrate() {
    const settings = getVideoSettings();

    const quality = settings.bitrate ||
      settings.qualityPreset ||
      "high";

    const bitrates = {
      low: "2500k",
      medium: "5000k",
      high: "8000k",
      ultra: "14000k"
    };

    if (typeof quality === "number") {
      return Math.max(1000, quality) + "k";
    }

    return bitrates[quality] || "8000k";
  }

  /* =========================================
     ASPECT RATIO
  ========================================= */

  function getRatio() {
    const ratio =
      project.aspectRatio ||
      "9:16";

    const parts = String(ratio).split(":");

    const width = Number(parts[0]);
    const height = Number(parts[1]);

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return [9, 16];
    }

    return [width, height];
  }

  function getDimensions() {
    const [ratioW, ratioH] = getRatio();

    const targetHeight = getResolution();

    let width = Math.round(
      targetHeight * ratioW / ratioH
    );

    let height = targetHeight;

    width = Math.max(2, Math.round(width / 2) * 2);
    height = Math.max(2, Math.round(height / 2) * 2);

    return { width, height };
  }

  /* =========================================
     VIDEO FILTERS
  ========================================= */

  function buildColorFilters() {
    const effects = getEffectSettings();

    const filters = [];

    const brightness =
      safeNumber(effects.brightness, 100) / 100;

    const exposure =
      safeNumber(effects.exposure, 0);

    const contrast =
      safeNumber(effects.contrast, 100) / 100;

    const saturation =
      safeNumber(effects.saturation, 100) / 100;

    filters.push(
      "eq=brightness=" +
      (brightness - 1 + exposure / 100).toFixed(3) +
      ":contrast=" + contrast.toFixed(3) +
      ":saturation=" + saturation.toFixed(3)
    );

    const temperature =
      safeNumber(effects.temperature, 0);

    const tint =
      safeNumber(effects.tint, 0);

    if (temperature !== 0 || tint !== 0) {
      const red = Math.max(
        0.5,
        Math.min(1.5, 1 + temperature / 200)
      );

      const blue = Math.max(
        0.5,
        Math.min(1.5, 1 - temperature / 200)
      );

      const green = Math.max(
        0.5,
        Math.min(1.5, 1 + tint / 200)
      );

      filters.push(
        "colorbalance=rs=" + (red - 1).toFixed(3) +
        ":gs=" + (green - 1).toFixed(3) +
        ":bs=" + (blue - 1).toFixed(3)
      );
    }

    const sharpen = safeNumber(effects.sharpen, 0);

    if (sharpen > 0) {
      const amount = Math.min(2, sharpen / 50);

      filters.push(
        "unsharp=5:5:" +
        amount.toFixed(2) +
        ":5:5:0"
      );
    }

    const fade = safeNumber(effects.fade, 0);

    if (fade > 0) {
      filters.push(
        "eq=gamma=" +
        (1 - fade / 200).toFixed(3)
      );
    }

    return filters;
  }

  /* =========================================
     CROP / BLUR BACKGROUND
  ========================================= */

  function buildVideoFilters() {
    const dimensions = getDimensions();

    const width = dimensions.width;
    const height = dimensions.height;

    const borderMode =
      project.borderMode || "crop";

    const filters = [];

    if (borderMode === "blur") {
      filters.push(
        "split=2[background][foreground]"
      );

      filters.push(
        "[background]scale=" +
        width + ":" + height +
        ":force_original_aspect_ratio=increase," +
        "crop=" + width + ":" + height +
        ",boxblur=20:10[bg]"
      );

      filters.push(
        "[foreground]scale=" +
        width + ":" + height +
        ":force_original_aspect_ratio=decrease[fg]"
      );

      filters.push(
        "[bg][fg]overlay=(W-w)/2:(H-h)/2"
      );
    } else {
      filters.push(
        "scale=" +
        width + ":" + height +
        ":force_original_aspect_ratio=increase"
      );

      filters.push(
        "crop=" + width + ":" + height
      );
    }

    filters.push(...buildColorFilters());

    filters.push(
      "fps=" + getFPS()
    );

    return {
      filters,
      dimensions
    };
  }

  /* =========================================
     TEXT LAYERS
  ========================================= */

  function buildTextFilters() {
    const layers = getTextLayers();

    const filters = [];

    layers.forEach(layer => {
      const text = escapeDrawtext(layer.text);

      if (!text) return;

      const start = safeNumber(layer.start);
      const end = safeNumber(layer.end, 5);

      if (end <= start) return;

      const x = safeNumber(layer.x, 50);
      const y = safeNumber(layer.y, 50);

      const fontSize = Math.max(
        8,
        Math.min(200, safeNumber(layer.size, 36))
      );

      const color = String(
        layer.color || "#ffffff"
      ).replace("#", "0x");

      const alpha = Math.max(
        0,
        Math.min(1, safeNumber(layer.opacity, 1))
      );

      filters.push(
        "drawtext=text='" + text + "'" +
        ":fontsize=" + fontSize +
        ":fontcolor=" + color +
        "@" + alpha.toFixed(2) +
        ":x=(w-text_w)*" + (x / 100).toFixed(3) +
        ":y=(h-text_h)*" + (y / 100).toFixed(3) +
        ":enable='between(t," +
        seconds(start) + "," +
        seconds(end) + ")'"
      );
    });

    return filters;
  }

  /* =========================================
     TRIM
  ========================================= */

  function getTrimSettings() {
    const start = Math.max(
      0,
      safeNumber(project.trimStart, 0)
    );

    const end = safeNumber(
      project.trimEnd,
      project.duration || 0
    );

    if (end > 0 && end <= start) {
      throw new Error(
        "Trim end must be greater than trim start."
      );
    }

    return { start, end };
  }

  /* =========================================
     AUDIO FILTERS
  ========================================= */

  function getAudioSettings() {
    const audio = project.audio || {};

    return {
      file: audio.file || null,
      start: safeNumber(audio.start, 0),
      end: audio.end,
      volume: safeNumber(audio.volume, 80),
      videoVolume: safeNumber(audio.videoVolume, 100),
      fadeIn: safeNumber(audio.fadeIn, 0),
      fadeOut: safeNumber(audio.fadeOut, 0)
    };
  }

  /* =========================================
     EXPORT COMMAND
  ========================================= */

  function buildCommand() {
    const command = [];

    const trim = getTrimSettings();

    const audio = getAudioSettings();

    const videoFilters = buildVideoFilters();

    const textFilters = buildTextFilters();

    command.push("-i", state.inputName);

    let audioInputIndex = -1;

    if (audio.file) {
      audioInputIndex = 1;
      command.push("-i", "vpeet_audio_input");
    }

    const allFilters = [
      ...videoFilters.filters,
      ...textFilters
    ];

    command.push(
      "-filter_complex",
      allFilters.join(",")
    );

    if (trim.start > 0) {
      command.push("-ss", seconds(trim.start));
    }

    if (trim.end > 0) {
      command.push("-to", seconds(trim.end));
    }

    command.push(
      "-map", "0:v:0"
    );

    if (audio.file) {
      command.push(
        "-map", "1:a:0?"
      );
    } else {
      command.push(
        "-map", "0:a:0?"
      );
    }

    command.push(
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-b:v", getBitrate(),
      "-pix_fmt", "yuv420p",
      "-r", String(getFPS()),
      "-movflags", "+faststart"
    );

    if (audio.file) {
      command.push(
        "-c:a", "aac",
        "-b:a", "192k"
      );
    } else {
      command.push("-c:a", "aac");
    }

    command.push(
      "-shortest",
      state.outputName
    );

    return command;
  }

  /* =========================================
     CANCEL
  ========================================= */

  function cancel() {
    if (!ffmpeg || !busy) return;

    cancelled = true;

    try {
      ffmpeg.terminate();
    } catch (error) {
      log("Render cancellation requested.");
    }

    busy = false;
    state.status = "cancelled";

    emit("render-cancelled");
  }

  /* =========================================
     EXPORT
  ========================================= */

  async function render(options = {}) {
    if (busy) {
      throw new Error("A render is already running.");
    }

    if (!project.video) {
      throw new Error("Please upload a video first.");
    }

    busy = true;
    cancelled = false;

    state.status = "rendering";
    state.outputName =
      options.outputName || "vpeet_export.mp4";

    setProgress(0);

    emit("render-started");

    try {
      await initialize(options);

      await writeInput(project.video);

      /*
        Audio file is written separately when present.
        A later audio-mix stage will combine it with
        original video audio and apply fade controls.
      */

      const audio = getAudioSettings();

      if (audio.file) {
        await ffmpeg.writeFile(
          "vpeet_audio_input",
          new Uint8Array(
            await audio.file.arrayBuffer()
          )
        );
      }

      const command = buildCommand();

      log("Starting video render.");

      await ffmpeg.exec(command);

      if (cancelled) {
        throw new Error("Render cancelled.");
      }

      const data = await ffmpeg.readFile(
        state.outputName
      );

      const output = new Blob(
        [data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength
        )],
        { type: "video/mp4" }
      );

      state.status = "completed";

      setProgress(100);

      emit("render-completed", {
        blob: output,
        fileName: state.outputName,
        size: output.size
      });

      log("Render completed.");

      return output;

    } catch (error) {
      state.status = cancelled
        ? "cancelled"
        : "error";

      emit("render-error", {
        message: error.message
      });

      log("Render failed: " + error.message);

      throw error;

    } finally {
      busy = false;
    }
  }

  /* =========================================
     PUBLIC API
  ========================================= */

  window.VPEET_ENGINE = {
    initialize,
    writeInput,
    buildCommand,
    buildVideoFilters,
    buildTextFilters,
    getDimensions,
    render,
    cancel,

    setProgressCallback(callback) {
      progressCallback =
        typeof callback === "function"
          ? callback
          : () => {};
    },

    setLogCallback(callback) {
      logCallback =
        typeof callback === "function"
          ? callback
          : () => {};
    },

    getStatus() {
      return { ...state };
    },

    isBusy() {
      return busy;
    }
  };

  console.log("VPEET Video Engine Initialized.");

})();
  
