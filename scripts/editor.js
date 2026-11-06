(function () {
  "use strict";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  let initialized = false;
  let timeline = null;
  let tools = null;
  let currentVideoId = null;

  function notify(message) {
    if (window.VYORA && typeof window.VYORA.showToast === "function") {
      window.VYORA.showToast(message);
      return;
    }

    const toast = $("#toastRegion");

    if (toast) {
      toast.textContent = message;
      toast.classList.add("visible");

      setTimeout(() => {
        toast.classList.remove("visible");
      }, 3000);
    } else {
      console.log("[VYORA]", message);
    }
  }

  function createEditorHTML() {
    return `
      <div class="editor-workspace">

        <header class="editor-topbar">
          <div class="editor-brand">
            <button class="editor-back" id="vyoraBack">
              <i data-lucide="arrow-left"></i>
            </button>

            <div>
              <strong>VYORA</strong>
              <span>STUDIO</span>
            </div>
          </div>

          <div class="editor-project-name">
            <span id="vyoraProjectName">Untitled Project</span>
          </div>

          <div class="editor-top-actions">
            <button id="vyoraUndo" title="Undo">
              <i data-lucide="undo-2"></i>
            </button>

            <button id="vyoraRedo" title="Redo">
              <i data-lucide="redo-2"></i>
            </button>

            <button id="vyoraSave" title="Save project">
              <i data-lucide="save"></i>
            </button>

            <button class="export-main-button" id="vyoraExport">
              <i data-lucide="download"></i>
              Export
            </button>
          </div>
        </header>

        <main class="editor-main">

          <section class="editor-preview-section">

            <div class="preview-heading">
              <span>PREVIEW</span>

              <div class="preview-controls">
                <button id="vyoraPreviewFit">
                  <i data-lucide="maximize"></i>
                </button>
              </div>
            </div>

            <div class="preview-stage-wrap">
              <div class="preview-stage" id="vyoraPreviewStage">
                <canvas id="vyoraPreviewCanvas"
                  width="1080"
                  height="1920"></canvas>

                <div class="preview-empty" id="vyoraPreviewEmpty">
                  <i data-lucide="clapperboard"></i>
                  <strong>Preview is ready</strong>
                  <span>Your video will appear here</span>
                </div>
              </div>
            </div>

            <div class="preview-playback">
              <button id="vyoraPreviousFrame">
                <i data-lucide="skip-back"></i>
              </button>

              <button id="vyoraPlay">
                <i data-lucide="play"></i>
              </button>

              <button id="vyoraStop">
                <i data-lucide="square"></i>
              </button>

              <button id="vyoraNextFrame">
                <i data-lucide="skip-forward"></i>
              </button>

              <span id="vyoraTimeDisplay">00:00 / 00:00</span>
            </div>

          </section>

          <section class="editor-tools-section">

            <div class="editor-section-heading">
              <strong>TOOLS</strong>
            </div>

            <div class="editor-tool-tabs">
              <button class="editor-tab active" data-panel="media">
                <i data-lucide="film"></i>
                Media
              </button>

              <button class="editor-tab" data-panel="crop">
                <i data-lucide="crop"></i>
                Crop
              </button>

              <button class="editor-tab" data-panel="trim">
                <i data-lucide="scissors"></i>
                Trim
              </button>

              <button class="editor-tab" data-panel="text">
                <i data-lucide="type"></i>
                Text
              </button>

              <button class="editor-tab" data-panel="audio">
                <i data-lucide="audio-lines"></i>
                Audio
              </button>

              <button class="editor-tab" data-panel="effects">
                <i data-lucide="sparkles"></i>
                Effects
              </button>

              <button class="editor-tab" data-panel="transform">
                <i data-lucide="sliders-horizontal"></i>
                Settings
              </button>
            </div>

            <div id="vyoraToolsPanel" class="editor-tools-panel">
              <div class="tools-placeholder">
                Select a tool to begin editing.
              </div>
            </div>

          </section>

        </main>

        <section class="editor-timeline-section">

          <div class="timeline-heading">
            <div>
              <strong>TIMELINE</strong>
              <span id="vyoraTimelineDuration">00:00</span>
            </div>

            <div class="timeline-actions">
              <button id="vyoraAddVideo">
                <i data-lucide="video"></i>
                Video
              </button>

              <button id="vyoraAddAudio">
                <i data-lucide="music"></i>
                Audio
              </button>

              <button id="vyoraAddText">
                <i data-lucide="type"></i>
                Text
              </button>
            </div>
          </div>

          <div id="vyoraTimeline" class="timeline-container"></div>

        </section>

        <div class="editor-statusbar">
          <span id="vyoraStatus">Ready</span>
          <span id="vyoraResolution">1080 × 1920</span>
        </div>

      </div>

      <div class="vyora-export-overlay" id="vyoraExportOverlay">
        <div class="vyora-export-card">
          <div class="export-card-heading">
            <strong>Export Video</strong>
            <button id="vyoraCloseExport">
              <i data-lucide="x"></i>
            </button>
          </div>

          <label>Resolution</label>
          <select id="vyoraExportResolution">
            <option value="720">720p</option>
            <option value="1080" selected>1080p</option>
            <option value="1440">2K</option>
            <option value="2160">4K</option>
          </select>

          <label>Frame rate</label>
          <select id="vyoraExportFPS">
            <option value="24">24 FPS</option>
            <option value="30" selected>30 FPS</option>
            <option value="60">60 FPS</option>
          </select>

          <label>Bitrate</label>
          <select id="vyoraExportBitrate">
            <option value="5000000">5 Mbps</option>
            <option value="10000000" selected>10 Mbps</option>
            <option value="16000000">16 Mbps</option>
            <option value="25000000">25 Mbps</option>
          </select>

          <div class="export-progress-area" id="vyoraExportProgressArea">
            <div class="export-progress-track">
              <div id="vyoraExportProgressBar"></div>
            </div>
            <span id="vyoraExportProgressText">0%</span>
          </div>

          <button class="export-main-button export-start-button"
            id="vyoraStartExport">
            Start Export
          </button>
        </div>
      </div>
    `;
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function setStatus(message) {
    const element = $("#vyoraStatus");
    if (element) element.textContent = message;
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    return (
      String(minutes).padStart(2, "0") +
      ":" +
      String(remaining).padStart(2, "0")
    );
  }

  function getProject() {
    return window.VYORAProject;
  }

  function getSelectedClip() {
    const project = getProject();

    if (!project) return null;

    return project.getSelectedClip();
  }

  function getDuration() {
    const project = getProject();

    if (!project) return 0;

    let duration = 0;

    for (const track of project.state.tracks || []) {
      for (const clip of track.clips || []) {
        duration = Math.max(
          duration,
          Number(clip.start || 0) +
          Number(clip.duration || 0)
        );
      }
    }

    return duration;
  }

  function initializeModules() {
    if (!window.VYORAProject) {
      notify("Project module is missing.");
      return false;
    }

    if (!window.VYORAMedia) {
      notify("Media module is missing.");
      return false;
    }

    if (!window.VYORATimeline) {
      notify("Timeline module is missing.");
      return false;
    }

    if (!window.VYORATools) {
      notify("Tools module is missing.");
      return false;
    }

    if (!window.VYORAExporter) {
      notify("Export module is missing.");
      return false;
    }

    return true;
  }

  function importOriginalVideo(detail) {
    const state = detail.state || {};

    const file =
      state.videoFile ||
      state.selectedFile ||
      detail.videoFile ||
      null;

    if (!file || !(file instanceof File)) {
      notify("Original video file was not found.");
      return;
    }

    const media = window.VYORAMedia;

    const asset = media.addAsset(file);

    currentVideoId = asset.id;

    const project = getProject();

    const videoTrack = project.state.tracks.find(
      track => track.type === "video"
    );

    if (!videoTrack) {
      notify("Video track was not found.");
      return;
    }

    project.addClip(videoTrack.id, {
      source: asset.id,
      name: file.name,
      start: 0,
      duration: Number(asset.duration || 1),
      sourceStart: 0,
      speed: 1,
      crop: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });

    media.openVideo(asset.id);

    $("#vyoraPreviewEmpty").style.display = "none";

    setStatus("Video imported");

    updateProjectInfo();
    drawPreview();

    notify("Video added to timeline.");
  }

  function updateProjectInfo() {
    const project = getProject();

    if (!project) return;

    const settings = project.state.settings || {};

    const name = $("#vyoraProjectName");
    const resolution = $("#vyoraResolution");
    const duration = $("#vyoraTimelineDuration");

    if (name) {
      name.textContent = project.state.name || "Untitled Project";
    }

    if (resolution) {
      resolution.textContent =
        `${settings.width || 1080} × ${settings.height || 1920}`;
    }

    if (duration) {
      duration.textContent = formatTime(getDuration());
    }
  }

  function drawPreview() {
    const canvas = $("#vyoraPreviewCanvas");

    if (!canvas || !window.VYORAMedia) return;

    const media = window.VYORAMedia;

    const video = media.activeVideo &&
      media.activeVideo.element;

    if (!video || video.readyState < 2) return;

    const context = canvas.getContext("2d");

    context.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;

    const scale = Math.max(
      width / video.videoWidth,
      height / video.videoHeight
    );

    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;

    context.drawImage(
      video,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );

    const project = getProject();

    if (project) {
      const time = project.state.playhead || 0;

      for (const layer of project.state.textLayers || []) {
        if (
          time < layer.start ||
          time >= layer.start + layer.duration
        ) continue;

        context.save();

        context.fillStyle = layer.color || "#ffffff";
        context.globalAlpha =
          Number(layer.opacity ?? 100) / 100;

        context.font =
          `bold ${Number(layer.fontSize || 48)}px Arial`;

        context.textAlign = "center";

        context.fillText(
          layer.text || "",
          width * Number(layer.x ?? 50) / 100,
          height * Number(layer.y ?? 50) / 100
        );

        context.restore();
      }
    }
  }

  function openToolPanel(panel) {
    if (!tools) return;

    $$(".editor-tab").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.panel === panel
      );
    });

    tools.setPanel(panel);
  }

  function bindEditorEvents() {
    $("#vyoraBack").addEventListener("click", () => {
      const home = $("#homeScreen");

      if (home) home.classList.remove("hidden");

      const editor = $("#editorScreen");

      if (editor) editor.classList.add("hidden");
    });

    $("#vyoraUndo").addEventListener("click", () => {
      getProject().undo();
      setStatus("Undo");
      drawPreview();
    });

    $("#vyoraRedo").addEventListener("click", () => {
      getProject().redo();
      setStatus("Redo");
      drawPreview();
    });

    $("#vyoraSave").addEventListener("click", () => {
      const data = getProject().exportProject();

      const blob = new Blob([data], {
        type: "application/json"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "VYORA-project.json";
      link.click();

      URL.revokeObjectURL(url);

      notify("Project file saved.");
    });

    $("#vyoraPlay").addEventListener("click", () => {
      if (!window.VYORAMedia) return;

      window.VYORAMedia.play();

      setStatus("Playing");
    });

    $("#vyoraStop").addEventListener("click", () => {
      window.VYORAMedia.stop();

      setStatus("Stopped");
      drawPreview();
    });

    $("#vyoraPreviousFrame").addEventListener("click", () => {
      const project = getProject();

      project.setPlayhead(
        Math.max(0, project.state.playhead - 1 / 30)
      );

      drawPreview();
    });

    $("#vyoraNextFrame").addEventListener("click", () => {
      const project = getProject();

      project.setPlayhead(
        project.state.playhead + 1 / 30
      );

      drawPreview();
    });

    $("#vyoraPreviewFit").addEventListener("click", () => {
      drawPreview();
    });

    $$(".editor-tab").forEach(button => {
      button.addEventListener("click", () => {
        openToolPanel(button.dataset.panel);
      });
    });

    $("#vyoraAddVideo").addEventListener("click", () => {
      $("#vyoraExtraVideoInput").click();
    });

    $("#vyoraAddAudio").addEventListener("click", () => {
      $("#vyoraExtraAudioInput").click();
    });

    $("#vyoraAddText").addEventListener("click", () => {
      openToolPanel("text");
      tools.addText();
    });

    $("#vyoraExport").addEventListener("click", () => {
      $("#vyoraExportOverlay").classList.add("open");
    });

    $("#vyoraCloseExport").addEventListener("click", () => {
      $("#vyoraExportOverlay").classList.remove("open");
    });

    $("#vyoraStartExport").addEventListener("click", startExport);

    $("#vyoraExportResolution").addEventListener("change", event => {
      const value = Number(event.target.value);

      const ratio = getProject().state.settings.ratio ||
        (9 / 16);

      const width = value;
      const height = Math.round(width / ratio);

      getProject().setSettings({
        width,
        height
      });

      updateProjectInfo();
    });

    $("#vyoraExportFPS").addEventListener("change", event => {
      getProject().setSettings({
        fps: Number(event.target.value)
      });
    });

    $("#vyoraExportBitrate").addEventListener("change", event => {
      getProject().setSettings({
        bitrate: Number(event.target.value)
      });
    });

    createExtraInputs();
  }

  function createExtraInputs() {
    const videoInput = document.createElement("input");

    videoInput.type = "file";
    videoInput.accept = "video/*";
    videoInput.id = "vyoraExtraVideoInput";
    videoInput.hidden = true;

    videoInput.addEventListener("change", async event => {
      const file = event.target.files[0];

      if (!file) return;

      try {
        const asset = await window.VYORAMedia.addAsset(file);

        const track = getProject().state.tracks.find(
          item => item.type === "video"
        );

        getProject().addClip(track.id, {
          source: asset.id,
          name: file.name,
          start: getDuration(),
          duration: Number(asset.duration || 1),
          sourceStart: 0,
          speed: 1
        });

        updateProjectInfo();
        notify("Video added.");
      } catch (error) {
        notify(error.message);
      }

      event.target.value = "";
    });

    const audioInput = document.createElement("input");

    audioInput.type = "file";
    audioInput.accept = "audio/*";
    audioInput.id = "vyoraExtraAudioInput";
    audioInput.hidden = true;

    audioInput.addEventListener("change", async event => {
      const file = event.target.files[0];

      if (!file) return;

      try {
        const asset = await window.VYORAMedia.addAsset(file);

        const track = getProject().state.tracks.find(
          item => item.type === "audio"
        );

        getProject().addClip(track.id, {
          source: asset.id,
          name: file.name,
          start: 0,
          duration: Number(asset.duration || 1),
          sourceStart: 0,
          speed: 1,
          metadata: {
            volume: 1,
            fadeIn: 0,
            fadeOut: 0
          }
        });

        updateProjectInfo();
        notify("Audio added to timeline.");
      } catch (error) {
        notify(error.message);
      }

      event.target.value = "";
    });

    document.body.append(videoInput, audioInput);
  }

  async function startExport() {
    const button = $("#vyoraStartExport");

    button.disabled = true;
    button.textContent = "Exporting...";

    $("#vyoraExportProgressArea").style.display = "block";

    try {
      await window.VYORAExporter.export({
        filename: "VYORA-Video"
      });

      notify("Export completed.");
    } catch (error) {
      notify(error.message || "Export failed.");
    } finally {
      button.disabled = false;
      button.textContent = "Start Export";
    }
  }

  function bindExportEvents() {
    window.addEventListener("vyora:export-progress", event => {
      const progress = event.detail.progress;

      $("#vyoraExportProgressBar").style.width =
        progress + "%";

      $("#vyoraExportProgressText").textContent =
        progress + "%";
    });

    window.addEventListener("vyora:export-complete", () => {
      $("#vyoraExportProgressText").textContent = "100%";
    });

    window.addEventListener("vyora:export-error", event => {
      notify(event.detail.message);
    });
  }

  function initializeEditor(detail) {
    if (initialized) {
      const screen = $("#editorScreen");

      if (screen) screen.classList.remove("hidden");

      importOriginalVideo(detail);
      return;
    }

    if (!initializeModules()) return;

    const mount = $("#editorMount");

    if (!mount) {
      notify("Editor mount element is missing.");
      return;
    }

    mount.innerHTML = createEditorHTML();

    renderIcons();

    timeline = window.VYORATimeline.init(
  $("#vyoraTimeline")
);

tools = window.VYORATools.init(
  $("#vyoraToolsPanel")
);

    bindEditorEvents();
    bindExportEvents();

    const screen = $("#editorScreen");

    if (screen) screen.classList.remove("hidden");

    initialized = true;

    importOriginalVideo(detail);

    openToolPanel("media");

    updateProjectInfo();

    renderIcons();
  }

  window.addEventListener("vyora:open-editor",     event => {
      initializeEditor(event.detail || {});
    }
  );

  window.VYORAEditor = {
    initialize: initializeEditor,
    drawPreview,
    updateProjectInfo,
    getDuration
  };

})();
