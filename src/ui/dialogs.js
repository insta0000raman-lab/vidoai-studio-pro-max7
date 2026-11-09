import { eventBus } from "../core/event-bus.js";
import { notifications } from "../core/notifications.js";

export class DialogManager {
  constructor(options = {}) {
    this.root = options.root || document;
    this.activeDialog = null;
    this.listeners = new Set();
    this.previousFocus = null;

    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  init() {
    this.root.addEventListener("click", this.handleClick);

    document.addEventListener(
      "keydown",
      this.handleKeydown
    );

    return this;
  }

  handleClick(event) {
    const closeButton = event.target.closest(
      "[data-dialog-close]"
    );

    if (closeButton) {
      this.close();
      return;
    }

    const backdrop = event.target.closest(
      "[data-dialog-backdrop]"
    );

    if (backdrop && event.target === backdrop) {
      this.close();
    }
  }

  handleKeydown(event) {
    if (event.key === "Escape" && this.activeDialog) {
      this.close();
    }

    if (event.key === "Tab" && this.activeDialog) {
      this.trapFocus(event);
    }
  }

  open(dialogId, options = {}) {
    const dialog = this.root.querySelector(
      `#${CSS.escape(dialogId)}`
    );

    if (!dialog) {
      throw new Error(`Dialog not found: ${dialogId}`);
    }

    if (this.activeDialog) {
      this.close();
    }

    this.previousFocus = document.activeElement;
    this.activeDialog = dialog;

    dialog.hidden = false;
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("role", "dialog");

    document.body.classList.add("dialog-open");

    const focusTarget = dialog.querySelector(
      "[autofocus], input, button, select, textarea"
    );

    focusTarget?.focus();

    this.emit("opened", {
      id: dialogId,
      options
    });

    eventBus.emit("DIALOG_OPENED", {
      id: dialogId
    });

    return dialog;
  }

  close() {
    if (!this.activeDialog) return false;

    const dialogId = this.activeDialog.id;

    this.activeDialog.hidden = true;
    this.activeDialog.removeAttribute("aria-modal");

    this.activeDialog = null;

    document.body.classList.remove("dialog-open");

    if (this.previousFocus?.isConnected) {
      this.previousFocus.focus();
    }

    this.previousFocus = null;

    this.emit("closed", { id: dialogId });

    eventBus.emit("DIALOG_CLOSED", {
      id: dialogId
    });

    return true;
  }

  trapFocus(event) {
    const focusable = [
      ...this.activeDialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ].filter(element => !element.hidden);

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === last
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  async confirm(options = {}) {
    const {
      title = "Are you sure?",
      message = "Do you want to continue?",
      confirmText = "Confirm",
      cancelText = "Cancel",
      danger = false
    } = options;

    return new Promise(resolve => {
      const overlay = document.createElement("div");

      overlay.className = "dialog-backdrop";
      overlay.dataset.dialogBackdrop = "";

      overlay.innerHTML = `
        <div class="dialog-card" role="dialog" aria-modal="true">
          <h3>${this.escape(title)}</h3>
          <p>${this.escape(message)}</p>

          <div class="dialog-actions">
            <button type="button" data-choice="cancel">
              ${this.escape(cancelText)}
            </button>

            <button
              type="button"
              data-choice="confirm"
              class="${danger ? "danger-button" : "primary-button"}"
            >
              ${this.escape(confirmText)}
            </button>
          </div>
        </div>
      `;

      const finish = result => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        resolve(result);
      };

      const onClick = event => {
        const button = event.target.closest("[data-choice]");

        if (button) {
          finish(button.dataset.choice === "confirm");
        } else if (event.target === overlay) {
          finish(false);
        }
      };

      const onKey = event => {
        if (event.key === "Escape") {
          finish(false);
        }
      };

      overlay.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);

      document.body.appendChild(overlay);

      overlay.querySelector(
        '[data-choice="confirm"]'
      )?.focus();
    });
  }

  async prompt(options = {}) {
    const {
      title = "Enter a name",
      message = "",
      value = "",
      placeholder = "Enter text",
      confirmText = "Save"
    } = options;

    return new Promise(resolve => {
      const overlay = document.createElement("div");

      overlay.className = "dialog-backdrop";

      overlay.innerHTML = `
        <form class="dialog-card">
          <h3>${this.escape(title)}</h3>
          <p>${this.escape(message)}</p>

          <input
            name="value"
            type="text"
            value="${this.escape(value)}"
            placeholder="${this.escape(placeholder)}"
            maxlength="100"
            required
          >

          <div class="dialog-actions">
            <button type="button" data-cancel>Cancel</button>
            <button type="submit" class="primary-button">
              ${this.escape(confirmText)}
            </button>
          </div>
        </form>
      `;

      const form = overlay.querySelector("form");
      const input = form.elements.value;

      const finish = result => {
        overlay.remove();
        resolve(result);
      };

      form.addEventListener("submit", event => {
        event.preventDefault();

        const result = input.value.trim();

        if (!result) {
          input.focus();
          return;
        }

        finish(result);
      });

      overlay.querySelector("[data-cancel]")
        .addEventListener("click", () => finish(null));

      overlay.addEventListener("click", event => {
        if (event.target === overlay) {
          finish(null);
        }
      });

      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  async createProjectName() {
    return this.prompt({
      title: "New Project",
      message: "Choose a name for your project.",
      value: "My Project",
      placeholder: "Project name",
      confirmText: "Create"
    });
  }

  async renameProject(currentName = "") {
    return this.prompt({
      title: "Rename Project",
      message: "Enter the new project name.",
      value: currentName,
      placeholder: "Project name",
      confirmText: "Rename"
    });
  }

  async confirmDelete(name = "this item") {
    return this.confirm({
      title: "Delete permanently?",
      message: `Are you sure you want to delete ${name}?`,
      confirmText: "Delete",
      cancelText: "Keep it",
      danger: true
    });
  }

  escape(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(type, data) {
    this.listeners.forEach(callback => {
      try {
        callback({ type, data });
      } catch (error) {
        console.error("Dialog listener error:", error);
      }
    });
  }

  destroy() {
    this.root.removeEventListener("click", this.handleClick);

    document.removeEventListener(
      "keydown",
      this.handleKeydown
    );

    this.close();
    this.listeners.clear();
  }
}

export const dialogManager = new DialogManager();
