
/* =====================================================
   VPEET STUDIO — ADVANCED TEXT & LAYER ENGINE
   Copy / Paste / Cut / Duplicate / Multi-select
   Group / Ungroup / Lock / Hide / Undo / Redo
   Copy Style / Paste Style / Timeline Timing
===================================================== */

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const project = window.VPEET_PROJECT =
    window.VPEET_PROJECT || {};

  project.textLayers = project.textLayers || [];

  let selectedIds = [];
  let clipboard = [];
  let styleClipboard = null;
  let history = [];
  let future = [];
  let nextId = 1;
  let activeGroup = null;

  const video = $("#videoPreview");

  const preview =
    $("#textPreviewContainer") ||
    $(".preview-frame");

  const layerList =
    $("#textLayerList") ||
    $("#layersList");

  const editor = {
    text: $("#layerText") || $("#textContent"),
    font: $("#layerFont") || $("#textFont"),
    color: $("#layerColor") || $("#textColor"),
    size: $("#layerSize") || $("#textSize"),
    start: $("#layerStart") || $("#textStart"),
    end: $("#layerEnd") || $("#textEnd"),
    x: $("#layerPositionX"),
    y: $("#layerPositionY")
  };

  const presets = {
    cinematic: {
      font: "Georgia",
      color: "#ffffff",
      size: 38,
      weight: "bold",
      shadow: "0 3px 12px #000000"
    },
    glow: {
      font: "Arial",
      color: "#ffffff",
      size: 42,
      weight: "bold",
      shadow: "0 0 15px #8b7cff"
    },
    minimal: {
      font: "Arial",
      color: "#ffffff",
      size: 28,
      weight: "normal",
      shadow: "none"
    },
    bold: {
      font: "Arial Black",
      color: "#ffffff",
      size: 46,
      weight: "900",
      shadow: "0 3px 8px #000000"
    },
    social: {
      font: "Arial",
      color: "#ffe66d",
      size: 40,
      weight: "bold",
      shadow: "0 3px 10px #000000"
    }
  };

  function id() {
    return "vpeet-layer-" +
      Date.now().toString(36) + "-" +
      nextId++;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getLayer(layerId) {
    return project.textLayers.find(
      layer => layer.id === layerId
    );
  }

  function getSelected() {
    return project.textLayers.filter(
      layer => selectedIds.includes(layer.id)
    );
  }

  function saveHistory() {
    history.push(clone(project.textLayers));

    if (history.length > 60) {
      history.shift();
    }

    future = [];
  }

  function restoreSelection(ids) {
    selectedIds = ids.filter(
      layerId => Boolean(getLayer(layerId))
    );

    renderLayers();
    loadEditor();
    renderPreview();
  }

  function emitChange() {
    window.dispatchEvent(
      new CustomEvent("vpeet:layers-changed", {
        detail: {
          layers: project.textLayers,
          selectedIds
        }
      })
    );
  }

  /* =========================
     ADD TEXT LAYER
  ========================= */

  function addLayer(text = "Your text here") {
    saveHistory();

    const layer = {
      id: id(),
      name: "Text " + (project.textLayers.length + 1),
      text,
      type: "text",
      font: "Arial",
      color: "#ffffff",
      size: 36,
      weight: "bold",
      align: "center",
      x: 50,
      y: 50,
      start: 0,
      end: 5,
      shadow: "0 2px 8px #000000",
      opacity: 1,
      rotation: 0,
      locked: false,
      hidden: false,
      groupId: null,
      preset: "custom"
    };

    project.textLayers.push(layer);

    selectedIds = [layer.id];

    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();

    return layer;
  }

  /* =========================
     SELECT LAYERS
  ========================= */

  function selectLayer(layerId, multi = false) {
    if (!getLayer(layerId)) return;

    if (multi) {
      if (selectedIds.includes(layerId)) {
        selectedIds = selectedIds.filter(
          item => item !== layerId
        );
      } else {
        selectedIds.push(layerId);
      }
    } else {
      selectedIds = [layerId];
    }

    renderLayers();
    loadEditor();
    renderPreview();
  }

  function selectAll() {
    selectedIds = project.textLayers
      .filter(layer => !layer.hidden)
      .map(layer => layer.id);

    renderLayers();
    loadEditor();
    renderPreview();
  }

  function clearSelection() {
    selectedIds = [];
    renderLayers();
    renderPreview();
  }

  /* =========================
     COPY
  ========================= */

  function copyLayers() {
    const selected = getSelected();

    if (!selected.length) return false;

    clipboard = clone(selected);

    return true;
  }

  /* =========================
     CUT
  ========================= */

  function cutLayers() {
    if (!copyLayers()) return false;

    saveHistory();

    project.textLayers =
      project.textLayers.filter(
        layer => !selectedIds.includes(layer.id)
      );

    selectedIds = [];

    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();

    return true;
  }

  /* =========================
     PASTE
  ========================= */

  function pasteLayers() {
    if (!clipboard.length) return [];

    saveHistory();

    const pasted = clipboard.map((original, index) => {
      const layer = clone(original);

      layer.id = id();
      layer.name = original.name + " Copy";
      layer.x = Math.min(100, Number(layer.x) + 2);
      layer.y = Math.min(100, Number(layer.y) + 2);

      if (layer.groupId) {
        layer.groupId = null;
      }

      return layer;
    });

    project.textLayers.push(...pasted);

    selectedIds = pasted.map(layer => layer.id);

    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();

    return pasted;
  }

  /* =========================
     DUPLICATE
  ========================= */

  function duplicateLayers() {
    if (!copyLayers()) return [];

    return pasteLayers();
  }

  /* =========================
     DELETE
  ========================= */

  function deleteLayers() {
    if (!selectedIds.length) return;

    saveHistory();

    project.textLayers =
      project.textLayers.filter(
        layer => !selectedIds.includes(layer.id)
      );

    selectedIds = [];

    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();
  }

  /* =========================
     COPY / PASTE STYLE
  ========================= */

  const styleProperties = [
    "font",
    "color",
    "size",
    "weight",
    "align",
    "shadow",
    "opacity",
    "rotation"
  ];

  function copyStyle() {
    const layer = getSelected()[0];

    if (!layer) return false;

    styleClipboard = {};

    styleProperties.forEach(key => {
      styleClipboard[key] = layer[key];
    });

    return true;
  }

  function pasteStyle() {
    if (!styleClipboard || !selectedIds.length) {
      return false;
    }

    saveHistory();

    getSelected().forEach(layer => {
      Object.assign(
        layer,
        clone(styleClipboard)
      );
    });

    renderLayers();
    renderPreview();
    emitChange();

    return true;
  }

  /* =========================
     GROUP
  ========================= */

  function groupLayers() {
    if (selectedIds.length < 2) return false;

    saveHistory();

    const groupId = id();

    getSelected().forEach(layer => {
      layer.groupId = groupId;
    });

    activeGroup = groupId;

    renderLayers();
    emitChange();

    return true;
  }

  /* =========================
     UNGROUP
  ========================= */

  function ungroupLayers() {
    if (!selectedIds.length) return;

    saveHistory();

    getSelected().forEach(layer => {
      layer.groupId = null;
    });

    activeGroup = null;

    renderLayers();
    emitChange();
  }

  /* =========================
     LOCK / UNLOCK
  ========================= */

  function toggleLock() {
    const selected = getSelected();

    if (!selected.length) return;

    saveHistory();

    const shouldLock = selected.some(
      layer => !layer.locked
    );

    selected.forEach(layer => {
      layer.locked = shouldLock;
    });

    renderLayers();
    emitChange();
  }

  /* =========================
     HIDE / SHOW
  ========================= */

  function toggleVisibility() {
    const selected = getSelected();

    if (!selected.length) return;

    saveHistory();

    const shouldHide = selected.some(
      layer => !layer.hidden
    );

    selected.forEach(layer => {
      layer.hidden = shouldHide;
    });

    renderLayers();
    renderPreview();
    emitChange();
  }

  /* =========================
     MOVE LAYER ORDER
  ========================= */

  function moveLayer(layerId, direction) {
    const index = project.textLayers.findIndex(
      layer => layer.id === layerId
    );

    const next = index + direction;

    if (
      index < 0 ||
      next < 0 ||
      next >= project.textLayers.length
    ) return;

    saveHistory();

    const layers = project.textLayers;

    [layers[index], layers[next]] =
      [layers[next], layers[index]];

    renderLayers();
    renderPreview();
    emitChange();
  }

  /* =========================
     UPDATE SELECTED
  ========================= */

  function updateSelected(changes) {
    const selected = getSelected();

    if (!selected.length) return;

    if (selected.some(layer => layer.locked)) {
      return;
    }

    saveHistory();

    selected.forEach(layer => {
      Object.assign(layer, changes);
    });

    renderLayers();
    renderPreview();
    emitChange();
  }

  /* =========================
     EDITOR
  ========================= */

  function loadEditor() {
    const layer = getSelected()[0];

    if (!layer) return;

    if (editor.text) editor.text.value = layer.text;
    if (editor.font) editor.font.value = layer.font;
    if (editor.color) editor.color.value = layer.color;
    if (editor.size) editor.size.value = layer.size;
    if (editor.start) editor.start.value = layer.start;
    if (editor.end) editor.end.value = layer.end;
    if (editor.x) editor.x.value = layer.x;
    if (editor.y) editor.y.value = layer.y;
  }

  function bindInput(input, property, convert) {
    if (!input) return;

    input.addEventListener("change", () => {
      let value = input.value;

      if (convert) value = convert(value);

      updateSelected({
        [property]: value
      });
    });
  }

  bindInput(editor.text, "text");
  bindInput(editor.font, "font");
  bindInput(editor.color, "color");
  bindInput(editor.size, "size", Number);
  bindInput(editor.start, "start", Number);
  bindInput(editor.end, "end", Number);
  bindInput(editor.x, "x", Number);
  bindInput(editor.y, "y", Number);

  /* =========================
     PRESETS
  ========================= */

  function applyPreset(name) {
    const preset = presets[name];

    if (!preset || !selectedIds.length) return;

    updateSelected({
      ...clone(preset),
      preset: name
    });

    loadEditor();
  }

  /* =========================
     LAYER LIST UI
  ========================= */

  function makeButton(label, action, disabled = false) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;

    button.addEventListener("click", action);

    return button;
  }

  function renderLayers() {
    if (!layerList) return;

    layerList.replaceChildren();

    project.textLayers.forEach((layer, index) => {
      const item = document.createElement("div");

      item.className =
        "text-layer-item" +
        (selectedIds.includes(layer.id) ? " selected" : "") +
        (layer.locked ? " locked" : "") +
        (layer.hidden ? " hidden" : "");

      item.dataset.layerId = layer.id;

      const title = document.createElement("span");

      title.textContent =
        (layer.hidden ? "◉ " : "● ") +
        (layer.locked ? "🔒 " : "") +
        layer.name + ": " + layer.text;

      item.appendChild(title);

      item.appendChild(
        makeButton("Select", () => {
          selectLayer(layer.id);
        })
      );

      item.appendChild(
        makeButton("↑", () => {
          moveLayer(layer.id, -1);
        }, index === 0)
      );

      item.appendChild(
        makeButton("↓", () => {
          moveLayer(layer.id, 1);
        }, index === project.textLayers.length - 1)
      );

      layerList.appendChild(item);
    });
  }

  /* =========================
     PREVIEW
  ========================= */

  function renderPreview() {
    if (!preview) return;

    let overlay = $("#vpeetTextOverlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "vpeetTextOverlay";

      Object.assign(overlay.style, {
        position: "absolute",
        inset: "0",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: "20"
      });

      if (getComputedStyle(preview).position === "static") {
        preview.style.position = "relative";
      }

      preview.appendChild(overlay);
    }

    overlay.replaceChildren();

    const currentTime = video ? video.currentTime : 0;

    project.textLayers.forEach(layer => {
      if (layer.hidden) return;

      if (
        currentTime < Number(layer.start) ||
        currentTime > Number(layer.end)
      ) return;

      const element = document.createElement("div");

      element.textContent = layer.text;

      Object.assign(element.style, {
        position: "absolute",
        left: layer.x + "%",
        top: layer.y + "%",
        transform:
          "translate(-50%, -50%) rotate(" +
          (Number(layer.rotation) || 0) + "deg)",
        fontFamily: layer.font,
        fontSize: layer.size + "px",
        fontWeight: layer.weight,
        color: layer.color,
        textAlign: layer.align,
        textShadow: layer.shadow,
        opacity: layer.opacity,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        maxWidth: "90%",
        lineHeight: "1.2"
      });

      overlay.appendChild(element);
    });
  }

  if (video) {
    video.addEventListener("timeupdate", renderPreview);
    video.addEventListener("seeked", renderPreview);
    video.addEventListener("loadedmetadata", renderPreview);
  }

  /* =========================
     UNDO
  ========================= */

  function undo() {
    if (!history.length) return false;

    future.push(clone(project.textLayers));

    project.textLayers = history.pop();

    selectedIds = selectedIds.filter(
      layerId => Boolean(getLayer(layerId))
    );

    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();

    return true;
  }

  /* =========================
     REDO
  ========================= */

  function redo() {
    if (!future.length) return false;

    history.push(clone(project.textLayers));

    project.textLayers = future.pop();

    selectedIds = selectedIds.filter(
      layerId => Boolean(getLayer(layerId))
    );

    renderLayers();
    loadEditor();
    renderPreview();
    emitChange();

    return true;
  }

  /* =========================
     KEYBOARD SHORTCUTS
  ========================= */

  document.addEventListener("keydown", function (event) {
    const target = event.target;

    const typing =
      target &&
      (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );

    if (typing) return;

    const mod = event.ctrlKey || event.metaKey;

    if (mod && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copyLayers();
    }

    if (mod && event.key.toLowerCase() === "v") {
      event.preventDefault();
      pasteLayers();
    }

    if (mod && event.key.toLowerCase() === "x") {
      event.preventDefault();
      cutLayers();
    }

    if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateLayers();
    }

    if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
    }

    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }

    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteLayers();
    }
  });

  /* =========================
     PUBLIC API
  ========================= */

  window.VPEET_TEXT = {
    addLayer,
    selectLayer,
    selectAll,
    clearSelection,
    copyLayers,
    pasteLayers,
    cutLayers,
    duplicateLayers,
    deleteLayers,
    copyStyle,
    pasteStyle,
    groupLayers,
    ungroupLayers,
    toggleLock,
    toggleVisibility,
    moveLayer,
    updateSelected,
    applyPreset,
    undo,
    redo,
    renderLayers,
    renderPreview,
    getLayers: () => project.textLayers,
    getSelected: () => getSelected(),
    getClipboard: () => clone(clipboard)
  };

  /* =========================
     STARTUP
  ========================= */

  renderLayers();
  renderPreview();

  console.log("VPEET Advanced Text Engine Ready.");

})();
