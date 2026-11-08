
/* VPEET STUDIO — TEXT LAYERS ENGINE */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const project = window.VPEET_PROJECT =
    window.VPEET_PROJECT || {};

  project.textLayers = project.textLayers || [];

  let selectedId = null;
  let nextId = 1;

  const video = $("mainVideo");
  const overlay = $("textOverlayContainer");
  const layerList = $("layersList");
  const layerEditor = $("layerEditor");

  const fields = {
    text: $("layerText"),
    size: $("layerFontSize"),
    color: $("layerColor"),
    start: $("layerStart"),
    end: $("layerEnd"),
    font: $("layerFont"),
    position: $("layerPosition")
  };

  const presets = {
    cinematic: {
      font: "Georgia", color: "#ffffff",
      size: 38, weight: "bold",
      shadow: "0 3px 12px #000000"
    },
    glow: {
      font: "Arial", color: "#ffffff",
      size: 42, weight: "bold",
      shadow: "0 0 15px #8b7cff"
    },
    minimal: {
      font: "Arial", color: "#ffffff",
      size: 28, weight: "normal",
      shadow: "none"
    },
    bold: {
      font: "Arial Black", color: "#ffffff",
      size: 46, weight: "900",
      shadow: "0 3px 8px #000000"
    },
    social: {
      font: "Arial", color: "#ffe66d",
      size: 40, weight: "bold",
      shadow: "0 3px 10px #000000"
    }
  };

  function getSelected() {
    return project.textLayers.find(
      layer => layer.id === selectedId
    );
  }

  function createId() {
    return "vpeet-text-" + Date.now() + "-" + nextId++;
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent(
      "vpeet:layers-changed",
      { detail: { layers: project.textLayers } }
    ));
  }

  function positionY(position) {
    if (position === "top") return 15;
    if (position === "bottom") return 85;
    return 50;
  }

  function getPosition(y) {
    if (Number(y) <= 30) return "top";
    if (Number(y) >= 70) return "bottom";
    return "center";
  }

  function showEditor() {
    if (layerEditor) {
      layerEditor.hidden = !getSelected();
    }
  }

  function loadEditor() {
    const layer = getSelected();

    showEditor();
    if (!layer) return;

    fields.text.value = layer.text;
    fields.size.value = layer.size;
    fields.color.value = layer.color;
    fields.start.value = layer.start;
    fields.end.value = layer.end;
    fields.font.value = layer.font;
    fields.position.value = getPosition(layer.y);
  }

  function addLayer(text = "Your text here") {
    const layer = {
      id: createId(),
      name: "Text " + (project.textLayers.length + 1),
      text,
      font: "DM Sans",
      color: "#ffffff",
      size: 40,
      weight: "bold",
      shadow: "0 2px 8px #000000",
      x: 50,
      y: 50,
      start: video ? video.currentTime : 0,
      end: video && video.duration
        ? video.duration
        : 5,
      opacity: 1,
      rotation: 0,
      align: "center",
      hidden: false,
      locked: false
    };

    project.textLayers.push(layer);
    selectedId = layer.id;

    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();

    return layer;
  }

  function selectLayer(id) {
    if (!project.textLayers.some(layer => layer.id === id)) {
      return;
    }

    selectedId = id;
    renderLayers();
    loadEditor();
    renderPreview();
  }

  function deleteLayer(id) {
    project.textLayers = project.textLayers.filter(
      layer => layer.id !== id
    );

    if (selectedId === id) {
      selectedId = null;
    }

    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();
  }

  function updateLayer(property, value) {
    const layer = getSelected();

    if (!layer || layer.locked) return;

    if (property === "size") {
      value = Math.max(8, Math.min(200, Number(value) || 8));
    }

    if (property === "start" || property === "end") {
      value = Math.max(0, Number(value) || 0);
    }

    if (property === "position") {
      layer.y = positionY(value);
    } else {
      layer[property] = value;
    }

    renderLayers();
    renderPreview();
    emitChange();
  }

  function applyPreset(name) {
    const preset = presets[name];
    if (!preset) return;

    let layer = getSelected();

    if (!layer) {
      layer = addLayer("Your text here");
    }

    if (layer.locked) return;

    Object.assign(layer, preset);
    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();
  }

  function makeButton(label, action, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;

    if (className) button.className = className;

    button.addEventListener("click", action);
    return button;
  }

  function renderLayers() {
    if (!layerList) return;

    layerList.replaceChildren();

    if (!project.textLayers.length) {
      const empty = document.createElement("div");
      empty.className = "empty-layers";
      empty.textContent = "No text layers yet. Add your first layer.";
      layerList.appendChild(empty);
      return;
    }

    project.textLayers.forEach(layer => {
      const item = document.createElement("div");

      item.className = "text-layer-item" +
        (layer.id === selectedId ? " selected" : "");

      const title = document.createElement("span");
      title.textContent = layer.name + ": " + layer.text;
      item.appendChild(title);

      item.appendChild(makeButton("Edit", () => {
        selectLayer(layer.id);
        if (layerEditor) {
          layerEditor.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
          });
        }
      }));

      item.appendChild(makeButton("Delete", () => {
        deleteLayer(layer.id);
      }));

      layerList.appendChild(item);
    });
  }

  function renderPreview() {
    if (!overlay) return;

    overlay.replaceChildren();

    const currentTime = video ? video.currentTime : 0;

    project.textLayers.forEach(layer => {
      if (layer.hidden || layer.text === "") return;

      const start = Number(layer.start) || 0;
      const end = Number(layer.end) || 0;

      if (currentTime < start || currentTime > end) return;

      const text = document.createElement("div");
      text.className = "vpeet-live-text";
      text.textContent = layer.text;

      Object.assign(text.style, {
        position: "absolute",
        left: Number(layer.x) + "%",
        top: Number(layer.y) + "%",
        transform:
          "translate(-50%, -50%) rotate(" +
          (Number(layer.rotation) || 0) + "deg)",
        fontFamily: layer.font,
        fontSize: Math.max(8, Number(layer.size) || 40) + "px",
        fontWeight: layer.weight || "bold",
        color: layer.color || "#ffffff",
        textShadow: layer.shadow || "none",
        opacity: layer.opacity ?? 1,
        textAlign: layer.align || "center",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        maxWidth: "90%",
        lineHeight: "1.2",
        zIndex: String(project.textLayers.indexOf(layer) + 1)
      });

      overlay.appendChild(text);
    });
  }

  // ADD TEXT BUTTON
  $("addTextLayer")?.addEventListener("click", () => {
    addLayer();
  });

  // TEXT EDITOR — LIVE INPUT
  Object.entries(fields).forEach(([property, input]) => {
    if (!input) return;

    input.addEventListener("input", () => {
      updateLayer(property, input.value);
    });

    input.addEventListener("change", () => {
      updateLayer(property, input.value);
    });
  });

  // PRESET BUTTONS
  document.querySelectorAll("[data-preset]").forEach(button => {
    button.addEventListener("click", () => {
      applyPreset(button.dataset.preset);
    });
  });

  // VIDEO PLAYBACK
  if (video) {
    ["timeupdate", "seeked", "loadedmetadata", "play", "pause"]
      .forEach(eventName => {
        video.addEventListener(eventName, renderPreview);
      });
  }

  // REFRESH PREVIEW WHEN STEP OPENS
  window.addEventListener("vpeet:stepchange", renderPreview);

  // PUBLIC API
  window.VPEET_TEXT = {
    addLayer,
    selectLayer,
    deleteLayer,
    applyPreset,
    renderLayers,
    renderPreview,
    updateLayer,
    getLayers: () => project.textLayers,
    getSelected: getSelected
  };

  renderLayers();
  loadEditor();
  renderPreview();

  console.log("VPEET Text Layers Ready");
})();
