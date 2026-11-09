/* ZERO X MOTION — NOTIFICATION MANAGER */

import { eventBus } from "./event-bus.js";
import { APP_EVENTS } from "../config.js";

const DEFAULT_DURATION = 3500;
const MAX_NOTIFICATIONS = 5;

class NotificationManager {
  constructor() {
    this.items = [];
    this.nextId = 1;
    this.listeners = new Set();
  }

  show(message, type = "info", duration = DEFAULT_DURATION) {
    if (!message) return null;

    const notification = {
      id: this.nextId++,
      message: String(message),
      type: this.normalizeType(type),
      createdAt: Date.now(),
      duration: Math.max(0, Number(duration) || 0)
    };

    this.items.push(notification);

    while (this.items.length > MAX_NOTIFICATIONS) {
      this.items.shift();
    }

    this.notifyListeners();

    eventBus.emit(APP_EVENTS.NOTIFICATION, notification);

    if (notification.duration > 0) {
      setTimeout(() => {
        this.dismiss(notification.id);
      }, notification.duration);
    }

    return notification.id;
  }

  success(message, duration) {
    return this.show(message, "success", duration);
  }

  error(message, duration = 5000) {
    return this.show(message, "error", duration);
  }

  warning(message, duration = 4500) {
    return this.show(message, "warning", duration);
  }

  info(message, duration) {
    return this.show(message, "info", duration);
  }

  normalizeType(type) {
    const allowed = ["success", "error", "warning", "info"];

    return allowed.includes(type) ? type : "info";
  }

  dismiss(id) {
    const previousLength = this.items.length;

    this.items = this.items.filter(item => item.id !== id);

    if (this.items.length !== previousLength) {
      this.notifyListeners();
      return true;
    }

    return false;
  }

  clear() {
    this.items = [];
    this.notifyListeners();
  }

  getAll() {
    return [...this.items];
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Notification callback must be a function.");
    }

    this.listeners.add(callback);

    callback(this.getAll());

    return () => {
      this.listeners.delete(callback);
    };
  }

  notifyListeners() {
    const snapshot = this.getAll();

    for (const callback of [...this.listeners]) {
      try {
        callback(snapshot);
      } catch (error) {
        console.error(
          "[ZERO X MOTION] Notification listener failed:",
          error
        );
      }
    }
  }
}

export const notifications = new NotificationManager();

export default notifications;
