/* =========================================
   VPEET STUDIO — EXPORT MANAGER
   File: scripts/export.js
========================================= */

(function () {
  "use strict";

  const state = {
    rendering: false,
    completed: false,
    blob: null,
    downloadUrl: null,
    progress: 0,
    status: "Ready"
  };

  const $ = (selector) => document.querySelector(selector);

  function findElement(selectors) {
    for (const selector of selectors) {
      const element = $(selector);
      if (element) return element;
    }
    return null;
  }

  const elements = {
    render: findElement([
      "#renderButton",
      "#startRenderButton",
      "#exportButton",
      "[data-action='render']"
    ]),

    cancel: findElement([
      "#cancelRenderButton",
      "#cancelButton",
      "[data-action='cancel-render']"
    ]),

    download: findElement([
      "#downloadButton",
      "#downloadVideoButton",
      "[data-action='download']"
    ]),

    progress: findElement([
      "#renderProgress",
      "#exportProgress",
      "#progressBar"
    ]),

    progressText: findElement([
      "#renderProgressText",
      "#progressText",
      "#progressPercent"
    ]),

    status: findElement([
      "#renderStatus",
      "#exportStatus",
      "#statusText"
    ])
  };

  function setStatus(message) {
    state.status = message;

    if (elements.status) {
      elements.status.textContent = message;
    }
  }

  function setProgress(value) {
    const number = Math.max(0, Math.min(100, Number(value) || 0));
    state.progress = number;

    if (elements.progress) {
      if ("value" in elements.progress) {
        elements.progress.value = number;
      }

      elements.progress.style.width = number + "%";
      elements.progress.setAttribute("aria-valuenow", number);
    }

    if (elements.progressText) {
      elements.progressText.textContent =
        Math.round(number) + "%";
    }
  }

  function setButtonStates() {
    if (elements.render) {
      elements.render.disabled = state.rendering;
    }

    if (elements.cancel) {
      elements.cancel.disabled = !state.rendering;
    }

    if (elements.download) {
      elements.download.disabled = !state.completed;
    }
  }

  function clearOldDownload() {
    if (state.downloadUrl) {
      URL.revokeObjectURL(state.downloadUrl);
      state.downloadUrl = null;
    }

    state.blob = null;
    state.completed = false;
  }

  function getFileName() {
    const project = window.VPEET_PROJECT || {};

    let name =
      project.exportName ||
      project.fileName ||
      project.name ||
      "vpeet-video";

    name = String(name)
      .replace(/\.[^/.]+$/, "")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return (name || "vpeet-video") + ".mp4";
  }

  function saveBlob(blob) {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("Exported video file is empty.");
    }

    clearOldDownload();

    state.blob = blob;
    state.downloadUrl = URL.createObjectURL(blob);
    state.completed = true;

    setProgress(100);
    setStatus("Export completed. Your video is ready.");

    setButtonStates();

    if (elements.download) {
      elements.download.disabled = false;
    }

    return state.downloadUrl;
  }

  function downloadVideo() {
    if (!state.completed || !state.blob || !state.downloadUrl) {
      setStatus("Please render your video first.");
      return;
    }

    const link = document.createElement("a");

    link.href = state.downloadUrl;
    link.download = getFileName();
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setStatus("Download started.");
  }

  function getEngine() {
    if (!window.VPEET_ENGINE) {
      throw new Error(
        "Video engine not found. Check video-engine.js."
      );
    }

    if (typeof window.VPEET_ENGINE.render !== "function") {
      throw new Error(
        "Render function is missing in video-engine.js."
      );
    }

    return window.VPEET_ENGINE;
  }

  async function startRender() {
    if (state.rendering) return;

    clearOldDownload();

    state.rendering = true;
    state.completed = false;

    setProgress(0);
    setStatus("Preparing video...");
    setButtonStates();

    try {
      const engine = getEngine();

      const result = await engine.render({
        onProgress: function (progress) {
          const value =
            typeof progress === "object"
              ? progress.progress
              : progress;

          setProgress(value || 0);

          if (typeof progress === "object" && progress.message) {
            setStatus(progress.message);
          } else {
            setStatus("Rendering video...");
          }
        },

        onStatus: function (message) {
          setStatus(message);
        }
      });

      let outputBlob = result;

      if (result && result.blob instanceof Blob) {
        outputBlob = result.blob;
      }

      if (!(outputBlob instanceof Blob)) {
        throw new Error(
          "Engine did not return a valid video file."
        );
      }

      saveBlob(outputBlob);

    } catch (error) {
      console.error("VPEET Export Error:", error);

      setStatus(
        "Export failed: " +
        (error && error.message
          ? error.message
          : "Unknown error")
      );

    } finally {
      state.rendering = false;
      setButtonStates();
    }
  }

  async function cancelRender() {
    if (!state.rendering) return;

    setStatus("Cancelling render...");

    try {
      const engine = window.VPEET_ENGINE;

      if (engine && typeof engine.cancel === "function") {
        await engine.cancel();
      } else {
        setStatus(
          "This engine does not support render cancellation."
        );
        return;
      }

      setStatus("Render cancelled.");

    } catch (error) {
      console.error("Cancel Error:", error);
      setStatus("Could not cancel render.");
    }
  }

  function connectButtons() {
    if (elements.render) {
      elements.render.addEventListener("click", startRender);
    }

    if (elements.cancel) {
      elements.cancel.addEventListener("click", cancelRender);
    }

    if (elements.download) {
      elements.download.addEventListener("click", downloadVideo);
    }

    setButtonStates();
    setProgress(0);
  }

  function cleanup() {
    if (state.downloadUrl) {
      URL.revokeObjectURL(state.downloadUrl);
      state.downloadUrl = null;
    }
  }

  window.addEventListener("beforeunload", cleanup);

  window.VPEET_EXPORT = {
    start: startRender,
    cancel: cancelRender,
    download: downloadVideo,
    getStatus: function () {
      return {
        rendering: state.rendering,
        completed: state.completed,
        progress: state.progress,
        status: state.status
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectButtons);
  } else {
    connectButtons();
  }

})();
