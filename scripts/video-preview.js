/* =========================================
   VPEET STUDIO — VIDEO PREVIEW ENGINE
   Local video preview and framing controls
========================================= */

(function () {
  "use strict";

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

  const $ = (selector) => document.querySelector(selector);

  const video = $("#videoPreview");

  const uploadInput =
    $("#videoUpload") ||
    $("#videoInput") ||
    $('input[type="file"][accept*="video"]');

  const previewFrame = $(".preview-frame");
  const previewStage = $(".preview-stage");

  const emptyPreview =
    $("#previewEmpty") ||
    $(".preview-empty");

  const fileNameDisplay =
    $("#videoFileName") ||
    $("#videoName");

  const playButton =
    $("#previewPlayButton") ||
    $("#playPreviewButton");

  const seekBar =
    $("#previewSeek") ||
    $("#videoSeek");

  const currentTimeDisplay = $("#previewCurrentTime");
  const durationDisplay = $("#previewDuration");

  if (!video) {
    console.error("VPEET: #videoPreview element not found.");
    return;
  }

  video.playsInline = true;
  video.preload = "metadata";

  /* ---------- HELPERS ---------- */

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return String(mins).padStart(2, "0") +
      ":" +
      String(secs).padStart(2, "0");
  }

  function updateTime() {
    if (currentTimeDisplay) {
      currentTimeDisplay.textContent =
        formatTime(video.currentTime);
    }

    if (seekBar && video.duration) {
      seekBar.value =
        (video.currentTime / video.duration) * 100;
    }
  }

  function showVideo() {
    video.style.display = "block";

    if (emptyPreview) {
      emptyPreview.style.display = "none";
    }

    if (previewFrame) {
      previewFrame.classList.add("has-video");
    }
  }

  function showEmpty() {
    video.style.display = "none";

    if (emptyPreview) {
      emptyPreview.style.display = "";
    }

    if (previewFrame) {
      previewFrame.classList.remove("has-video");
    }
  }

  /* ---------- VIDEO UPLOAD ---------- */

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

    video.pause();
    video.src = objectUrl;
    video.load();

    if (fileNameDisplay) {
      fileNameDisplay.textContent = file.name;
    }

    showVideo();

    video.onloadedmetadata = function () {
      project.duration = video.duration;

      if (durationDisplay) {
        durationDisplay.textContent =
          formatTime(video.duration);
      }

      if (seekBar) {
        seekBar.value = 0;
      }

      const trimStart =
        $("#trimStart") || $("#trimStartInput");

      const trimEnd =
        $("#trimEnd") || $("#trimEndInput");

      if (trimStart) {
        trimStart.value = 0;
        trimStart.max = video.duration;
      }

      if (trimEnd) {
        trimEnd.value = video.duration;
        trimEnd.max = video.duration;
      }

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
    };
  }

  if (uploadInput) {
    uploadInput.addEventListener("change", function (event) {
      const file = event.target.files &&
        event.target.files[0];

      loadVideo(file);
    });
  }

  /* ---------- PLAY / PAUSE ---------- */

  async function togglePlayback() {
    if (!project.video) return;

    if (video.paused) {
      try {
        await video.play();
      } catch (error) {
        console.warn("Preview playback failed:", error);
      }
    } else {
      video.pause();
    }
  }

  if (playButton) {
    playButton.addEventListener("click", togglePlayback);
  }

  video.addEventListener("click", togglePlayback);

  video.addEventListener("play", function () {
    if (playButton) {
      playButton.textContent = "Pause";
      playButton.setAttribute("aria-label", "Pause preview");
    }
  });

  video.addEventListener("pause", function () {
    if (playButton) {
      playButton.textContent = "Play";
      playButton.setAttribute("aria-label", "Play preview");
    }
  });

  /* ---------- TIMELINE ---------- */

  if (seekBar) {
    seekBar.addEventListener("input", function () {
      if (!video.duration) return;

      video.currentTime =
        (Number(seekBar.value) / 100) * video.duration;
    });
  }

  video.addEventListener("timeupdate", updateTime);

  video.addEventListener("loadedmetadata", updateTime);

  /* ---------- ASPECT RATIO ---------- */

  function setAspectRatio(ratio) {
    if (!ratio) return;

    project.aspectRatio = ratio;

    if (previewFrame) {
      const parts = String(ratio).split(":");
      const width = Number(parts[0]);
      const height = Number(parts[1]);

      if (width > 0 && height > 0) {
        previewFrame.style.aspectRatio =
          width + " / " + height;
      }
    }

    document.querySelectorAll("[data-ratio]").forEach((button) => {
      button.classList.toggle(
        "selected",
        button.dataset.ratio === String(ratio)
      );
    });

    updatePreview();

    window.dispatchEvent(
      new CustomEvent("vpeet:preview-update")
    );
  }

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-ratio]");

    if (!button) return;

    setAspectRatio(button.dataset.ratio);
  });

  /* ---------- BORDER MODE ---------- */

  function setBorderMode(mode) {
    if (!["crop", "blur"].includes(mode)) return;

    project.borderMode = mode;
    updatePreview();
  }

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-border-mode]");

    if (!button) return;

    setBorderMode(button.dataset.borderMode);
  });

  /* ---------- BORDER AMOUNT ---------- */

  const borderInput =
    $("#borderAmount") ||
    $("#borderAmountInput");

  if (borderInput) {
    borderInput.addEventListener("input", function () {
      project.borderAmount = Math.max(
        0,
        Math.min(20, Number(borderInput.value) || 0)
      );

      updatePreview();
    });
  }

  /* ---------- VIDEO POSITION ---------- */

  const positionXInput = $("#positionX");
  const positionYInput = $("#positionY");
  const zoomInput = $("#videoZoom");

  if (positionXInput) {
    positionXInput.addEventListener("input", function () {
      project.positionX = Number(positionXInput.value);
      updatePreview();
    });
  }

  if (positionYInput) {
    positionYInput.addEventListener("input", function () {
      project.positionY = Number(positionYInput.value);
      updatePreview();
    });
  }

  if (zoomInput) {
    zoomInput.addEventListener("input", function () {
      project.zoom = Math.max(
        50,
        Math.min(200, Number(zoomInput.value) || 100)
      );

      updatePreview();
    });
  }

  /* ---------- PREVIEW RENDERING ---------- */

  function updatePreview() {
    const mode = project.borderMode;

    video.style.objectPosition =
      project.positionX + "% " +
      project.positionY + "%";

    video.style.transform =
      "scale(" + (project.zoom / 100) + ")";

    video.style.objectFit =
      mode === "crop" ? "cover" : "contain";

    if (previewStage) {
      previewStage.dataset.borderMode = mode;
      previewStage.style.setProperty(
        "--preview-border",
        project.borderAmount + "%"
      );
    }

    if (previewFrame) {
      previewFrame.dataset.borderMode = mode;
    }

    window.dispatchEvent(
      new CustomEvent("vpeet:preview-update", {
        detail: project
      })
    );
  }

  /* ---------- ERROR HANDLING ---------- */

  video.addEventListener("error", function () {
    console.error("VPEET: Video preview could not be loaded.");

    alert(
      "Video preview could not be loaded. Try another video format."
    );
  });

  /* ---------- PUBLIC API ---------- */

  window.VPEET_PREVIEW = {
    loadVideo,
    updatePreview,
    setAspectRatio,
    setBorderMode,
    togglePlayback,
    getVideo: () => video,
    getProject: () => project
  };

  showEmpty();

  console.log("VPEET Studio Preview Engine Ready.");
})();
