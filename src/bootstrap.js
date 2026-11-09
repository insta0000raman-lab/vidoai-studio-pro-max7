import { app } from "./app.js";
import { eventBus } from "./core/event-bus.js";
import { notifications } from "./core/notifications.js";

const BOOT_STATE = {
  started: false,
  ready: false,
  failed: false,
  error: null
};

function updateBootScreen(status, message) {
  const statusElement = document.querySelector(
    "#engineStatus"
  );

  if (statusElement) {
    statusElement.textContent = message;
  }

  document.documentElement.dataset.appStatus = status;
}

function showStartupError(error) {
  BOOT_STATE.failed = true;
  BOOT_STATE.error = error;

  updateBootScreen(
    "error",
    "Editor startup failed"
  );

  let screen = document.querySelector(
    "#startupError"
  );

  if (!screen) {
    screen = document.createElement("div");
    screen.id = "startupError";
    screen.className = "startup-error";

    document.body.appendChild(screen);
  }

  screen.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = "ZERO X MOTION couldn't start";

  const description = document.createElement("p");
  description.textContent =
    error?.message || "An unexpected error occurred.";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry";

  retry.addEventListener("click", () => {
    location.reload();
  });

  screen.append(heading, description, retry);

  console.error("ZERO X MOTION startup error:", error);
}

async function startApplication() {
  if (BOOT_STATE.started) return;

  BOOT_STATE.started = true;
  updateBootScreen("loading", "Loading editor...");

  try {
    await app.init();

    BOOT_STATE.ready = true;
    BOOT_STATE.failed = false;

    updateBootScreen("ready", "Editor ready");

    eventBus.emit("BOOTSTRAP_COMPLETED", {
      timestamp: Date.now()
    });

  } catch (error) {
    showStartupError(error);
  }
}

function registerGlobalErrors() {
  window.addEventListener("error", event => {
    console.error(
      "Runtime error:",
      event.error || event.message
    );

    eventBus.emit("RUNTIME_ERROR", {
      message: event.message || "Unknown runtime error"
    });
  });

  window.addEventListener(
    "unhandledrejection",
    event => {
      console.error(
        "Unhandled promise rejection:",
        event.reason
      );

      eventBus.emit("PROMISE_ERROR", {
        reason: String(event.reason)
      });
    }
  );
}

function registerBrowserLifecycle() {
  document.addEventListener("visibilitychange", () => {
    eventBus.emit("APP_VISIBILITY_CHANGED", {
      visible: !document.hidden
    });
  });

  window.addEventListener("beforeunload", () => {
    eventBus.emit("APP_BEFORE_UNLOAD", {
      timestamp: Date.now()
    });
  });
}

function checkBrowserSupport() {
  const checks = {
    modules: "noModule" in HTMLScriptElement.prototype,
    indexedDB: "indexedDB" in window,
    canvas: Boolean(document.createElement("canvas").getContext("2d")),
    video: Boolean(document.createElement("video").canPlayType)
  };

  const unsupported = Object.entries(checks)
    .filter(([, supported]) => !supported)
    .map(([name]) => name);

  return {
    supported: unsupported.length === 0,
    checks,
    unsupported
  };
}

async function bootstrap() {
  registerGlobalErrors();
  registerBrowserLifecycle();

  const support = checkBrowserSupport();

  if (!support.checks.canvas || !support.checks.video) {
    showStartupError(
      new Error("Your browser does not support the required editor features.")
    );
    return;
  }

  if (!support.checks.indexedDB) {
    console.warn("IndexedDB unavailable. Persistent storage may not work.");
  }

  await startApplication();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    bootstrap,
    { once: true }
  );
} else {
  bootstrap();
}

export {
  BOOT_STATE,
  startApplication,
  checkBrowserSupport
};
