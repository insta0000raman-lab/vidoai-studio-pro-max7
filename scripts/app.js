"use strict";

const VYORA = (() => {
  const state = {
    currentScreen: "homeScreen",
    videoFile: null,
    videoUrl: null,
    videoDuration: 0,
    videoWidth: 0,
    videoHeight: 0,
    ratio: "9:16",
    customWidth: 1080,
    customHeight: 1920,
    projectName: "Untitled Project",
    createdAt: Date.now()
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function toast(message, type = "normal") {
    const region = $("#toastRegion");
    if (!region) return;

    const item = document.createElement("div");
    item.className = `toast-message ${type}`;
    item.textContent = message;

    region.appendChild(item);

    window.setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateY(8px)";

      window.setTimeout(() => item.remove(), 250);
    }, 3000);
  }

  function showScreen(screenId) {
    const target = document.getElementById(screenId);

    if (!target) {
      toast("This screen is not available yet.", "error");
      return false;
    }

    $$(".screen").forEach(screen => {
      screen.classList.remove("active");
    });

    target.classList.add("active");
    state.currentScreen = screenId;

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    refreshIcons();
    return true;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";

    if (bytes < 1024) return `${bytes} B`;

    const units = ["KB", "MB", "GB", "TB"];
    let size = bytes / 1024;
    let index = 0;

    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index++;
    }

    return `${size.toFixed(2)} ${units[index]}`;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "00:00";
    }

    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;

    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      return [
        String(hours).padStart(2, "0"),
        String(mins).padStart(2, "0"),
        String(remaining).padStart(2, "0")
      ].join(":");
    }

    return [
      String(minutes).padStart(2, "0"),
      String(remaining).padStart(2, "0")
    ].join(":");
  }

  function validateVideo(file) {
    if (!file) {
      return "Choose a video first.";
    }

    if (!file.type.startsWith("video/")) {
      return "Please choose a valid video file.";
    }

    if (file.size === 0) {
      return "This video file is empty.";
    }

    return null;
  }

  function updateSelectedFile(file, metadata) {
    const card = $("#selectedFileCard");
    const preview = $("#importPreview");
    const name = $("#selectedFileName");
    const meta = $("#selectedFileMeta");
    const continueButton = $("#continueToRatioButton");

    if (!card || !preview || !name || !meta) return;

    name.textContent = file.name;

    const duration = formatTime(metadata.duration);
    const dimensions = `${metadata.width} × ${metadata.height}`;

    meta.textContent =
      `${dimensions} · ${duration} · ${formatBytes(file.size)}`;

    card.classList.remove("hidden");

    preview.src = state.videoUrl;
    preview.load();

    if (continueButton) {
      continueButton.disabled = false;
    }
  }

  function clearVideo() {
    const preview = $("#importPreview");
    const card = $("#selectedFileCard");
    const input = $("#videoInput");
    const continueButton = $("#continueToRatioButton");

    if (preview) {
      preview.pause();
      preview.removeAttribute("src");
      preview.load();
    }

    if (state.videoUrl) {
      URL.revokeObjectURL(state.videoUrl);
    }

    state.videoFile = null;
    state.videoUrl = null;
    state.videoDuration = 0;
    state.videoWidth = 0;
    state.videoHeight = 0;

    if (card) card.classList.add("hidden");
    if (input) input.value = "";
    if (continueButton) continueButton.disabled = true;

    toast("Video removed.");
  }

  async function loadVideo(file) {
    const error = validateVideo(file);

    if (error) {
      toast(error, "error");
      return;
    }

    const oldUrl = state.videoUrl;

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }

    const url = URL.createObjectURL(file);
    const temporaryVideo = document.createElement("video");

    temporaryVideo.preload = "metadata";
    temporaryVideo.muted = true;
    temporaryVideo.playsInline = true;

    temporaryVideo.src = url;

    toast("Reading video information...");

    try {
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error("Video metadata loading timed out."));
        }, 20000);

        temporaryVideo.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };

        temporaryVideo.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("The browser could not read this video."));
        };
      });

      const width = temporaryVideo.videoWidth;
      const height = temporaryVideo.videoHeight;
      const duration = temporaryVideo.duration;

      if (!width || !height || !Number.isFinite(duration)) {
        throw new Error("Video information is incomplete.");
      }

      state.videoFile = file;
      state.videoUrl = url;
      state.videoDuration = duration;
      state.videoWidth = width;
      state.videoHeight = height;

      updateSelectedFile(file, {
        width,
        height,
        duration
      });

      toast("Video imported successfully.", "success");

      temporaryVideo.removeAttribute("src");
      temporaryVideo.load();

    } catch (error) {
      URL.revokeObjectURL(url);

      temporaryVideo.removeAttribute("src");
      temporaryVideo.load();

      console.error("VYORA import error:", error);

      toast(
        error.message || "Unable to import this video.",
        "error"
      );
    }
  }

  function selectRatio(ratio) {
    state.ratio = ratio;

    $$(".ratio-option").forEach(button => {
      const selected = button.dataset.ratio === ratio;

      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    const customPanel = $("#customRatioPanel");

    if (customPanel) {
      customPanel.classList.toggle(
        "hidden",
        ratio !== "custom"
      );
    }
  }

  function getCanvasSize() {
    if (state.ratio === "custom") {
      return {
        width: state.customWidth,
        height: state.customHeight
      };
    }

    const parts = state.ratio.split(":");
    const widthRatio = Number(parts[0]);
    const heightRatio = Number(parts[1]);

    if (
      !Number.isFinite(widthRatio) ||
      !Number.isFinite(heightRatio) ||
      widthRatio <= 0 ||
      heightRatio <= 0
    ) {
      return { width: 1080, height: 1920 };
    }

    const maxDimension = 2160;

    if (widthRatio >= heightRatio) {
      return {
        width: maxDimension,
        height: Math.round(maxDimension * heightRatio / widthRatio)
      };
    }

    return {
      width: Math.round(maxDimension * widthRatio / heightRatio),
      height: maxDimension
    };
  }

  function continueToRatio() {
    if (!state.videoFile || !state.videoUrl) {
      toast("Please import a video first.", "error");
      return;
    }

    showScreen("ratioScreen");
  }

  function openEditor() {
    if (!state.videoFile) {
      toast("Import a video before opening the editor.", "error");
      showScreen("importScreen");
      return;
    }

    if (state.ratio === "custom") {
      const width = Number($("#customRatioWidth")?.value);
      const height = Number($("#customRatioHeight")?.value);

      if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > 8192 ||
        height > 8192
      ) {
        toast("Enter valid custom canvas dimensions.", "error");
        return;
      }

      state.customWidth = width;
      state.customHeight = height;
    }

    const dimensions = getCanvasSize();

    state.projectName = state.videoFile.name.replace(/\.[^.]+$/, "");

    showScreen("editorScreen");

    window.dispatchEvent(
      new CustomEvent("vyora:open-editor", {
        detail: {
          ...state,
          canvasWidth: dimensions.width,
          canvasHeight: dimensions.height
        }
      })
    );
  }

  function setupFileInput() {
    const input = $("#videoInput");
    if (!input) return;

    input.addEventListener("change", event => {
      const file = event.target.files?.[0];

      if (file) {
        loadVideo(file);
      }
    });

    const dropZone = $("#videoDropZone");

    if (dropZone) {
      ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
          event.preventDefault();
          dropZone.classList.add("drag-over");
        });
      });

      ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
          event.preventDefault();
          dropZone.classList.remove("drag-over");
        });
      });

      dropZone.addEventListener("drop", event => {
        const file = event.dataTransfer?.files?.[0];

        if (file) {
          loadVideo(file);
        }
      });
    }
  }

  function setupRatioOptions() {
    $$(".ratio-option").forEach(button => {
      button.addEventListener("click", () => {
        selectRatio(button.dataset.ratio);
      });
    });

    selectRatio("9:16");
  }

  function setupNavigation() {
    $("#startEditingButton")?.addEventListener("click", () => {
      showScreen("importScreen");
    });

    $("#homeBrand")?.addEventListener("click", event => {
      event.preventDefault();
      showScreen("homeScreen");
    });

    $$("[data-back]").forEach(button => {
      button.addEventListener("click", () => {
        showScreen(button.dataset.back);
      });
    });

    $("#continueToRatioButton")?.addEventListener(
      "click",
      continueToRatio
    );

    $("#continueToEditorButton")?.addEventListener(
      "click",
      openEditor
    );

    $("#removeVideoButton")?.addEventListener(
      "click",
      clearVideo
    );

    $("#notificationsButton")?.addEventListener("click", () => {
      toast("You're all caught up.");
    });

    $("#profileButton")?.addEventListener("click", () => {
      showModal(
        "About VYORA",
        "VYORA Studio is your creative workspace. Your selected media is processed in your browser."
      );
    });
  }

  function showModal(title, content) {
    const backdrop = $("#modalBackdrop");
    const titleElement = $("#modalTitle");
    const body = $("#modalBody");

    if (!backdrop || !titleElement || !body) return;

    titleElement.textContent = title;
    body.textContent = content;
    backdrop.classList.remove("hidden");

    refreshIcons();
  }

  function closeModal() {
    $("#modalBackdrop")?.classList.add("hidden");
  }

  function setupModal() {
    $("#closeModalButton")?.addEventListener("click", closeModal);

    $("#modalBackdrop")?.addEventListener("click", event => {
      if (event.target.id === "modalBackdrop") {
        closeModal();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeModal();
      }
    });
  }

  function setupCustomRatio() {
    const widthInput = $("#customRatioWidth");
    const heightInput = $("#customRatioHeight");

    widthInput?.addEventListener("change", () => {
      state.customWidth = Number(widthInput.value);
    });

    heightInput?.addEventListener("change", () => {
      state.customHeight = Number(heightInput.value);
    });
  }

  function cleanup() {
    if (state.videoUrl) {
      URL.revokeObjectURL(state.videoUrl);
      state.videoUrl = null;
    }
  }

  function init() {
    setupFileInput();
    setupRatioOptions();
    setupNavigation();
    setupModal();
    setupCustomRatio();

    refreshIcons();

    window.addEventListener("beforeunload", cleanup);

    console.log("VYORA Studio initialized.");
  }

  return {
    state,
    init,
    showScreen,
    toast,
    formatTime,
    formatBytes,
    getCanvasSize
  };
})();

window.VYORA = VYORA;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", VYORA.init, { once: true });
} else {
  VYORA.init();
      }
