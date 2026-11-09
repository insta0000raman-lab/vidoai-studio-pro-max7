import { mediaImporter } from "../media/importer.js";
import { mediaCache } from "../media/media-cache.js";
import { projectManager } from "../project/project-manager.js";
import { notifications } from "../core/notifications.js";

export class MediaLibrary {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.getElementById("mediaLibrary");

    this.input =
      options.input ||
      document.getElementById("mediaInput");

    this.search = null;
    this.filter = "all";
    this.query = "";
    this.assets = [];

    this.bind();
    this.refresh();
  }

  bind() {
    this.input?.addEventListener("change", async event => {
      const files = Array.from(event.target.files || []);

      if (!files.length) return;

      await this.importFiles(files);

      event.target.value = "";
    });

    if (!this.container) return;

    this.container.addEventListener("click", event => {
      const button = event.target.closest("[data-action]");

      if (!button) return;

      const id = button.dataset.assetId;

      if (button.dataset.action === "remove") {
        this.removeAsset(id);
      }

      if (button.dataset.action === "preview") {
        this.previewAsset(id);
      }

      if (button.dataset.action === "add") {
        this.addToTimeline(id);
      }
    });
  }

  async importFiles(files) {
    try {
      const results = await mediaImporter.importFiles(files);

      this.refresh();

      const count = results?.length || 0;

      notifications.success(
        `${count} media file(s) imported.`
      );

      return results;

    } catch (error) {
      notifications.error(
        `Import failed: ${error.message}`
      );

      return [];
    }
  }

  refresh() {
    const project = projectManager.currentProject;

    this.assets = project?.assets || [];

    this.render();
  }

  setFilter(filter) {
    this.filter = filter || "all";
    this.render();
  }

  setSearch(query) {
    this.query = String(query || "").toLowerCase();
    this.render();
  }

  getFilteredAssets() {
    return this.assets.filter(asset => {
      const type = asset.type || "unknown";

      const matchesFilter =
        this.filter === "all" ||
        type === this.filter;

      const name = String(asset.name || "").toLowerCase();

      const matchesSearch =
        !this.query || name.includes(this.query);

      return matchesFilter && matchesSearch;
    });
  }

  render() {
    if (!this.container) return;

    const assets = this.getFilteredAssets();
    const fragment = document.createDocumentFragment();

    if (!assets.length) {
      const empty = document.createElement("div");

      empty.className = "empty-message";
      empty.textContent = this.query
        ? "No matching media found."
        : "Import videos, photos or audio to begin.";

      fragment.appendChild(empty);
      this.container.replaceChildren(fragment);

      return;
    }

    for (const asset of assets) {
      fragment.appendChild(this.createAssetCard(asset));
    }

    this.container.replaceChildren(fragment);
  }

  createAssetCard(asset) {
    const card = document.createElement("article");

    card.className = "media-item";
    card.dataset.assetId = asset.id;

    const thumbnail = document.createElement("div");

    thumbnail.className = "media-thumbnail";

    const icon = document.createElement("span");

    icon.textContent = this.getIcon(asset.type);
    thumbnail.appendChild(icon);

    const details = document.createElement("div");

    details.className = "media-details";

    const title = document.createElement("div");

    title.className = "media-name";
    title.textContent = asset.name || "Untitled media";

    const subtitle = document.createElement("div");

    subtitle.className = "media-meta";
    subtitle.textContent = this.getMetadataText(asset);

    details.append(title, subtitle);

    const actions = document.createElement("div");

    actions.className = "media-actions";

    actions.append(
      this.createAction("preview", asset.id, "Preview"),
      this.createAction("add", asset.id, "Add"),
      this.createAction("remove", asset.id, "Remove")
    );

    card.append(thumbnail, details, actions);

    return card;
  }

  createAction(action, assetId, label) {
    const button = document.createElement("button");

    button.type = "button";
    button.dataset.action = action;
    button.dataset.assetId = assetId;
    button.textContent = label;

    return button;
  }

  getIcon(type) {
    const icons = {
      video: "▶",
      image: "▧",
      audio: "♫"
    };

    return icons[type] || "▣";
  }

  getMetadataText(asset) {
    const parts = [];

    if (asset.type) parts.push(asset.type.toUpperCase());

    if (asset.duration) {
      parts.push(`${Number(asset.duration).toFixed(1)}s`);
    }

    if (asset.width && asset.height) {
      parts.push(`${asset.width} × ${asset.height}`);
    }

    return parts.join(" • ");
  }

  async previewAsset(assetId) {
    const asset = this.assets.find(item => item.id === assetId);

    if (!asset) return;

    try {
      const url = await mediaCache.getURL(assetId);

      if (!url) {
        throw new Error("Media file is not available.");
      }

      const event = new CustomEvent("zerox:media-preview", {
        detail: {
          asset,
          url
        }
      });

      document.dispatchEvent(event);

    } catch (error) {
      notifications.error(error.message);
    }
  }

  addToTimeline(assetId) {
    const asset = this.assets.find(item => item.id === assetId);

    if (!asset) return;

    document.dispatchEvent(
      new CustomEvent("zerox:add-media-to-timeline", {
        detail: { asset }
      })
    );
  }

  async removeAsset(assetId) {
    const confirmed = window.confirm(
      "Remove this media from the project?"
    );

    if (!confirmed) return;

    try {
      await mediaImporter.removeAsset(assetId);

      this.refresh();

      notifications.success("Media removed.");

    } catch (error) {
      notifications.error(error.message);
    }
  }

  destroy() {
    this.input?.removeEventListener("change", this.bind);
    this.container?.replaceChildren();
  }
}

export default MediaLibrary;
