export class PreviewGestures {
  constructor(options = {}) {
    this.element =
      options.element || document.querySelector("#previewFrame");

    this.onTransform =
      options.onTransform || (() => {});

    this.scale = 1;
    this.x = 0;
    this.y = 0;

    this.minScale = 0.25;
    this.maxScale = 5;

    this.pointers = new Map();
    this.startDistance = 0;
    this.startScale = 1;
    this.startX = 0;
    this.startY = 0;
    this.startPointerX = 0;
    this.startPointerY = 0;
    this.lastTap = 0;

    this.bind();
  }

  bind() {
    if (!this.element) return;

    this.element.style.touchAction = "none";

    this.pointerDownHandler = event =>
      this.pointerDown(event);

    this.pointerMoveHandler = event =>
      this.pointerMove(event);

    this.pointerUpHandler = event =>
      this.pointerUp(event);

    this.element.addEventListener(
      "pointerdown",
      this.pointerDownHandler
    );

    this.element.addEventListener(
      "pointermove",
      this.pointerMoveHandler
    );

    this.element.addEventListener(
      "pointerup",
      this.pointerUpHandler
    );

    this.element.addEventListener(
      "pointercancel",
      this.pointerUpHandler
    );

    this.element.addEventListener(
      "lostpointercapture",
      this.pointerUpHandler
    );

    this.element.addEventListener(
      "dblclick",
      () => this.reset()
    );
  }

  pointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    this.element.setPointerCapture?.(event.pointerId);

    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (this.pointers.size === 1) {
      this.startPointerX = event.clientX;
      this.startPointerY = event.clientY;

      this.startX = this.x;
      this.startY = this.y;
    }

    if (this.pointers.size === 2) {
      this.startDistance = this.getPointerDistance();
      this.startScale = this.scale;
    }

    const now = Date.now();

    if (now - this.lastTap < 280) {
      this.reset();
    }

    this.lastTap = now;
  }

  pointerMove(event) {
    if (!this.pointers.has(event.pointerId)) return;

    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (this.pointers.size === 1) {
      const dx = event.clientX - this.startPointerX;
      const dy = event.clientY - this.startPointerY;

      this.x = this.startX + dx;
      this.y = this.startY + dy;

      this.emit();
    }

    if (this.pointers.size === 2) {
      const distance = this.getPointerDistance();

      if (!this.startDistance) return;

      const ratio = distance / this.startDistance;

      this.scale = this.clamp(
        this.startScale * ratio,
        this.minScale,
        this.maxScale
      );

      this.emit();
    }
  }

  pointerUp(event) {
    this.pointers.delete(event.pointerId);

    if (this.pointers.size === 1) {
      const remaining = [...this.pointers.values()][0];

      this.startPointerX = remaining.x;
      this.startPointerY = remaining.y;

      this.startX = this.x;
      this.startY = this.y;
    }

    if (this.pointers.size === 0) {
      this.startDistance = 0;
    }
  }

  getPointerDistance() {
    const points = [...this.pointers.values()];

    if (points.length < 2) return 0;

    const dx = points[0].x - points[1].x;
    const dy = points[0].y - points[1].y;

    return Math.sqrt(dx * dx + dy * dy);
  }

  setTransform(transform = {}) {
    if (Number.isFinite(transform.scale)) {
      this.scale = this.clamp(
        transform.scale,
        this.minScale,
        this.maxScale
      );
    }

    if (Number.isFinite(transform.x)) {
      this.x = transform.x;
    }

    if (Number.isFinite(transform.y)) {
      this.y = transform.y;
    }

    this.emit();
  }

  reset() {
    this.scale = 1;
    this.x = 0;
    this.y = 0;

    this.emit();
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  emit() {
    const transform = {
      scale: this.scale,
      x: this.x,
      y: this.y
    };

    this.onTransform(transform);

    this.element?.dispatchEvent(
      new CustomEvent("zerox:preview-transform", {
        detail: transform
      })
    );
  }

  destroy() {
    if (!this.element) return;

    this.element.removeEventListener(
      "pointerdown",
      this.pointerDownHandler
    );

    this.element.removeEventListener(
      "pointermove",
      this.pointerMoveHandler
    );

    this.element.removeEventListener(
      "pointerup",
      this.pointerUpHandler
    );

    this.element.removeEventListener(
      "pointercancel",
      this.pointerUpHandler
    );

    this.element.removeEventListener(
      "lostpointercapture",
      this.pointerUpHandler
    );

    this.pointers.clear();
  }
}

export default PreviewGestures;
