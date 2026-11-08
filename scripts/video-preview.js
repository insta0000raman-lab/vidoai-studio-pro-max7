
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const input = $("videoInput");
  const video = $("mainVideo");
  const placeholder = $("previewPlaceholder");
  const fileBox = $("uploadedFile");
  const fileName = $("fileName");
  const fileDetails = $("fileDetails");
  const removeButton = $("removeVideoButton");
  const frame = $("previewFrame");

  if (!input || !video) {
    console.error("VPEET: videoInput ya mainVideo HTML mein nahi mila.");
    return;
  }

  let currentURL = null;

  function showError(message) {
    console.error("VPEET Video:", message);
    if (placeholder) {
      placeholder.hidden = false;
      placeholder.textContent = message;
    }
  }

  function clearVideo() {
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (currentURL) {
      URL.revokeObjectURL(currentURL);
      currentURL = null;
    }

    input.value = "";
    if (placeholder) placeholder.hidden = false;
    if (fileBox) fileBox.hidden = true;
    if (fileName) fileName.textContent = "";
    if (fileDetails) fileDetails.textContent = "";
  }

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      showError("Please select a video file.");
      return;
    }

    if (currentURL) URL.revokeObjectURL(currentURL);

    currentURL = URL.createObjectURL(file);

    video.pause();
    video.src = currentURL;
    video.muted = false;
    video.controls = false;
    video.playsInline = true;
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      if (placeholder) placeholder.hidden = true;
      if (fileBox) fileBox.hidden = false;

      if (fileName) fileName.textContent = file.name;

      if (fileDetails) {
        const size = (file.size / (1024 * 1024)).toFixed(1);
        fileDetails.textContent =
          `${size} MB • ${video.videoWidth} × ${video.videoHeight}`;
      }

      video.currentTime = 0;
      console.log("VPEET: Video loaded successfully.");
    };

    video.onerror = () => {
      showError("Video load nahi hui. Dusri MP4 video try karo.");
    };

    video.load();
  });

  if (removeButton) {
    removeButton.addEventListener("click", clearVideo);
  }

  // Play / pause
  const playButton = $("playPauseButton");
  if (playButton) {
    playButton.addEventListener("click", () => {
      if (video.paused) {
        video.play().catch((err) => console.error(err));
      } else {
        video.pause();
      }
    });
  }

  video.addEventListener("play", () => {
    const icon = $("playPauseIcon");
    if (icon) icon.textContent = "❚❚";
  });

  video.addEventListener("pause", () => {
    const icon = $("playPauseIcon");
    if (icon) icon.textContent = "▶";
  });

  // Mute
  const muteButton = $("muteButton");
  if (muteButton) {
    muteButton.addEventListener("click", () => {
      video.muted = !video.muted;
      const icon = $("muteIcon");
      if (icon) icon.textContent = video.muted ? "🔇" : "🔊";
    });
  }

  // Time display
  video.addEventListener("timeupdate", () => {
    const current = $("currentTime");
    const total = $("totalDuration");

    const format = (seconds) => {
      if (!Number.isFinite(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    };

    if (current) current.textContent = format(video.currentTime);
    if (total) total.textContent = format(video.duration);
  });

  // Aspect ratio buttons
  document.querySelectorAll("[data-ratio]").forEach((button) => {
    button.addEventListener("click", () => {
      const ratio = button.dataset.ratio;
      const ratios = {
        "9:16": "9 / 16",
        "16:9": "16 / 9",
        "1:1": "1 / 1",
        "4:5": "4 / 5",
        "original": "auto"
      };

      if (!ratios[ratio]) return;

      document.querySelectorAll("[data-ratio]").forEach((b) => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", b === button ? "true" : "false");
      });

      if (frame) frame.style.aspectRatio =
        ratio === "original" && video.videoWidth
          ? `${video.videoWidth} / ${video.videoHeight}`
          : ratios[ratio];
    });
  });

  // Initial preview state
  video.style.display = "block";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "contain";

  console.log("VPEET: Video preview module ready.");
})();
