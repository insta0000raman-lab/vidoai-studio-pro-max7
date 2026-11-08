/* ==============================================
   VPEET STUDIO — AUDIO ENGINE
   Background Music / Volume / Fade / Trim
============================================== */

(function () {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const project = window.VPEET_PROJECT =
    window.VPEET_PROJECT || {};

  project.audio = project.audio || {
    file: null,
    url: null,
    volume: 80,
    videoVolume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    start: 0,
    end: null
  };

  const audio = project.audio;
  const video = $("#videoPreview");

  const audioInput =
    $("#audioUpload") ||
    $("#audioInput") ||
    $('input[type="file"][accept*="audio"]');

  const audioName =
    $("#audioFileName");

  const removeButton =
    $("#removeAudioButton");

  const volumeInput =
    $("#audioVolume");

  const videoVolumeInput =
    $("#videoVolume");

  const fadeInInput =
    $("#audioFadeIn");

  const fadeOutInput =
    $("#audioFadeOut");

  const audioStartInput =
    $("#audioStart");

  const audioEndInput =
    $("#audioEnd");

  const muteButton =
    $("#muteAudioButton");

  let audioElement = new Audio();
  audioElement.preload = "auto";

  let audioContext = null;
  let sourceNode = null;
  let gainNode = null;
  let audioConnected = false;

  let audioObjectUrl = null;
  let animationFrame = null;

  /* ---------- EVENTS ---------- */

  function emitUpdate() {
    window.dispatchEvent(
      new CustomEvent("vpeet:audio-update", {
        detail: {
          ...audio,
          file: audio.file
        }
      })
    );
  }

  /* ---------- LOAD AUDIO ---------- */

  function loadAudio(file) {
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      alert("Please select a valid audio file.");
      return;
    }

    if (audioObjectUrl) {
      URL.revokeObjectURL(audioObjectUrl);
    }

    audioObjectUrl = URL.createObjectURL(file);

    audio.file = file;
    audio.url = audioObjectUrl;
    audio.start = 0;
    audio.end = null;

    audioElement.pause();
    audioElement.src = audioObjectUrl;
    audioElement.load();

    audioElement.onloadedmetadata = function () {
      audio.end = audioElement.duration;

      if (audioStartInput) {
        audioStartInput.value = 0;
        audioStartInput.max = audioElement.duration;
      }

      if (audioEndInput) {
        audioEndInput.value = audioElement.duration;
        audioEndInput.max = audioElement.duration;
      }

      if (audioName) {
        audioName.textContent = file.name;
      }

      emitUpdate();
    };
  }

  if (audioInput) {
    audioInput.addEventListener("change", event => {
      loadAudio(event.target.files[0]);
    });
  }

  /* ---------- AUDIO CONTEXT ---------- */

  async function setupAudioContext() {
    if (audioContext) {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      console.warn("Web Audio API not supported.");
      return;
    }

    audioContext = new AudioContextClass();

    sourceNode =
      audioContext.createMediaElementSource(audioElement);

    gainNode = audioContext.createGain();

    sourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);

    audioConnected = true;
  }

  /* ---------- VOLUME ---------- */

  function setVolume(value) {
    audio.volume = Math.max(
      0,
      Math.min(100, Number(value))
    );

    audioElement.volume = audio.volume / 100;

    if (volumeInput) {
      volumeInput.value = audio.volume;
    }

    emitUpdate();
  }

  function setVideoVolume(value) {
    audio.videoVolume = Math.max(
      0,
      Math.min(100, Number(value))
    );

    if (video) {
      video.volume = audio.videoVolume / 100;
    }

    if (videoVolumeInput) {
      videoVolumeInput.value = audio.videoVolume;
    }

    emitUpdate();
  }

  function toggleMute() {
    audio.muted = !audio.muted;

    audioElement.muted = audio.muted;

    if (video) {
      video.muted = audio.muted;
    }

    if (muteButton) {
      muteButton.textContent =
        audio.muted ? "Unmute" : "Mute";
    }

    emitUpdate();
  }

  if (volumeInput) {
    volumeInput.addEventListener("input", () => {
      setVolume(volumeInput.value);
    });
  }

  if (videoVolumeInput) {
    videoVolumeInput.addEventListener("input", () => {
      setVideoVolume(videoVolumeInput.value);
    });
  }

  if (muteButton) {
    muteButton.addEventListener("click", toggleMute);
  }

  /* ---------- FADE SETTINGS ---------- */

  function setFadeIn(value) {
    audio.fadeIn = Math.max(
      0,
      Number(value) || 0
    );

    emitUpdate();
  }

  function setFadeOut(value) {
    audio.fadeOut = Math.max(
      0,
      Number(value) || 0
    );

    emitUpdate();
  }

  if (fadeInInput) {
    fadeInInput.addEventListener("input", () => {
      setFadeIn(fadeInInput.value);
    });
  }

  if (fadeOutInput) {
    fadeOutInput.addEventListener("input", () => {
      setFadeOut(fadeOutInput.value);
    });
  }

  /* ---------- AUDIO TRIM ---------- */

  function setAudioStart(value) {
    audio.start = Math.max(
      0,
      Number(value) || 0
    );

    if (audio.end !== null && audio.start > audio.end) {
      audio.start = audio.end;
    }

    emitUpdate();
  }

  function setAudioEnd(value) {
    audio.end = Math.max(
      audio.start,
      Number(value) || 0
    );

    emitUpdate();
  }

  if (audioStartInput) {
    audioStartInput.addEventListener("change", () => {
      setAudioStart(audioStartInput.value);
    });
  }

  if (audioEndInput) {
    audioEndInput.addEventListener("change", () => {
      setAudioEnd(audioEndInput.value);
    });
  }

  /* ---------- PREVIEW SYNC ---------- */

  function stopPreview() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    audioElement.pause();
  }

  async function startPreview() {
    if (!audio.file || !video) return;

    await setupAudioContext();

    if (audioContext &&
        audioContext.state === "suspended") {
      await audioContext.resume();
    }

    stopPreview();

    const videoTime = video.currentTime;

    if (
      videoTime < audio.start ||
      videoTime > audio.end
    ) {
      audioElement.currentTime = audio.start;
    } else {
      audioElement.currentTime = videoTime;
    }

    audioElement.muted = audio.muted;

    audioElement.volume = audio.volume / 100;

    try {
      await audioElement.play();
    } catch (error) {
      console.warn("Audio preview failed:", error);
      return;
    }

    syncAudio();
  }

  function syncAudio() {
    if (!video || audioElement.paused) return;

    const time = video.currentTime;

    if (
      time < audio.start ||
      time >= audio.end
    ) {
      stopPreview();
      return;
    }

    const offset = time - audio.start;

    const duration = audio.end - audio.start;

    let volume = audio.volume / 100;

    if (audio.fadeIn > 0 && offset < audio.fadeIn) {
      volume *= offset / audio.fadeIn;
    }

    const remaining = duration - offset;

    if (
      audio.fadeOut > 0 &&
      remaining < audio.fadeOut
    ) {
      volume *= Math.max(
        0,
        remaining / audio.fadeOut
      );
    }

    audioElement.volume = Math.max(
      0,
      Math.min(1, volume)
    );

    if (!video.paused) {
      animationFrame =
        requestAnimationFrame(syncAudio);
    }
  }

  if (video) {
    video.addEventListener("play", startPreview);
    video.addEventListener("pause", stopPreview);

    video.addEventListener("seeked", () => {
      if (!video.paused && audio.file) {
        startPreview();
      }
    });
  }

  /* ---------- REMOVE AUDIO ---------- */

  function removeAudio() {
    stopPreview();

    audioElement.removeAttribute("src");
    audioElement.load();

    if (audioObjectUrl) {
      URL.revokeObjectURL(audioObjectUrl);
      audioObjectUrl = null;
    }

    audio.file = null;
    audio.url = null;
    audio.start = 0;
    audio.end = null;

    if (audioName) {
      audioName.textContent = "Audio file";
    }

    if (audioInput) {
      audioInput.value = "";
    }

    emitUpdate();
  }

  if (removeButton) {
    removeButton.addEventListener("click", removeAudio);
  }

  /* ---------- PUBLIC API ---------- */

  window.VPEET_AUDIO = {
    loadAudio,
    setVolume,
    setVideoVolume,
    toggleMute,
    setFadeIn,
    setFadeOut,
    setAudioStart,
    setAudioEnd,
    startPreview,
    stopPreview,
    removeAudio,
    getSettings: () => ({
      ...audio
    }),
    getAudioElement: () => audioElement
  };

  console.log("VPEET Audio Engine Ready.");

})();
    
