import { notifications } from "../core/notifications.js";
import { createId } from "../project/schema.js";
import { projectManager } from "../project/project-manager.js";

export class ElementsPanel {
  constructor(options = {}) {
    this.container =
      options.container ||
      document.querySelector('[data-panel-content="elements"]');

    this.category = "all";
    this.searchQuery = "";
    this.favorites = new Set();

    this.elements = this.createDefaultElements();

    this.bind();
    this.render();
  }

  createDefaultElements() {
    return [
      {
        id: "text-neon",
        name: "Neon Title",
        category: "text",
        type: "text",
        favorite: false,
        data: {
          text: "YOUR TEXT",
          color: "#ffffff",
          glow: "#8b7cff",
          fontSize: 72,
          bold: true
        }
      },
      {
        id: "text-minimal",
        name: "Minimal Caption",
        category: "text",
        type: "text",
        favorite: false,
        data: {
          text: "MINIMAL TEXT",
          color: "#ffffff",
          fontSize: 42,
          bold: false
        }
      },
      {
        id: "text-lyrics",
        name: "Lyrics Style",
        category: "text",
        type: "text",
        favorite: false,
        data: {
          text: "YOUR LYRICS",
          color: "#ffffff",
          fontSize: 58,
          bold: true,
          alignment: "center"
        }
      },
      {
        id: "overlay-dark",
        name: "Dark Overlay",
        category: "overlay",
        type: "overlay",
        favorite: false,
        data: {
          color: "#000000",
          opacity: 0.35
        }
      },
      {
        id: "overlay-light",
        name: "Light Overlay",
        category: "overlay",
        type: "overlay",
        favorite: false,
        data: {
          color: "#ffffff",
          opacity: 0.18
        }
      },
      {
        id: "shape-circle",
        name: "Circle",
        category: "shape",
        type: "shape",
        favorite: false,
        data: {
          shape: "circle",
          color: "#8b7cff"
        }
      },
      {
        id: "shape-line",
        name: "Line",
        category: "shape",
        type: "shape",
        favorite: false,
        data: {
          shape: "line",
          color: "#45dfba"
        }
      }
    ];
  }

  bind() {
    if (!this.container) return;

    this.container.addEventListener("click", event => {
      const button = event.target.closest("[data-element-action]");

      if (!button) return;

      const action = button.dataset.elementAction;
      const id = button.dataset.elementId;

      if (action === "add") {
        this.addElement(id);
      }

      if (action === "favorite") {
        this.toggleFavorite(id);
      }

      if (action === "category") {
        this.category = button.dataset.category;
        this.render();
      }
    });

    this.container.addEventListener("input", event => {
      if (event.target.matches("[data-element-search]")) {
        this.searchQuery = event.target.value;
        this.render();
      }
    });
  }

  getFilteredElements() {
    return this.elements.filter(element => {
      const categoryMatch =
        this.category === "all" ||
        element.category === this.category ||
        (this.category === "favorites" &&
          this.favorites.has(element.id));

      const searchMatch =
        element.name.toLowerCase().includes(
          this.searchQuery.toLowerCase()
        );

      return categoryMatch && searchMatch;
    });
  }

  toggleFavorite(id) {
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
    } else {
      this.favorites.add(id);
    }

    this.render();
  }

  addElement(id) {
    const element = this.elements.find(
      item => item.id === id
    );

    if (!element) return;

    const project = projectManager.currentProject;

    if (!project) {
      notifications.warning("Open a project first.");
      return;
    }

    const detail = {
      id: createId("element"),
      templateId: element.id,
      name: element.name,
      type: element.type,
      category: element.category,
      data: structuredClone(element.data),
      createdAt: Date.now()
    };

    document.dispatchEvent(
      new CustomEvent("zerox:element-add-request", {
        detail
      })
    );

    notifications.info(
      `${element.name} add request sent.`
    );
  }

  createCategoryButton(id, label) {
    const button = document.createElement("button");

    button.type = "button";
    button.dataset.elementAction = "category";
    button.dataset.category = id;
    button.textContent = label;

    if (this.category === id) {
      button.classList.add("active");
    }

    return button;
  }

  createElementCard(element) {
    const card = document.createElement("article");
    card.className = "element-card";

    const title = document.createElement("strong");
    title.textContent = element.name;

    const category = document.createElement("span");
    category.textContent = element.category;

    const add = document.createElement("button");
    add.type = "button";
    add.dataset.elementAction = "add";
    add.dataset.elementId = element.id;
    add.textContent = "Add";

    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.dataset.elementAction = "favorite";
    favorite.dataset.elementId = element.id;
    favorite.textContent =
      this.favorites.has(element.id) ? "★" : "☆";

    card.append(title, category, add, favorite);

    return card;
  }

  render() {
    if (!this.container) return;

    this.container.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Elements Library";
    this.container.appendChild(heading);

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search elements...";
    search.dataset.elementSearch = "true";
    search.value = this.searchQuery;
    this.container.appendChild(search);

    const categories = document.createElement("div");
    categories.className = "element-categories";

    [
      ["all", "All"],
      ["text", "Text"],
      ["overlay", "Overlays"],
      ["shape", "Shapes"],
      ["favorites", "Favorites"]
    ].forEach(([id, label]) => {
      categories.appendChild(
        this.createCategoryButton(id, label)
      );
    });

    this.container.appendChild(categories);

    const grid = document.createElement("div");
    grid.className = "elements-grid";

    this.getFilteredElements().forEach(element => {
      grid.appendChild(this.createElementCard(element));
    });

    if (!grid.children.length) {
      const empty = document.createElement("p");
      empty.className = "empty-message";
      empty.textContent = "No matching elements found.";
      grid.appendChild(empty);
    }

    this.container.appendChild(grid);
  }

  destroy() {
    this.container?.replaceChildren();
  }
}

export default ElementsPanel;
