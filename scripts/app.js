
/* =========================================
   VPEET STUDIO
   APP CONTROLLER
   ========================================= */

(() => {
  "use strict";

  const CONFIG = window.VPEET_CONFIG;

  if (!CONFIG) {
    console.error("VPEET CONFIG not found. Check config.js");
    return;
  }

  const state = {
    currentStep: 0,
    totalSteps: CONFIG.totalSteps || 16
  };

  const elements = {
    steps: document.querySelectorAll(".wizard-step"),
    previous: document.getElementById("previousStepButton"),
    next: document.getElementById("nextStepButton"),
    counter: document.getElementById("stepCounter"),
    progress: document.querySelector(".wizard-progress-fill"),
    helpButton: document.getElementById("helpButton"),
    helpDialog: document.getElementById("helpDialog"),
    closeHelp: document.getElementById("closeHelpButton")
  };

  /* -----------------------------------------
     SHOW CURRENT STEP
     ----------------------------------------- */

  function showStep(stepNumber) {
    const lastStep = state.totalSteps - 1;

    state.currentStep = Math.max(
      0,
      Math.min(stepNumber, lastStep)
    );

    elements.steps.forEach((step, index) => {
      const isActive = index === state.currentStep;

      step.classList.toggle("active", isActive);

      step.setAttribute(
        "aria-hidden",
        String(!isActive)
      );
    });

    updateNavigation();
    updateProgress();
    updateStepCounter();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    document.dispatchEvent(
      new CustomEvent("vpeet:stepchange", {
        detail: {
          currentStep: state.currentStep,
          stepInfo: CONFIG.steps[state.currentStep]
        }
      })
    );
  }

  /* -----------------------------------------
     UPDATE NAVIGATION BUTTONS
     ----------------------------------------- */

  function updateNavigation() {
    if (elements.previous) {
      elements.previous.disabled =
        state.currentStep === 0;
    }

    if (elements.next) {
      elements.next.disabled =
        state.currentStep === state.totalSteps - 1;

      elements.next.textContent =
        state.currentStep === state.totalSteps - 1
          ? "Finish"
          : "Next";
    }
  }

  /* -----------------------------------------
     UPDATE PROGRESS BAR
     ----------------------------------------- */

  function updateProgress() {
    if (!elements.progress) return;

    const progress =
      ((state.currentStep + 1) / state.totalSteps) * 100;

    elements.progress.style.width = progress + "%";
  }

  /* -----------------------------------------
     UPDATE STEP COUNTER
     ----------------------------------------- */

  function updateStepCounter() {
    if (!elements.counter) return;

    const current = String(
      state.currentStep + 1
    ).padStart(2, "0");

    const total = String(
      state.totalSteps
    ).padStart(2, "0");

    elements.counter.textContent =
      current + " / " + total;
  }

  /* -----------------------------------------
     NEXT BUTTON
     ----------------------------------------- */

  function nextStep() {
    if (state.currentStep >= state.totalSteps - 1) {
      return;
    }

    showStep(state.currentStep + 1);
  }

  /* -----------------------------------------
     PREVIOUS BUTTON
     ----------------------------------------- */

  function previousStep() {
    if (state.currentStep <= 0) {
      return;
    }

    showStep(state.currentStep - 1);
  }

  /* -----------------------------------------
     HELP DIALOG
     ----------------------------------------- */

  function openHelp() {
    if (!elements.helpDialog) return;

    if (typeof elements.helpDialog.showModal === "function") {
      elements.helpDialog.showModal();
    } else {
      elements.helpDialog.setAttribute("open", "");
    }
  }

  function closeHelp() {
    if (!elements.helpDialog) return;

    if (typeof elements.helpDialog.close === "function") {
      elements.helpDialog.close();
    } else {
      elements.helpDialog.removeAttribute("open");
    }
  }

  /* -----------------------------------------
     BUTTON EVENTS
     ----------------------------------------- */

  if (elements.next) {
    elements.next.addEventListener(
      "click",
      nextStep
    );
  }

  if (elements.previous) {
    elements.previous.addEventListener(
      "click",
      previousStep
    );
  }

  if (elements.helpButton) {
    elements.helpButton.addEventListener(
      "click",
      openHelp
    );
  }

  if (elements.closeHelp) {
    elements.closeHelp.addEventListener(
      "click",
      closeHelp
    );
  }

  /* -----------------------------------------
     KEYBOARD NAVIGATION
     ----------------------------------------- */

  document.addEventListener("keydown", (event) => {
    if (
      event.target.matches("input, textarea, select")
    ) {
      return;
    }

    if (
      elements.helpDialog &&
      elements.helpDialog.open
    ) {
      return;
    }

    if (event.key === "ArrowRight") {
      nextStep();
    }

    if (event.key === "ArrowLeft") {
      previousStep();
    }
  });

  /* -----------------------------------------
     PUBLIC APP CONTROLS
     Other JS files can use these methods.
     ----------------------------------------- */

  window.VPEET_APP = {
    next: nextStep,
    previous: previousStep,

    goToStep: (stepNumber) => {
      if (
        Number.isInteger(stepNumber) &&
        stepNumber >= 0 &&
        stepNumber < state.totalSteps
      ) {
        showStep(stepNumber);
      }
    },

    getCurrentStep: () => state.currentStep,

    getTotalSteps: () => state.totalSteps
  };

  /* -----------------------------------------
     INITIALIZE APP
     ----------------------------------------- */

  if (elements.steps.length !== state.totalSteps) {
    console.warn(
      "Expected " + state.totalSteps +
      " wizard steps, but found " +
      elements.steps.length
    );
  }

  showStep(0);

  console.log("VPEET Studio app controller loaded.");

})();
                           
