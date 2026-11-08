
/* =====================================================
   VPEET STUDIO — VIDEO ENGINE
   FFmpeg.wasm 0.12.10
   Video: Trim / Crop / Blur / Resize / FPS / Colour
   Text: Browser Canvas PNG overlays
   Audio: Original + Added audio mix / volume / fades
===================================================== */

(function () {
  "use strict";

  const project = window.VPEET_PROJECT =
    window.VPEET_PROJECT || {};

  const CORE_BASE =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

  const state = {
    ffmpeg: null,
    loaded: false,
    busy: false,
    cancelled: false,
    progress: 0,
    status: "idle",
    inputName: "vpeet_input.mp4",
    audioName: "vpeet_audio.mp3",
    outputName: "vpeet_export.mp4",
    progressCallback: null,
    logCallback: null,
    lastBlob: null
  };

  const $ = (s) => document.querySelector(s);

  function emit(name, detail = {}) {
    window.dispatchEvent(
      new CustomEvent("vpeet:" + name, { detail })
    );
  }

  function log(message) {
    console.log("[VPEET ENGINE]", message);

    if (typeof state.logCallback === "function") {
      state.logCallback(message);
    }

    emit("engine-log", { message });
  }

  function status(message) {
    state.status = message;
    emit("engine-status", { message });
  }

  function progress(value) {
    state.progress = Math.max(
      0,
      Math.min(100, Number(value) || 0)
    );

    if (typeof state.progressCallback === "function") {
      state.progressCallback(state.progress);
    }

    emit("render-progress", {
      progress: state.progress
    });
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function time(value) {
    return Math.max(0, num(value)).toFixed(3);
  }

  function cleanFileName(value) {
    return String(value || "vpeet-export")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "vpeet-export";
  }

  function getFFmpegClass() {
    return window.FFmpegWASM?.FFmpeg ||
      window.FFmpeg?.FFmpeg ||
      null;
  }

  /* =========================================
     INITIALIZE FFMPEG
  ========================================= */

  async function initialize(options = {}) {
    if (state.loaded && state.ffmpeg) {
      return true;
    }

    const FFmpegClass = getFFmpegClass();

    if (!FFmpegClass) {
      throw new Error(
        "FFmpeg library missing. Check index.html scripts."
      );
    }

    const util = window.FFmpegUtil;

    if (!util || typeof util.toBlobURL !== "function") {
      throw new Error(
        "FFmpegUtil missing. Load @ffmpeg/util first."
      );
    }

    status("Loading FFmpeg engine...");

    const ff = new FFmpegClass();

    ff.on("log", ({ message }) => {
      log(message);
    });

    ff.on("progress", ({ progress: value }) => {
      // FFmpeg progress is approximate for some exports.
      progress(value * 100);
    });

    const base = options.coreBase || CORE_BASE;

    const coreURL = await util.toBlobURL(
      base + "/ffmpeg-core.js",
      "text/javascript"
    );

    const wasmURL = await util.toBlobURL(
      base + "/ffmpeg-core.wasm",
      "application/wasm"
    );

    await ff.load({ coreURL, wasmURL });

    state.ffmpeg = ff;
    state.loaded = true;
    state.status = "ready";

    log("FFmpeg engine loaded.");
    emit("engine-ready");

    return true;
  }

  /* =========================================
     FILE HELPERS
  ========================================= */

  async function writeFile(name, file) {
    if (!(file instanceof Blob)) {
      throw new Error("Invalid file: " + name);
    }

    await state.ffmpeg.writeFile(
      name,
      new Uint8Array(await file.arrayBuffer())
    );
  }

  async function deleteFile(name) {
    try {
      await state.ffmpeg.deleteFile(name);
    } catch (_) {}
  }

  /* =========================================
     PROJECT SETTINGS
  ========================================= */

  function getExportSettings() {
    return {
      ...(window.VPEET_CONFIG?.defaults?.export || {}),
      ...(project.defaults?.export || {}),
      ...(project.export || {})
    };
  }

  function getEffects() {
    try {
      if (window.VPEET_EFFECTS?.getExportSettings) {
        return window.VPEET_EFFECTS.getExportSettings() || {};
      }
    } catch (e) {
      log("Could not read effects module settings.");
    }

    return project.effects || {};
  }

  function getRatio() {
    const value = String(project.aspectRatio || "9:16");
    const parts = value.split(":").map(Number);

    if (
      parts.length !== 2 ||
      !parts[0] ||
      !parts[1] ||
      !Number.isFinite(parts[0]) ||
      !Number.isFinite(parts[1])
    ) {
      return [9, 16];
    }

    return parts;
  }

  function getDimensions() {
    const settings = getExportSettings();

    const resolutions = {
      "480p": 480,
      "720p": 720,
      "1080p": 1080,
      "1440p": 1440,
      "2160p": 2160
    };

    const resolution = settings.resolution ||
      settings.quality ||
      "1080p";

    const height = resolutions[resolution] || 1080;
    const [rw, rh] = getRatio();

    let width = Math.round(height * rw / rh);

    width = Math.max(2, Math.round(width / 2) * 2);

    return {
      width,
      height: Math.max(2, Math.round(height / 2) * 2)
    };
  }

  function getFPS() {
    const settings = getExportSettings();

    return clamp(num(settings.fps, 30), 24, 60);
  }

  function getBitrate() {
    const settings = getExportSettings();

    const value =
      settings.bitrate ||
      settings.qualityPreset ||
      "high";

    const presets = {
      low: 2500,
      medium: 5000,
      high: 8000,
      ultra: 14000
    };

    if (typeof value === "number") {
      return Math.round(clamp(value, 1000, 50000)) + "k";
    }

    if (/^\d+k$/i.test(String(value))) {
      return value;
    }

    return (presets[value] || 8000) + "k";
  }

  function getTrim() {
    const start = Math.max(0, num(project.trimStart, 0));

    const duration = Math.max(
      0,
      num(project.duration, 0)
    );

    const end = num(project.trimEnd, duration);

    if (end > 0 && end <= start) {
      throw new Error(
        "Trim End must be greater than Trim Start."
      );
    }

    return {
      start,
      end,
      duration: end > 0 ? end - start : 0
    };
  }

  function getPosition() {
    return {
      x: clamp(num(project.positionX, 50), 0, 100),
      y: clamp(num(project.positionY, 50), 0, 100)
    };
  }

  /* =========================================
     VIDEO FILTER GRAPH
  ========================================= */

  function buildColourChain() {
    const e = getEffects();
    const filters = [];

    const brightness = num(e.brightness, 100);
    const contrast = num(e.contrast, 100);
    const saturation = num(e.saturation, 100);
    const exposure = num(e.exposure, 0);

    filters.push(
      "eq=brightness=" +
      clamp((brightness - 100) / 100 + exposure / 100, -1, 1).toFixed(3) +
      ":contrast=" +
      clamp(contrast / 100, 0, 3).toFixed(3) +
      ":saturation=" +
      clamp(saturation / 100, 0, 3).toFixed(3)
    );

    const temperature = num(e.temperature, 0);
    const tint = num(e.tint, 0);

    if (temperature !== 0 || tint !== 0) {
      const red = clamp(temperature / 100, -1, 1);
      const blue = clamp(-temperature / 100, -1, 1);
      const green = clamp(tint / 100, -1, 1);

      filters.push(
        "colorbalance=rs=" + red.toFixed(3) +
        ":gs=" + green.toFixed(3) +
        ":bs=" + blue.toFixed(3)
      );
    }

    const sharpen = num(e.sharpen, 0);

    if (sharpen > 0) {
      const amount = clamp(sharpen / 50, 0, 2);

      filters.push(
        "unsharp=5:5:" + amount.toFixed(2) + ":5:5:0"
      );
    }

    const fade = num(e.fade, 0);

    if (fade > 0) {
      filters.push(
        "eq=gamma=" +
        clamp(1 - fade / 200, 0.1, 2).toFixed(3)
      );
    }

    return filters;
  }

  function buildVideoGraph(textInputs) {
    const d = getDimensions();
    const trim = getTrim();
    const pos = getPosition();

    const width = d.width;
    const height = d.height;

    const filters = [];

    const trimFilter = trim.end > 0
      ? "trim=start=" + time(trim.start) +
        ":end=" + time(trim.end) +
        ",setpts=PTS-STARTPTS"
      : "trim=start=" + time(trim.start) +
        ",setpts=PTS-STARTPTS";

    const mode = project.borderMode || "crop";

    if (mode === "blur") {
      filters.push(
        "[0:v]" + trimFilter +
        ",split=2[bgsrc][fgsrc]"
      );

      filters.push(
        "[bgsrc]scale=" + width + ":" + height +
        ":force_original_aspect_ratio=increase" +
        ",crop=" + width + ":" + height +
        ",boxblur=20:10[bg]"
      );

      filters.push(
        "[fgsrc]scale=" + width + ":" + height +
        ":force_original_aspect_ratio=decrease[fg]"
      );

      filters.push(
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[base]"
      );
    } else {
      const x = "(iw-ow)*" + (pos.x / 100).toFixed(3);
      const y = "(ih-oh)*" + (pos.y / 100).toFixed(3);

      filters.push(
        "[0:v]" + trimFilter +
        ",scale=" + width + ":" + height +
        ":force_original_aspect_ratio=increase" +
        ",crop=" + width + ":" + height +
        ":" + x + ":" + y +
        "[base]"
      );
    }

    let current = "base";
    let chain = [];

    chain.push(...buildColourChain());
    chain.push("fps=" + getFPS());

    if (chain.length) {
      filters.push(
        "[" + current + "]" +
        chain.join(",") +
        "[vfx]"
      );
      current = "vfx";
    }

    for (let i = 0; i < textInputs.length; i++) {
      const item = textInputs[i];
      const next = "text" + i;

      filters.push(
        "[" + current + "][" + item.inputIndex + ":v]" +
        "overlay=0:0:enable='between(t," +
        time(item.start) + "," +
        time(item.end) + ")'" +
        "[" + next + "]"
      );

      current = next;
    }

    filters.push(
      "[" + current + "]format=yuv420p[vout]"
    );

    return filters.join(";");
  }

  /* =========================================
     TEXT LAYERS AS TRANSPARENT PNG
     This avoids depending on FFmpeg drawtext.
  ========================================= */

  function getTextLayers() {
    return (project.textLayers || []).filter(layer => {
      return !layer.hidden &&
        String(layer.text || "").trim() !== "";
    });
  }

  function drawTextCanvas(layer, dimensions) {
    const canvas = document.createElement("canvas");

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const ctx = canvas.getContext("2d");

    const size = clamp(
      num(layer.size, 36),
      8,
      220
    );

    const family = String(
      layer.fontFamily || layer.font || "Arial"
    ).replace(/["'\\]/g, "");

    const weight = layer.bold ? "bold" : "normal";
    const italic = layer.italic ? "italic " : "";

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = italic + weight + " " + size + "px " + family;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const x = canvas.width *
      clamp(num(layer.x, 50), 0, 100) / 100;

    const y = canvas.height *
      clamp(num(layer.y, 50), 0, 100) / 100;

    const text = String(layer.text || "");

    const color = layer.color || "#ffffff";
    const opacity = clamp(num(layer.opacity, 1), 0, 1);

    ctx.globalAlpha = opacity;

    if (layer.shadow !== false) {
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = Math.max(2, size * 0.12);
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    if (layer.strokeColor) {
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.strokeStyle = layer.strokeColor;
      ctx.strokeText(text, x, y);
    }

    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error("Could not create text overlay."));
          return;
        }

        resolve(blob);
      }, "image/png");
    });
  }

  async function prepareTextInputs() {
    const layers = getTextLayers();
    const dimensions = getDimensions();
    const trim = getTrim();

    const prepared = [];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];

      const start = num(layer.start, 0);
      const end = num(layer.end, 5);

      if (end <= start) continue;

      const blob = await drawTextCanvas(
        layer,
        dimensions
      );

      const name = "vpeet_text_" + i + ".png";

      await writeFile(name, blob);

      prepared.push({
        name,
        inputIndex: 1 + i,
        start: Math.max(0, start - trim.start),
        end: Math.max(0, end - trim.start)
      });
    }

    return prepared;
  }

  /* =========================================
     AUDIO PROBE
  ========================================= */

  async function probeInputHasAudio() {
    const ff = state.ffmpeg;

    if (typeof ff.ffprobe !== "function") {
      // If ffprobe is unavailable, keep original audio mapping optional.
      return true;
    }

    try {
      await ff.ffprobe([
        "-v", "error",
        "-show_entries", "stream=codec_type",
        "-of", "json",
        state.inputName,
        "-o", "vpeet_probe.json"
      ]);

      const raw = await ff.readFile("vpeet_probe.json");
      const json = JSON.parse(
        new TextDecoder().decode(raw)
      );

      return (json.streams || []).some(
        stream => stream.codec_type === "audio"
      );

    } catch (error) {
      log("Audio probe unavailable; using optional audio mapping.");
      return true;
    }
  }

  /* =========================================
     AUDIO FILTER GRAPH
  ========================================= */

  function getAudioSettings() {
    const a = project.audio || {};

    return {
      file: a.file || null,
      volume: clamp(num(a.volume, 80), 0, 200),
      videoVolume: clamp(num(a.videoVolume, 100), 0, 200),
      start: Math.max(0, num(a.start, 0)),
      end: num(a.end, 0),
      fadeIn: Math.max(0, num(a.fadeIn, 0)),
      fadeOut: Math.max(0, num(a.fadeOut, 0))
    };
  }

  function audioChain(label, settings, clipDuration, isMusic) {
    const filters = [];

    if (isMusic && settings.end > settings.start) {
      filters.push(
        "atrim=start=" + time(settings.start) +
        ":end=" + time(settings.end)
      );
    } else if (!isMusic) {
      filters.push(
        "atrim=start=0" +
        (clipDuration > 0
          ? ":duration=" + time(clipDuration)
          : "")
      );
    }

    filters.push("asetpts=PTS-STARTPTS");

    const volume = isMusic
      ? settings.volume
      : settings.videoVolume;

    filters.push(
      "volume=" + (volume / 100).toFixed(3)
    );

    const fadeIn = isMusic ? settings.fadeIn : 0;

    if (fadeIn > 0) {
      filters.push(
        "afade=t=in:st=0:d=" + time(fadeIn)
      );
    }

    const fadeOut = isMusic ? settings.fadeOut : 0;

    if (fadeOut > 0 && clipDuration > 0) {
      const fadeStart = Math.max(
        0,
        clipDuration - fadeOut
      );

      filters.push(
        "afade=t=out:st=" + time(fadeStart) +
        ":d=" + time(fadeOut)
      );
    }

    return "[" + label + "]" +
      filters.join(",") +
      "[" + label + "out]";
  }

  function buildAudioGraph(hasOriginalAudio, hasMusic) {
    const settings = getAudioSettings();
    const trim = getTrim();
    const duration = trim.duration;

    const parts = [];

    if (hasOriginalAudio) {
      parts.push(
        audioChain("0:a", settings, duration, false)
      );
    }

    if (hasMusic) {
      parts.push(
        audioChain("music:a", settings, duration, true)
      );
    }

    if (hasOriginalAudio && hasMusic) {
      parts.push(
        "[0:aout][music:aout]" +
        "amix=inputs=2:duration=first:dropout_transition=2" +
        "[aout]"
      );
    } else if (hasOriginalAudio) {
      parts.push("[0:aout]anull[aout]");
    } else if (hasMusic) {
      parts.push("[music:aout]anull[aout]");
    }

    return parts.join(";");
  }

  /* =========================================
     BUILD EXPORT COMMAND
  ========================================= */

  async function buildCommand(textInputs, hasMusic) {
    const trim = getTrim();
    const settings = getAudioSettings();

    const hasOriginalAudio =
      await probeInputHasAudio();

    const graph = [
      buildVideoGraph(textInputs)
    ];

    const audioGraph = buildAudioGraph(
      hasOriginalAudio,
      hasMusic
    );

    if (audioGraph) {
      graph.push(audioGraph);
    }

    const args = [
      "-hide_banner",
      "-i", state.inputName
    ];

    if (hasMusic) {
      args.push("-i", state.audioName);
    }

    // FFmpeg complex graph uses labelled output streams.
    args.push(
      "-filter_complex",
      graph.join(";")
    );

    args.push(
      "-map", "[vout]"
    );

    if (hasOriginalAudio || hasMusic) {
      args.push("-map", "[aout]");
    }

    args.push(
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-b:v", getBitrate(),
      "-pix_fmt", "yuv420p",
      "-r", String(getFPS()),
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-max_muxing_queue_size", "1024"
    );

    if (trim.duration > 0) {
      args.push("-t", time(trim.duration));
    }

    args.push("-y", state.outputName);

    return args;
  }

  /* =========================================
     RENDER
  ========================================= */

  async function render(options = {}) {
    if (state.busy) {
      throw new Error("A render is already running.");
    }

    if (!(project.video instanceof Blob)) {
      throw new Error("Please upload a video first.");
    }

    state.busy = true;
    state.cancelled = false;
    state.lastBlob = null;

    state.inputName = "vpeet_input.mp4";
    state.audioName = "vpeet_audio.mp3";
    state.outputName =
      cleanFileName(options.outputName || "vpeet-export") +
      ".mp4";

    progress(0);
    status("Preparing export...");
    emit("render-started");

    try {
      await initialize(options);

      const ff = state.ffmpeg;

      await writeFile(state.inputName, project.video);

      const audio = getAudioSettings();
      const hasMusic = audio.file instanceof Blob;

      if (hasMusic) {
        await writeFile(state.audioName, audio.file);
      }

      status("Preparing text layers...");

      const textInputs = await prepareTextInputs();

      // Text images are added after the video and optional music inputs.
      for (let i = 0; i < textInputs.length; i++) {
        textInputs[i].inputIndex =
          (hasMusic ? 2 : 1) + i;

        // The PNG input is added to FFmpeg in the same order.
      }

      // Add text image inputs in order.
      for (const item of textInputs) {
        const args = [
          "-loop", "1",
          "-i", item.name
        ];

        // FFmpeg inputs must be declared in the final command.
        item.inputArgs = args;
      }

      const command = await buildCommand(
        textInputs,
        hasMusic
      );

      // Insert PNG inputs after video and optional music.
      const inputInsert = [];
      for (const item of textInputs) {
        inputInsert.push(
          "-loop", "1",
          "-i", item.name
        );
      }

      const firstOutput = command.indexOf("-filter_complex");

      command.splice(
        firstOutput,
        0,
        ...inputInsert
      );

      status("Rendering MP4 video...");
      log("Running FFmpeg export command.");

      const result = await ff.exec(command);

      if (state.cancelled) {
        throw new Error("Render cancelled.");
      }

      if (result !== 0) {
        throw new Error(
          "FFmpeg returned error code " + result
        );
      }

      status("Preparing final MP4...");

      const data = await ff.readFile(state.outputName);

      if (!data || !data.length) {
        throw new Error("FFmpeg produced an empty file.");
      }

      const blob = new Blob(
        [data],
        { type: "video/mp4" }
      );

      state.lastBlob = blob;
      state.status = "completed";

      progress(100);

      emit("render-completed", {
        blob,
        fileName: state.outputName,
        size: blob.size
      });

      log("MP4 export completed.");

      return blob;

    } catch (error) {
      state.status = state.cancelled
        ? "cancelled"
        : "error";

      emit("render-error", {
        message: error.message
      });

      log("Export failed: " + error.message);

      throw error;

    } finally {
      state.busy = false;

      // Remove temporary files to reduce memory usage.
      if (state.loaded && state.ffmpeg) {
        await deleteFile(state.inputName);
        await deleteFile(state.audioName);
        await deleteFile(state.outputName);

        for (let i = 0; i < 30; i++) {
          await deleteFile("vpeet_text_" + i + ".png");
        }
      }
    }
  }

  /* =========================================
     CANCEL
  ========================================= */

  function cancel() {
    if (!state.busy || !state.ffmpeg) return;

    state.cancelled = true;
    state.status = "cancelling";

    status("Cancelling render...");

    try {
      state.ffmpeg.terminate();
    } catch (error) {
      log("Could not terminate FFmpeg worker.");
    }

    state.ffmpeg = null;
    state.loaded = false;

    emit("render-cancelled");
  }

  /* =========================================
     PUBLIC API
  ========================================= */

  window.VPEET_ENGINE = {
    initialize,
    render,
    cancel,

    getDimensions,
    getTrim,
    buildColourChain,
    buildVideoGraph,
    buildAudioGraph,

    setProgressCallback(callback) {
      state.progressCallback =
        typeof callback === "function" ? callback : null;
    },

    setLogCallback(callback) {
      state.logCallback =
        typeof callback === "function" ? callback : null;
    },

    getStatus() {
      return {
        loaded: state.loaded,
        busy: state.busy,
        progress: state.progress,
        status: state.status
      };
    },

    isBusy() {
      return state.busy;
    }
  };

  console.log("VPEET Studio Video Engine Ready.");

})();
