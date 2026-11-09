import { eventBus } from "../core/event-bus.js";
import { objectTracker } from "../ai/tracking.js";
import { autoFrameEngine } from "../ai/autoframe.js";

export const RENDER_NODE_TYPES = Object.freeze({
  VIDEO: "video",
  IMAGE: "image",
  TEXT: "text",
  AUDIO: "audio",
  EFFECT: "effect",
  GROUP: "group",
  TRANSITION: "transition"
});

export class RenderGraphError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RenderGraphError";
    this.details = details;
  }
}

function clone(value) {
  return structuredClone(value);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getClipType(clip) {
  if (clip.type === "video") return RENDER_NODE_TYPES.VIDEO;
  if (clip.type === "image") return RENDER_NODE_TYPES.IMAGE;
  if (clip.type === "text") return RENDER_NODE_TYPES.TEXT;
  if (clip.type === "audio") return RENDER_NODE_TYPES.AUDIO;

  return clip.type || "unknown";
}

function isActive(clip, time) {
  const start = finite(clip.start, 0);
  const end = finite(
    clip.end,
    start + finite(clip.duration, 0)
  );

  return time >= start && time < end;
}

function normalizeTransform(transform = {}) {
  return {
    x: finite(transform.x),
    y: finite(transform.y),
    scale: finite(transform.scale, 1),
    scaleX: finite(transform.scaleX, 1),
    scaleY: finite(transform.scaleY, 1),
    rotation: finite(transform.rotation),
    opacity: Math.max(
      0,
      Math.min(1, finite(transform.opacity, 1))
    ),
    anchorX: finite(transform.anchorX, 0.5),
    anchorY: finite(transform.anchorY, 0.5)
  };
}

export class RenderGraph {
  constructor(options = {}) {
    this.version = 1;
    this.options = {
      includeDisabledEffects: false,
      includeHiddenTracks: false,
      includeLockedTracks: true,
      ...options
    };

    this.lastGraph = null;
    this.listeners = new Set();
  }

  validateProject(project) {
    if (!project || typeof project !== "object") {
      throw new RenderGraphError("Project is missing.");
    }

    if (!Array.isArray(project.tracks)) {
      throw new RenderGraphError(
        "Project tracks must be an array."
      );
    }

    return true;
  }

  getTrackVisibility(track) {
    if (
      track.hidden &&
      !this.options.includeHiddenTracks
    ) {
      return false;
    }

    return true;
  }

  normalizeEffect(effect) {
    return {
      id: effect.id,
      type: effect.type,
      enabled: effect.enabled !== false,
      parameters: clone(effect.parameters || {}),
      blendMode: effect.blendMode || "normal"
    };
  }

  normalizeClip(clip, track, time) {
    const type = getClipType(clip);

    const start = finite(clip.start, 0);
    const duration = Math.max(
      0,
      finite(clip.duration)
    );

    const end = finite(clip.end, start + duration);

    const localTime = Math.max(0, time - start);

    const effects = Array.isArray(clip.effects)
      ? clip.effects
          .filter(effect =>
            this.options.includeDisabledEffects ||
            effect.enabled !== false
          )
          .map(effect => this.normalizeEffect(effect))
      : [];

    return {
      id: clip.id,
      type,
      trackId: track.id,

      timing: {
        start,
        end,
        duration: Math.max(0, end - start),
        localTime,
        sourceStart: finite(clip.sourceStart),
        sourceEnd: finite(clip.sourceEnd),
        speed: finite(clip.speed, 1)
      },

      source: {
        assetId: clip.assetId || null,
        mediaId: clip.mediaId || null,
        url: clip.url || null,
        text: clip.text || null
      },

      transform: normalizeTransform(clip.transform),

      style: clone(clip.style || {}),
      effects,

      animation: clone(clip.animation || {}),
      keyframes: clone(clip.keyframes || []),

      audio: {
        volume: finite(clip.volume, 1),
        muted: Boolean(clip.muted),
        fadeIn: finite(clip.fadeIn),
        fadeOut: finite(clip.fadeOut)
      },

      blendMode: clip.blendMode || "normal",
      opacity: finite(clip.opacity, 1),

      active: isActive(clip, time),
      zIndex: finite(clip.zIndex, 0),

      metadata: clone(clip.metadata || {})
    };
  }

  build(project, options = {}) {
    this.validateProject(project);

    const time = Math.max(
      0,
      finite(options.time)
    );

    const tracks = [];
    const nodes = [];

    for (let trackIndex = 0;
      trackIndex < project.tracks.length;
      trackIndex += 1) {

      const track = project.tracks[trackIndex];

      if (!this.getTrackVisibility(track)) {
        continue;
      }

      const trackNode = {
        id: track.id,
        type: track.type || "unknown",
        index: trackIndex,
        name: track.name || "Track",
        muted: Boolean(track.muted),
        solo: Boolean(track.solo),
        locked: Boolean(track.locked),
        opacity: finite(track.opacity, 1),
        clips: []
      };

      const clips = Array.isArray(track.clips)
        ? track.clips
        : [];

      for (const clip of clips) {
        const node = this.normalizeClip(
          clip,
          track,
          time
        );

        trackNode.clips.push(node);
        nodes.push(node);
      }

      tracks.push(trackNode);
    }

    const soloTracks = tracks.filter(track => track.solo);

    const audioNodes = nodes
      .filter(node => node.type === "audio")
      .map(node => ({
        ...node,
        muted:
          node.audio.muted ||
          tracks.find(track => track.id === node.trackId)?.muted ||
          (
            soloTracks.length > 0 &&
            !tracks.find(track => track.id === node.trackId)?.solo
          )
      }));

    const visualNodes = nodes
      .filter(node =>
        [
          RENDER_NODE_TYPES.VIDEO,
          RENDER_NODE_TYPES.IMAGE,
          RENDER_NODE_TYPES.TEXT
        ].includes(node.type)
      )
      .sort((a, b) => {
        const trackA = tracks.findIndex(
          track => track.id === a.trackId
        );

        const trackB = tracks.findIndex(
          track => track.id === b.trackId
        );

        return trackA - trackB || a.zIndex - b.zIndex;
      });

    const graph = {
      version: this.version,
      projectId: project.id || null,
      generatedAt: Date.now(),
      time,

      canvas: {
        width: finite(project.width, 1080),
        height: finite(project.height, 1920),
        fps: finite(project.fps, 30),
        duration: finite(project.duration)
      },

      background: project.background || "#000000",

      tracks,
      nodes,

      layers: visualNodes,
      audio: audioNodes,

      markers: clone(project.markers || []),

      settings: clone(project.settings || {}),

      diagnostics: {
        unsupportedNodes: nodes
          .filter(node => node.type === "unknown")
          .map(node => node.id),

        missingAssets: nodes
          .filter(node =>
            node.type !== "text" &&
            !node.source.assetId &&
            !node.source.url
          )
          .map(node => node.id)
      }
    };

    this.lastGraph = graph;
    this.emit(graph);

    return clone(graph);
  }

  buildRange(project, start, end, step = null) {
    const fps = Math.max(
      1,
      finite(project.fps, 30)
    );

    const interval = step || 1 / fps;

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      interval <= 0
    ) {
      throw new RenderGraphError(
        "Invalid render range."
      );
    }

    const frames = [];

    for (
      let time = start;
      time <= end + 0.000001;
      time += interval
    ) {
      frames.push(
        this.build(project, { time })
      );
    }

    return frames;
  }

  getNode(graph, nodeId) {
    return graph.nodes.find(node => node.id === nodeId) || null;
  }

  getActiveNodes(graph, type = null) {
    return graph.nodes.filter(node =>
      node.active &&
      (!type || node.type === type)
    );
  }

  applyAutoFrame(input) {
    const {
      trackId,
      timestamp,
      sourceWidth,
      sourceHeight,
      ratio
    } = input;

    const track = objectTracker.getTrack(trackId);

    if (!track) {
      throw new RenderGraphError(
        "AutoFrame tracking data unavailable."
      );
    }

    return autoFrameEngine.calculateFromTrack({
      trackId,
      timestamp,
      sourceWidth,
      sourceHeight,
      ratio
    });
  }

  subscribe(callback) {
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(graph) {
    for (const callback of this.listeners) {
      callback(clone(graph));
    }

    eventBus.emit("render-graph:built", {
      projectId: graph.projectId,
      time: graph.time,
      nodeCount: graph.nodes.length
    });
  }

  destroy() {
    this.lastGraph = null;
    this.listeners.clear();
  }
}

export const renderGraph = new RenderGraph();
