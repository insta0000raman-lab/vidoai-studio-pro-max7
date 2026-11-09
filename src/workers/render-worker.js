const jobs = new Map();

let workerCanvas = null;
let workerContext = null;

function send(type, jobId, data = {}) {
  self.postMessage({
    type,
    jobId,
    ...data
  });
}

function getCanvas(width, height) {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("OffscreenCanvas is not supported.");
  }

  if (
    !workerCanvas ||
    workerCanvas.width !== width ||
    workerCanvas.height !== height
  ) {
    workerCanvas = new OffscreenCanvas(width, height);
    workerContext = workerCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true
    });
  }

  return workerCanvas;
}

function checkCancelled(jobId) {
  const job = jobs.get(jobId);

  if (!job || job.cancelled) {
    throw new Error("Render job cancelled.");
  }
}

function normalizeLayer(layer) {
  return {
    x: Number(layer.x || 0),
    y: Number(layer.y || 0),
    width: Number(layer.width || 0),
    height: Number(layer.height || 0),
    opacity: Math.max(
      0,
      Math.min(1, Number(layer.opacity ?? 1))
    ),
    rotation: Number(layer.rotation || 0),
    scaleX: Number(layer.scaleX ?? 1),
    scaleY: Number(layer.scaleY ?? 1),
    visible: layer.visible !== false,
    blendMode: layer.blendMode || "source-over"
  };
}

function drawImageLayer(context, layer, bitmap) {
  if (!bitmap || layer.visible === false) return;

  const transform = normalizeLayer(layer);

  context.save();

  context.globalAlpha = transform.opacity;
  context.globalCompositeOperation =
    transform.blendMode;

  context.translate(
    transform.x + transform.width / 2,
    transform.y + transform.height / 2
  );

  context.rotate(
    transform.rotation * Math.PI / 180
  );

  context.scale(
    transform.scaleX,
    transform.scaleY
  );

  context.drawImage(
    bitmap,
    -transform.width / 2,
    -transform.height / 2,
    transform.width,
    transform.height
  );

  context.restore();
}

function drawTextLayer(context, layer) {
  if (layer.visible === false) return;

  const style = layer.style || {};
  const transform = normalizeLayer(layer);

  context.save();

  context.globalAlpha = transform.opacity;
  context.translate(transform.x, transform.y);
  context.rotate(transform.rotation * Math.PI / 180);

  context.font = [
    style.fontWeight || "normal",
    `${style.fontSize || 48}px`,
    style.fontFamily || "Arial"
  ].join(" ");

  context.fillStyle = style.color || "#ffffff";
  context.textAlign = style.align || "center";
  context.textBaseline = "middle";

  if (style.shadow) {
    context.shadowColor = style.shadow.color || "#000000";
    context.shadowBlur = style.shadow.blur || 0;
    context.shadowOffsetX = style.shadow.x || 0;
    context.shadowOffsetY = style.shadow.y || 0;
  }

  if (style.strokeWidth > 0) {
    context.lineWidth = style.strokeWidth;
    context.strokeStyle = style.strokeColor || "#000000";
    context.strokeText(
      layer.text || "",
      0,
      0,
      transform.width || undefined
    );
  }

  context.fillText(
    layer.text || "",
    0,
    0,
    transform.width || undefined
  );

  context.restore();
}

function renderFrame(message) {
  const {
    jobId,
    width,
    height,
    layers = [],
    assets = {}
  } = message;

  checkCancelled(jobId);

  const canvas = getCanvas(width, height);
  const context = workerContext;

  context.clearRect(0, 0, width, height);

  context.fillStyle = message.background || "#000000";
  context.fillRect(0, 0, width, height);

  for (const layer of layers) {
    checkCancelled(jobId);

    if (layer.visible === false) continue;

    if (layer.type === "text") {
      drawTextLayer(context, layer);
      continue;
    }

    const assetId = layer.assetId;
    const bitmap = assets[assetId];

    if (bitmap) {
      drawImageLayer(context, layer, bitmap);
    }
  }

  return canvas.transferToImageBitmap();
}

async function runRenderJob(message) {
  const {
    jobId,
    frames = [],
    width,
    height
  } = message;

  const job = {
    cancelled: false
  };

  jobs.set(jobId, job);

  try {
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error("Invalid render dimensions.");
    }

    if (!Array.isArray(frames) || frames.length === 0) {
      throw new Error("No frames supplied for rendering.");
    }

    const rendered = [];

    for (let index = 0; index < frames.length; index++) {
      checkCancelled(jobId);

      const frame = frames[index];

      const bitmap = renderFrame({
        ...frame,
        jobId,
        width,
        height
      });

      rendered.push(bitmap);

      send("progress", jobId, {
        completed: index + 1,
        total: frames.length,
        progress: (index + 1) / frames.length
      });

      if (index % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    checkCancelled(jobId);

    send("complete", jobId, {
      frames: rendered
    });

  } catch (error) {
    send("error", jobId, {
      message: error.message
    });

  } finally {
    jobs.delete(jobId);
  }
}

self.addEventListener("message", event => {
  const message = event.data || {};

  if (message.type === "render") {
    runRenderJob(message);
    return;
  }

  if (message.type === "cancel") {
    const job = jobs.get(message.jobId);

    if (job) {
      job.cancelled = true;
    }

    return;
  }

  if (message.type === "ping") {
    send("pong", message.jobId);
  }
});
