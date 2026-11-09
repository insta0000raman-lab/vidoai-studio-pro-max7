/* ZERO X MOTION — EVENT BUS */

const listeners = new Map();

class EventBus {
  on(eventName, callback) {
    if (typeof eventName !== "string" || typeof callback !== "function") {
      throw new TypeError("Valid event name and callback required.");
    }

    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }

    listeners.get(eventName).add(callback);

    // Unsubscribe function
    return () => this.off(eventName, callback);
  }

  once(eventName, callback) {
    const unsubscribe = this.on(eventName, (...args) => {
      unsubscribe();
      callback(...args);
    });

    return unsubscribe;
  }

  off(eventName, callback) {
    const eventListeners = listeners.get(eventName);

    if (!eventListeners) return false;

    const removed = eventListeners.delete(callback);

    if (eventListeners.size === 0) {
      listeners.delete(eventName);
    }

    return removed;
  }

  emit(eventName, payload = null) {
    const eventListeners = listeners.get(eventName);

    if (!eventListeners) return 0;

    // Copy listeners so changes during dispatch are safe.
    const callbacks = [...eventListeners];
    let successfulCalls = 0;

    for (const callback of callbacks) {
      try {
        callback(payload);
        successfulCalls++;
      } catch (error) {
        console.error(
          `[ZERO X MOTION] Event "${eventName}" listener failed:`,
          error
        );
      }
    }

    return successfulCalls;
  }

  clear(eventName) {
    if (eventName) {
      listeners.delete(eventName);
      return;
    }

    listeners.clear();
  }

  listenerCount(eventName) {
    return listeners.get(eventName)?.size || 0;
  }

  eventNames() {
    return [...listeners.keys()];
  }
}

export const eventBus = new EventBus();

export default eventBus;
