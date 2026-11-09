import { eventBus } from "../core/event-bus.js";
import { store } from "../core/state-store.js";

const PANEL_DEFINITIONS = {
  media: {
    title: "Media Library",
    description: "Import and manage your media",
    icon: "film"
  },
  text: {
    title: "Text & Typography",
    description: "Create and animate text layers",
    icon: "type"
  },
  effects: {
    title: "Effects & Color",
    description: "Adjust colors and visual effects",
    icon: "sliders"
  },
  audio: {
    title: "Audio Studio",
    description: "Manage music and sound",
    icon: "audio-lines"
  },
  elements: {
    title: "Elements Library",
    description: "Browse reusable design elements",
    icon: "shapes"
  },
  ai: {
    title: "AI Studio",
    description: "Smart editing and automation tools",
    icon: "sparkles"
  },
  project: {
    title: "Project Settings",
    description: "Manage project configuration",
    icon: "settings"
  }
};

export class PanelManager {
  constructor(options = {}) {
    this.root = options.root || document;
    this.activePanel = null;
    this.previousPanel = null;
    this.listeners = new Set();
    this.isMobile = false;

    this.elements = {
      buttons: [],
      panels: []
    };

    this.handleResize = this.handleResize.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  init() {
    this.elements.buttons = [
      ...this.root.querySelectorAll("[data-panel]")
    ];

    this.elements.panels = [
      ...this.root.querySelectorAll("[data-panel-content]")
    ];

    this.elements.buttons.forEach(button => {
      button.addEventListener("click", this.handleClick);
    });

    window.addEventListener("resize", this.handleResize);

    document.addEventListener(
      "keydown",
      this.handleKeydown
    );

    this.handleResize();

    const initial = this.elements.buttons.find(
      button => button.classList.contains("active")
    );

    this.open(initial?.dataset.panel || "media");

    return this;
  }

  handleClick(event) {
    const button = event.currentTarget;
    const panelId = button.dataset.panel;

    if (panelId) {
      this.open(panelId);
    }
  }

  handleResize() {
    this.isMobile = window.matchMedia(
      "(max-width: 760px)"
    ).matches;

    document.body.classList.toggle(
      "mobile-editor",
      this.isMobile
    );

    this.emit("layout-changed", {
      isMobile: this.isMobile
    });
  }

  handleKeydown(event) {
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const shortcuts = {
        "1": "media",
        "2": "text",
        "3": "effects",
        "4": "audio",
        "5": "elements",
        "6": "ai",
        "7": "project"
      };

      const panelId = shortcuts[event.key];

      if (panelId) {
        event.preventDefault();
        this.open(panelId);
      }
    }
  }

  open(panelId, options = {}) {
    if (!PANEL_DEFINITIONS[panelId]) {
      throw new Error(`Unknown panel: ${panelId}`);
    }

    if (this.activePanel === panelId &&
        !options.force) {
      return false;
    }

    this.previousPanel = this.activePanel;
    this.activePanel = panelId;

    this.elements.buttons.forEach(button => {
      const active = button.dataset.panel === panelId;

      button.classList.toggle("active", active);
      button.setAttribute(
        "aria-pressed",
        String(active)
      );
    });

    this.elements.panels.forEach(panel => {
      const active =
        panel.dataset.panelContent === panelId;

      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });

    const definition = PANEL_DEFINITIONS[panelId];

    store.set("activePanel", panelId);

    eventBus.emit("PANEL_CHANGED", {
      id: panelId,
      previous: this.previousPanel,
      definition
    });

    this.emit("panel-changed", {
      id: panelId,
      previous: this.previousPanel,
      definition
    });

    return true;
  }

  back() {
    if (!this.previousPanel) return false;

    return this.open(this.previousPanel);
  }

  getActive() {
    return {
      id: this.activePanel,
      definition: PANEL_DEFINITIONS[this.activePanel] || null
    };
  }

  getPanels() {
    return Object.entries(PANEL_DEFINITIONS).map(
      ([id, definition]) => ({
        id,
        ...definition,
        active: id === this.activePanel
      })
    );
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Callback must be a function");
    }

    this.listeners.add(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  emit(type, data) {
    const event = {
      type,
      data,
      timestamp: Date.now()
    };

    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error("Panel listener error:", error);
      }
    });
  }

  destroy() {
    this.elements.buttons.forEach(button => {
      button.removeEventListener("click", this.handleClick);
    });

    window.removeEventListener(
      "resize",
      this.handleResize
    );

    document.removeEventListener(
      "keydown",
      this.handleKeydown
    );

    this.listeners.clear();
  }
}

export const panelManager = new PanelManager();
export { PANEL_DEFINITIONS };
