
/* =========================================
   VPEET STUDIO — VIDEO PREVIEW ENGINE
   Fixed for current index.html IDs
========================================= */

(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const project = window.VPEET_PROJECT =
    window.VPEET_PROJECT || {
      video: null,
      videoUrl: null,
      fileName: "",
      duration: 0,
      aspectRatio: "9:16",
      borderMode: "crop",
      borderAmount: 0,
      positionX: 50,
      positionY: 50,
      zoom: 100
    };

  // Match the actual IDs in index.html
  const video = $("#mainVideo");
  const uploadInput = $("#videoInput");
  const previewFrame = $("#previewFrame");
  const previewStage = $("#previewStage");
  const placeholder = $("#previewPlaceholder");

  const previewStatus = $("#previewStatus");
  const uploadedFile = $("#uploadedFile");
  const fileNameDisplay = $("#fileName");
  const fileDetails = $("#fileDetails");
  const removeButton = $("#removeVideoButton");

  const playButton = $("#playPauseButton");
  const playIcon = $("#playPauseIcon");
  const muteButton = $("#muteButton");
  const muteIcon = $("#muteIcon");

  const currentTimeDisplay = $("#currentTime");
  const durationDisplay = $("#totalDuration");
  const previewRatio = $("#previewRatio");
  const previewResolution = $("#previewResolution");

  const trimStart = $("#trimStart");
  const trimEnd = $("#trimEnd");

  if (!video || !uploadInput) {
    console.error("VPEET: mainVideo or videoInput not found.");
    return;
  }

  video.playsInline = true;
  video.preload = "metadata";
  video.controls = false;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return String(mins).padStart(2, "0") + ":" +
      String(secs).padStart(2, "0");
  }

  function showVideo() {
    video.style.display = "block";

    if (placeholder) placeholder.style.display = "none";
    if (previewStatus) previewStatus.textContent = "VIDEO LOADED";
    if (previewFrame) previewFrame.classList.add("has-video");
    if (playButton) playButton.disabled = false;
    if (muteButton) muteButton.disabled = false;
    if (uploadedFile) uploadedFile.hidden = false;
  }

  function showEmpty() {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.style.display = "none";

    if (placeholder) placeholder.style.display = "";
    if (previewStatus) previewStatus.textContent = "NO VIDEO";
    if (previewFrame) previewFrame.classList.remove("has-video");
    if (playButton) playButton.disabled = true;
    if (muteButton) muteButton.disabled = true;
    if (uploadedFile) uploadedFile.hidden = true;

    if (currentTimeDisplay) currentTimeDisplay.textContent = "00:00";
    if (durationDisplay) durationDisplay.textContent = "00:00";
    if (previewResolution) previewResolution.textContent = "Resolution: —";
    if (previewRatio) previewRatio.textContent = "Ratio: —";

    if (playIcon) playIcon.textContent = "▶";
  }

  function updateTime() {
    if (currentTimeDisplay) {
      currentTimeDisplay.textContent = formatTime(video.currentTime);
    }

    if (durationDisplay) {
      durationDisplay.textContent = formatTime(video.duration);
    }
  }

  function updatePreview() {
    video.style.objectPosition =
      project.positionX + "% " + project.positionY + "%";

    video.style.transform =
      "scale(" + (project.zoom / 100) + ")";

    video.style.objectFit =
      project.borderMode === "crop" ? "cover" : "contain";

    if (previewStage) {
      previewStage.dataset.borderMode = project.borderMode;
      previewStage.style.setProperty(
        "--preview-border",
        project.borderAmount + "%"
      );
    }

    if (previewFrame) {
      previewFrame.dataset.borderMode = project.borderMode;
    }

    window.dispatchEvent(
      new CustomEvent("vpeet:preview-update", {
        detail: project
      })
    );
  }

  function loadVideo(file) {
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }

    if (project.videoUrl) {
      URL.revokeObjectURL(project.videoUrl);
    }

    const objectUrl = URL.createObjectURL(file);

    project.video = file;
    project.videoUrl = objectUrl;
    project.fileName = file.name;
    project.duration = 0;

    video.pause();
    video.src = objectUrl;
    video.load();

    if (fileNameDisplay) {
      fileNameDisplay.textContent = file.name;
    }

    if (fileDetails) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      fileDetails.textContent = sizeMB + " MB · Loading video...";
    }

    showVideo();

    video.onloadedmetadata = function () {
      project.duration = video.duration;

      if (fileDetails) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        fileDetails.textContent =
          sizeMB + " MB · " + formatTime(video.duration);
      }

      if (previewResolution) {
        previewResolution.textContent =
          "Resolution: " + video.videoWidth + " × " + video.videoHeight;
      }

      if (trimStart) {
        trimStart.min = 0;
        trimStart.max = video.duration;
        trimStart.value = 0;
        trimStart.disabled = false;
      }

      if (trimEnd) {
        trimEnd.min = 0;
        trimEnd.max = video.duration;
        trimEnd.value = video.duration;
        trimEnd.disabled = false;
      }

      updateTime();
      updatePreview();

      window.dispatchEvent(
        new CustomEvent("vpeet:video-loaded", {
          detail: {
            file: file,
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight
          }
        })
      );

      console.log("VPEET: Video loaded successfully.");
    };

    video.onerror = function () {
      console.error("VPEET: Video could not be decoded.");
      if (previewStatus) previewStatus.textContent = "VIDEO ERROR";
      alert("This video format could not be previewed. Try another MP4 video.");
    };
  }

  // Upload
  uploadInput.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    loadVideo(file);
  });

  // Remove video
  if (removeButton) {
    removeButton.addEventListener("click", function () {
      if (project.videoUrl) {
        URL.revokeObjectURL(project.videoUrl);
      }

      project.video = null;
      project.videoUrl = null;
      project.fileName = "";
      project.duration = 0;

      uploadInput.value = "";
      showEmpty();

      if (trimStart) trimStart.disabled = true;
      if (trimEnd) trimEnd.disabled = true;
    });
  }

  // Play / pause
  async function togglePlayback() {
    if (!project.video) return;

    if (video.paused) {
      try {
        await video.play();
      } catch (error) {
        console.warn("Playback failed:", error);
      }
    } else {
      video.pause();
    }
  }

  if (playButton) {
    playButton.addEventListener("click", togglePlayback);
  }

  video.addEventListener("play", function () {
    if (playIcon) playIcon.textContent = "Ⅱ";
  });

  video.addEventListener("pause", function () {
    if (playIcon) playIcon.textContent = "▶";
  });

  video.addEventListener("timeupdate", updateTime);
  video.addEventListener("loadedmetadata", updateTime);

  // Mute
  if (muteButton) {
    muteButton.addEventListener("click", function () {
      video.muted = !video.muted;
      if (muteIcon) muteIcon.textContent = video.muted ? "🔇" : "🔊";
    });
  }

  // Aspect ratio
  function setAspectRatio(ratio) {
    if (!ratio) return;

    project.aspectRatio = ratio;

    if (previewFrame && ratio !== "custom") {
      const parts = ratio.split(":");
      const width = Number(parts[0]);
      const height = Number(parts[1]);

      if (width > 0 && height > 0) {
        previewFrame.style.aspectRatio = width + " / " + height;
      }
    }

    if (previewRatio) {
      previewRatio.textContent = "Ratio: " + ratio;
    }

    document.querySelectorAll("[data-ratio]").forEach((button) => {
      button.classList.toggle(
        "selected",
        button.dataset.ratio === ratio
      );
    });

    updatePreview();
  }

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-ratio]");
    if (button) setAspectRatio(button.dataset.ratio);
  });

  // Border mode
  document.querySelectorAll('input[name="borderMode"]').forEach((input) => {
    input.addEventListener("change", function () {
      project.borderMode = input.value;

      document.querySelectorAll(".choice-card").forEach((card) => {
        const radio = card.querySelector('input[name="borderMode"]');
        card.classList.toggle("selected", !!radio && radio.checked);
      });

      updatePreview();
    });
  });

  // Border amount
  const borderInput = $("#borderAmount");
  const borderValue = $("#borderAmountValue");

  if (borderInput) {
    borderInput.addEventListener("input", function () {
      project.borderAmount = Number(borderInput.value) || 0;
      if (borderValue) borderValue.textContent = project.borderAmount + "%";
      updatePreview();
    });
  }

  // Position
  document.querySelectorAll("[data-position]").forEach((button) => {
    button.addEventListener("click", function () {
      const position = button.dataset.position;

      project.positionY =
        position === "top" ? 0 :
        position === "bottom" ? 100 : 50;

      document.querySelectorAll("[data-position]").forEach((item) => {
        item.classList.toggle("selected", item === button);
      });

      updatePreview();
    });
  });

  // Trim controls
  if (trimStart) {
    trimStart.addEventListener("input", function () {
      const value = Number(trimStart.value) || 0;
      const label = $("#trimStartValue");
      if (label) label.textContent = formatTime(value);
      if (video.duration) video.currentTime = value;
    });
  }

  if (trimEnd) {
    trimEnd.addEventListener("input", function () {
      const label = $("#trimEndValue");
      if (label) label.textContent = formatTime(Number(trimEnd.value));
    });
  }

  // Public API
  window.VPEET_PREVIEW = {
    loadVideo,
    updatePreview,
    setAspectRatio,
    togglePlayback,
    getVideo: () => video,
    getProject: () => project
  };

  showEmpty();
  console.log("VPEET Studio Preview Engine Ready.");
})();
