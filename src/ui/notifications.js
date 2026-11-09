import { notifications } from "../core/notifications.js";
import { eventBus } from "../core/event-bus.js";

const ICONS = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ⓘ"
};

export class NotificationUI {
  constructor(options = {}) {
    this.root = options.root || document;
    this.container = null;
    this.unsubscribe = null;
    this.items = new Map();
    this.maxVisible = options.maxVisible || 5;
    this.defaultDuration = options.duration || 4000;
  }

  init() {
    this.container =
      this.root.querySelector("#notificationArea");

    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "notificationArea";
      this.container.className = "notification-area";
      this.root.body.appendChild(this.container);
    }

    this.container.setAttribute(
      "aria-live",
      "polite"
    );

    this.container.setAttribute(
      "aria-relevant",
      "additions"
    );

    this.unsubscribe = notifications.subscribe(
      notification => this.show(notification)
    );

    return this;
  }

  show(notification = {}) {
    const id = notification.id ||
      `notification-${Date.now()}-${Math.random()}`;

    const type = ICONS[notification.type]
      ? notification.type
      : "info";

    const message = String(
      notification.message || "Notification"
    );

    if (this.items.has(id)) {
      this.dismiss(id);
    }

    while (this.items.size >= this.maxVisible) {
      const oldest = this.items.keys().next().value;
      this.dismiss(oldest);
    }

    const element = document.createElement("div");

    element.className = `notification notification-${type}`;
    element.dataset.notificationId = id;
    element.setAttribute("role", "status");

    const icon = document.createElement("span");
    icon.className = "notification-icon";
    icon.textContent = ICONS[type];

    const text = document.createElement("span");
    text.className = "notification-message";
    text.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "notification-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Dismiss notification");

    close.addEventListener("click", () => {
      this.dismiss(id);
    });

    element.append(icon, text, close);
    this.container.appendChild(element);

    const duration = Number.isFinite(notification.duration)
      ? notification.duration
      : this.defaultDuration;

    const timer = duration > 0
      ? setTimeout(() => this.dismiss(id), duration)
      : null;

    this.items.set(id, {
      element,
      timer,
      notification
    });

    requestAnimationFrame(() => {
      element.classList.add("visible");
    });

    eventBus.emit("NOTIFICATION_DISPLAYED", {
      id,
      type,
      message
    });

    return id;
  }

  dismiss(id) {
    const item = this.items.get(id);

    if (!item) return false;

    if (item.timer) {
      clearTimeout(item.timer);
    }

    item.element.classList.remove("visible");

    const element = item.element;

    this.items.delete(id);

    setTimeout(() => {
      element.remove();
    }, 220);

    eventBus.emit("NOTIFICATION_DISMISSED", { id });

    return true;
  }

  clear() {
    for (const id of [...this.items.keys()]) {
      this.dismiss(id);
    }
  }

  success(message, duration) {
    return this.show({
      type: "success",
      message,
      duration
    });
  }

  error(message, duration = 0) {
    return this.show({
      type: "error",
      message,
      duration
    });
  }

  warning(message, duration) {
    return this.show({
      type: "warning",
      message,
      duration
    });
  }

  info(message, duration) {
    return this.show({
      type: "info",
      message,
      duration
    });
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clear();
    this.container = null;
  }
}

export const notificationUI = new NotificationUI();
