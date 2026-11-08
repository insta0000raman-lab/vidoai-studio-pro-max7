
/* ==============================================
   VPEET STUDIO — EFFECTS & COLOR ENGINE
   Color Grading / CC Presets / Enhancement
============================================== */

(function () {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const project = window.VPEET_PROJECT =
    window.VPEET_PROJECT || {};

  project.effects = project.effects || {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    tint: 0,
    sharpen: 0,
    vignette: 0,
    fade: 0,
    exposure: 0,
    preset: "none"
  };

  const effects = project.effects;

  const video = $("#videoPreview");

  const previewFrame =
    $(".preview-frame") ||
    $(".preview-stage");

  const controls = {
    brightness: $("#brightness"),
    contrast: $("#contrast"),
    saturation: $("#saturation"),
    temperature: $("#temperature"),
    tint: $("#tint"),
    sharpen: $("#sharpen"),
    vignette: $("#vignette"),
    fade: $("#fade"),
    exposure: $("#exposure")
  };

  const presets = {
    none: {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      temperature: 0,
      tint: 0,
      sharpen: 0,
      vignette: 0,
      fade: 0,
      exposure: 0
    },

    cinematic: {
      brightness: 96,
      contrast: 115,
      saturation: 90,
      temperature: -4,
      tint: 2,
      sharpen: 15,
      vignette: 25,
      fade: 3,
      exposure: 0
    },

    vibrant: {
      brightness: 105,
      contrast: 112,
      saturation: 135,
      temperature: 5,
      tint: 0,
      sharpen: 20,
      vignette: 0,
      fade: 0,
      exposure: 0
    },

    moody: {
      brightness: 90,
      contrast: 125,
      saturation: 75,
      temperature: -8,
      tint: 4,
      sharpen: 12,
      vignette: 40,
      fade: 8,
      exposure: -5
    },

    warm: {
      brightness: 105,
      contrast: 105,
      saturation: 115,
      temperature: 20,
      tint: 3,
      sharpen: 10,
      vignette: 8,
      fade: 2,
      exposure: 3
    },

    cool: {
      brightness: 98,
      contrast: 110,
      saturation: 105,
      temperature: -20,
      tint: -3,
      sharpen: 15,
      vignette: 12,
      fade: 0,
      exposure: 0
    },

    blackwhite: {
      brightness: 100,
      contrast: 120,
      saturation: 0,
      temperature: 0,
      tint: 0,
      sharpen: 15,
      vignette: 20,
      fade: 0,
      exposure: 0
    },

    vintage: {
      brightness: 105,
      contrast: 90,
      saturation: 80,
      temperature: 18,
      tint: 8,
      sharpen: 5,
      vignette: 30,
      fade: 18,
      exposure: 2
    },

    hiphop: {
      brightness: 98,
      contrast: 130,
      saturation: 120,
      temperature: -3,
      tint: 0,
      sharpen: 30,
      vignette: 22,
      fade: 0,
      exposure: 0
    }
  };

  /* ---------- HELPERS ---------- */

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function emitUpdate() {
    window.dispatchEvent(
      new CustomEvent("vpeet:effects-update", {
        detail: { ...effects }
      })
    );
  }

  /* ---------- PREVIEW FILTER ---------- */

  function updatePreview() {
    if (!video) return;

    const brightness =
      effects.brightness / 100 +
      effects.exposure / 100;

    const contrast = effects.contrast / 100;
    const saturation = effects.saturation / 100;

    const temperature = effects.temperature;
    const tint = effects.tint;

    /*
      CSS filters provide a basic live preview.
      Advanced temperature, tint, sharpen and vignette
      are passed to the export engine separately.
    */

    video.style.filter = [
      `brightness(${Math.max(0, brightness)})`,
      `contrast(${contrast})`,
      `saturate(${saturation})`,
      `sepia(${Math.max(0, temperature) / 100})`,
      `hue-rotate(${tint}deg)`
    ].join(" ");

    if (previewFrame) {
      previewFrame.style.setProperty(
        "--vpeet-vignette",
        effects.vignette / 100
      );

      previewFrame.dataset.vpeetFade =
        effects.fade;
    }

    emitUpdate();
  }

  /* ---------- SET EFFECT ---------- */

  function setEffect(name, value) {
    if (!(name in effects)) return;

    const ranges = {
      brightness: [0, 200],
      contrast: [0, 200],
      saturation: [0, 200],
      temperature: [-100, 100],
      tint: [-100, 100],
      sharpen: [0, 100],
      vignette: [0, 100],
      fade: [0, 100],
      exposure: [-100, 100]
    };

    if (!ranges[name]) return;

    effects[name] = clamp(
      value,
      ranges[name][0],
      ranges[name][1]
    );

    if (controls[name]) {
      controls[name].value = effects[name];
    }

    updatePreview();
  }

  /* ---------- BIND CONTROLS ---------- */

  Object.keys(controls).forEach(name => {
    const input = controls[name];

    if (!input) return;

    input.addEventListener("input", () => {
      setEffect(name, input.value);
    });
  });

  /* ---------- APPLY PRESET ---------- */

  function applyPreset(name) {
    const preset = presets[name];

    if (!preset) return false;

    Object.assign(effects, preset);

    effects.preset = name;

    Object.keys(controls).forEach(key => {
      if (controls[key]) {
        controls[key].value = effects[key];
      }
    });

    updatePreview();

    return true;
  }

  document.addEventListener("click", event => {
    const button =
      event.target.closest("[data-effect-preset]");

    if (!button) return;

    applyPreset(button.dataset.effectPreset);
  });

  /* ---------- RESET ---------- */

  function resetEffects() {
    applyPreset("none");
  }

  const resetButton =
    $("#resetEffectsButton") ||
    $("#resetEffects");

  if (resetButton) {
    resetButton.addEventListener(
      "click",
      resetEffects
    );
  }

  /* ---------- GET EXPORT SETTINGS ---------- */

  function getExportSettings() {
    return {
      brightness: effects.brightness,
      contrast: effects.contrast,
      saturation: effects.saturation,
      temperature: effects.temperature,
      tint: effects.tint,
      sharpen: effects.sharpen,
      vignette: effects.vignette,
      fade: effects.fade,
      exposure: effects.exposure,
      preset: effects.preset
    };
  }

  /* ---------- PUBLIC API ---------- */

  window.VPEET_EFFECTS = {
    setEffect,
    applyPreset,
    resetEffects,
    updatePreview,
    getSettings: () => ({ ...effects }),
    getExportSettings,
    getPresets: () => clonePresets()
  };

  function clonePresets() {
    return JSON.parse(JSON.stringify(presets));
  }

  updatePreview();

  console.log("VPEET Effects Engine Ready.");

})();
            
