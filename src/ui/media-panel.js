import { mediaImporter } from "../media/importer.js";
import { mediaCache } from "../media/media-cache.js";
import { notifications } from "../core/notifications.js";

export class MediaPanel {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.querySelector('[data-panel-content="media"]');

    this.assets = [];
    this.filter = "all";
    this.searchQuery = "";

    this.bind();
    this.refresh();
  }

  bind() {
    if (!this.container) return;

    this.container.addEventListener("click", event => {
      const button = event.target.closest("[data-media-action]");
      if (!button) return;

      const action = button.dataset.mediaAction;
      const assetId = button.dataset.assetId;

      if (action === "import") {
        this.openFilePicker();
      }

      if (action === "add") {
        this.addToTimeline(assetId);
      }

      if (action === "preview") {
        this.previewAsset(assetId);
      }

      if (action === "remove") {
        this.removeAsset(assetId);
      }

      if (action === "filter") {
        this.filter = button.dataset.filter;
        this.render();
      }
    });

    this.container.addEventListener("input", event => {
      if (event.target.matches("[data-media-search]")) {
        this.searchQuery = event.target.value;
        this.render();
      }
    });

    this.container.addEventListener("change", event => {
      if (event.target.matches("[data-media-files]")) {
        this.importFiles(event.target.files);
      }
    });
  }

  async refresh() {
    try {
      const project = mediaImporter.getProject?.();

      this.assets = project?.assets || [];

      this.render();
    } catch (error) {
      notifications.error(
        `Media library error: ${error.message}`
      );
    }
  }

  openFilePicker() {
    const input = document.createElement("input");

    input.type = "file";
    input.multiple = true;
    input.accept = [
      "video/*",
      "audio/*",
      "image/*"
    ].join(",");

    input.dataset.mediaFiles = "true";

    input.addEventListener("change", () => {
      this.importFiles(input.files);
    });

    input.click();
  }

  async importFiles(fileList) {
    const files = Array.from(fileList || []);

    if (!files.length) return;

    let imported = 0;

    for (const file of files) {
      try {
        await mediaImporter.importFile(file);
        imported++;
      } catch (error) {
        notifications.error(
          `${file.name}: ${error.message}`
        );
      }
    }

    await this.refresh();

    if (imported) {
      notifications.success(
        `${imported} media file(s) imported.`
      );
    }
  }

  getAsset(assetId) {
    return this.assets.find(
      asset => asset.id === assetId
    );
  }

  getFilteredAssets() {
    return this.assets.filter(asset => {
      const type = asset.type || asset.kind || "";

      const matchesFilter =
        this.filter === "all" ||
        type === this.filter;

      const matchesSearch =
        (asset.name || "")
          .toLowerCase()
          .includes(this.searchQuery.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }

  previewAsset(assetId) {
    const asset = this.getAsset(assetId);

    if (!asset) return;

    const url =
      mediaCache.getURL?.(asset.id) ||
      asset.sourceUrl ||
      asset.url;

    if (!url) {
      notifications.warning(
        "Media preview is not available. Re-import the file if needed."
      );
      return;
    }

    document.dispatchEvent(
      new CustomEvent("zerox:media-preview", {
        detail: { asset, url }
      })
    );
  }

  addToTimeline(assetId) {
    const asset = this.getAsset(assetId);

    if (!asset) return;

    document.dispatchEvent(
      new CustomEvent("zerox:media-add-request", {
        detail: { asset }
      })
    );

    notifications.info(
      `${asset.name || "Media"} add request sent.`
    );
  }

  async removeAsset(assetId) {
    const asset = this.getAsset(assetId);

    if (!asset) return;

    const confirmed = window.confirm(
      `Remove "${asset.name || "this asset"}" from the project?`
    );

    if (!confirmed) return;

    try {
      await mediaImporter.removeAsset(assetId);
      await this.refresh();

      notifications.success("Media removed.");
    } catch (error) {
      notifications.error(error.message);
    }
  }

  createAssetCard(asset) {
    const card = document.createElement("article");
    card.className = "media-card";

    const name = document.createElement("strong");
    name.textContent = asset.name || "Untitled media";

    const type = document.createElement("span");
    type.textContent = asset.type || asset.kind || "Media";

    const preview = this.createButton(
      "preview",
      asset.id,
      "Preview"
    );

    const add = this.createButton(
      "add",
      asset.id,
      "Add to Timeline"
    );

    const remove = this.createButton(
      "remove",
      asset.id,
      "Remove"
    );

    card.append(name, type, preview, add, remove);

    return card;
  }

  createButton(action, assetId, label) {
    const button = document.createElement("button");

    button.type = "button";
    button.dataset.mediaAction = action;
    button.dataset.assetId = assetId;
    button.textContent = label;

    return button;
  }

  render() {
    if (!this.container) return;

    this.container.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Media Library";
    this.container.appendChild(heading);

    const importButton = this.createButton(
      "import",
      "",
      "+ Import Media"
    );

    this.container.appendChild(importButton);

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search media...";
    search.dataset.mediaSearch = "true";
    search.value = this.searchQuery;

    this.container.appendChild(search);

    const filters = document.createElement("div");
    filters.className = "media-filters";

    [
      ["all", "All"],
      ["video", "Videos"],
      ["image", "Images"],
      ["audio", "Audio"]
    ].forEach(([filter, label]) => {
      const button = this.createButton(
        "filter",
        "",
        label
      );

      button.dataset.filter = filter;

      if (this.filter === filter) {
        button.classList.add("active");
      }

      filters.appendChild(button);
    });

    this.container.appendChild(filters);

    const grid = document.createElement("div");
    grid.className = "media-grid";

    this.getFilteredAssets().forEach(asset => {
      grid.appendChild(this.createAssetCard(asset));
    });

    if (!grid.children.length) {
      const empty = document.createElement("p");
      empty.className = "empty-message";
      empty.textContent =
        "No media found. Import videos, images or audio.";

      grid.appendChild(empty);
    }

    this.container.appendChild(grid);
  }

  destroy() {
    this.container?.replaceChildren();
  }
}

export default MediaPanel;
