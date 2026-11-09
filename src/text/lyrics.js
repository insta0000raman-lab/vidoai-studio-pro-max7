import { textEngine } from "./text-engine.js";
import { textAnimation } from "./text-animation.js";
import { eventBus } from "../core/event-bus.js";
import { createId } from "../project/schema.js";

export class LyricsManager {
  constructor() {
    this.projects = new Map();
    this.selectedLineId = null;
  }

  create(options = {}) {
    const projectId = createId("lyrics");

    const project = {
      id: projectId,
      name: options.name || "Lyrics Project",
      trackId: options.trackId || null,
      startTime: Math.max(0, Number(options.startTime) || 0),
      defaultDuration: Math.max(
        0.1,
        Number(options.defaultDuration) || 2
      ),
      defaultStyle: structuredClone(
        options.style || {}
      ),
      lines: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.projects.set(projectId, project);
    this.emit("created", project);

    return project;
  }

  get(projectId) {
    return this.projects.get(projectId) || null;
  }

  requireProject(projectId) {
    const project = this.get(projectId);

    if (!project) {
      throw new Error("Lyrics project not found");
    }

    return project;
  }

  splitLines(text) {
    return String(text ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
  }

  importText(projectId, text, options = {}) {
    const project = this.requireProject(projectId);
    const lines = this.splitLines(text);

    const duration = Math.max(
      0.1,
      Number(options.lineDuration) ||
      project.defaultDuration
    );

    const gap = Math.max(
      0,
      Number(options.gap) || 0
    );

    let cursor = Math.max(
      project.startTime,
      Number(options.startTime) || project.startTime
    );

    const created = [];

    for (const line of lines) {
      const item = this.addLine(projectId, {
        text: line,
        startTime: cursor,
        duration,
        style: options.style || project.defaultStyle
      });

      created.push(item);
      cursor += duration + gap;
    }

    this.emit("imported", {
      projectId,
      count: created.length
    });

    return created;
  }

  addLine(projectId, options = {}) {
    const project = this.requireProject(projectId);

    const line = {
      id: createId("lyric"),
      text: String(options.text ?? ""),
      startTime: Math.max(
        0,
        Number(options.startTime) || 0
      ),
      duration: Math.max(
        0.1,
        Number(options.duration) ||
        project.defaultDuration
      ),
      style: structuredClone(
        options.style || project.defaultStyle
      ),
      entrance: options.entrance || null,
      exit: options.exit || null,
      textLayerId: null,
      order: project.lines.length
    };

    project.lines.push(line);
    this.sortLines(project);
    this.touch(project);

    this.emit("lineAdded", line);
    return line;
  }

  updateLine(projectId, lineId, changes = {}) {
    const project = this.requireProject(projectId);
    const line = this.findLine(project, lineId);

    if (!line) {
      throw new Error("Lyrics line not found");
    }

    if (changes.text !== undefined) {
      line.text = String(changes.text);
    }

    if (changes.startTime !== undefined) {
      line.startTime = Math.max(
        0,
        Number(changes.startTime) || 0
      );
    }

    if (changes.duration !== undefined) {
      line.duration = Math.max(
        0.1,
        Number(changes.duration) || 0.1
      );
    }

    if (changes.style) {
      line.style = {
        ...line.style,
        ...structuredClone(changes.style)
      };
    }

    if (changes.entrance !== undefined) {
      line.entrance = changes.entrance;
    }

    if (changes.exit !== undefined) {
      line.exit = changes.exit;
    }

    this.sortLines(project);
    this.touch(project);

    this.emit("lineUpdated", line);
    return line;
  }

  removeLine(projectId, lineId) {
    const project = this.requireProject(projectId);
    const index = project.lines.findIndex(
      line => line.id === lineId
    );

    if (index === -1) return false;

    const [removed] = project.lines.splice(index, 1);

    if (removed.textLayerId) {
      try {
        textEngine.delete(removed.textLayerId);
      } catch (error) {
        console.warn("Text layer cleanup failed:", error);
      }
    }

    if (this.selectedLineId === lineId) {
      this.selectedLineId = null;
    }

    this.sortLines(project);
    this.touch(project);

    this.emit("lineRemoved", removed);
    return true;
  }

  duplicateLine(projectId, lineId) {
    const project = this.requireProject(projectId);
    const original = this.findLine(project, lineId);

    if (!original) {
      throw new Error("Lyrics line not found");
    }

    const copy = this.addLine(projectId, {
      text: original.text,
      startTime: original.startTime + original.duration,
      duration: original.duration,
      style: original.style,
      entrance: original.entrance,
      exit: original.exit
    });

    return copy;
  }

  moveLine(projectId, lineId, startTime) {
    return this.updateLine(projectId, lineId, {
      startTime
    });
  }

  setLineDuration(projectId, lineId, duration) {
    return this.updateLine(projectId, lineId, {
      duration
    });
  }

  selectLine(projectId, lineId) {
    const project = this.requireProject(projectId);
    const line = this.findLine(project, lineId);

    if (!line) return false;

    this.selectedLineId = lineId;
    this.emit("lineSelected", line);

    return line;
  }

  getSelectedLine(projectId) {
    const project = this.get(projectId);

    if (!project || !this.selectedLineId) return null;

    return this.findLine(project, this.selectedLineId);
  }

  getLineAtTime(projectId, time) {
    const project = this.requireProject(projectId);

    return project.lines.filter(line =>
      time >= line.startTime &&
      time < line.startTime + line.duration
    );
  }

  getTimelineData(projectId) {
    const project = this.requireProject(projectId);

    return project.lines.map(line => ({
      id: line.id,
      text: line.text,
      startTime: line.startTime,
      duration: line.duration,
      endTime: line.startTime + line.duration,
      order: line.order
    }));
  }

  applyAnimation(projectId, lineId, type, preset, options = {}) {
    const project = this.requireProject(projectId);
    const line = this.findLine(project, lineId);

    if (!line) {
      throw new Error("Lyrics line not found");
    }

    const config = textAnimation.getPreset(preset);

    if (!config) {
      throw new Error("Animation preset not found");
    }

    const animation = {
      name: preset,
      duration: options.duration || config.duration,
      startTime: options.startTime || 0
    };

    if (type === "entrance") {
      line.entrance = animation;
    } else if (type === "exit") {
      line.exit = animation;
    } else {
      throw new Error("Invalid animation type");
    }

    this.touch(project);
    this.emit("animationApplied", line);

    return line;
  }

  createTextLayers(projectId, options = {}) {
    const project = this.requireProject(projectId);
    const created = [];

    for (const line of project.lines) {
      const layer = textEngine.createLayer({
        name: `Lyrics ${line.order + 1}`,
        text: line.text,
        startTime: line.startTime,
        duration: line.duration,
        style: {
          ...project.defaultStyle,
          ...line.style,
          ...(options.style || {})
        }
      });

      line.textLayerId = layer.id;

      if (line.entrance) {
        textAnimation.apply(
          layer,
          line.entrance.name,
          {
            ...line.entrance,
            type: "entrance"
          }
        );
      }

      if (line.exit) {
        textAnimation.apply(
          layer,
          line.exit.name,
          {
            ...line.exit,
            type: "exit"
          }
        );
      }

      created.push(layer);
    }

    this.touch(project);
    this.emit("layersCreated", {
      projectId,
      count: created.length
    });

    return created;
  }

  sortLines(project) {
    project.lines.sort(
      (a, b) => a.startTime - b.startTime
    );

    project.lines.forEach((line, index) => {
      line.order = index;
    });
  }

  findLine(project, lineId) {
    return project.lines.find(
      line => line.id === lineId
    ) || null;
  }

  touch(project) {
    project.updatedAt = Date.now();
  }

  exportProject(projectId) {
    const project = this.requireProject(projectId);

    return structuredClone(project);
  }

  importProject(data) {
    if (!data || !Array.isArray(data.lines)) {
      throw new Error("Invalid lyrics project");
    }

    const project = {
      ...structuredClone(data),
      id: createId("lyrics"),
      updatedAt: Date.now()
    };

    this.sortLines(project);
    this.projects.set(project.id, project);

    this.emit("imported", project);
    return project;
  }

  subscribe(callback) {
    this.listeners = this.listeners || new Set();
    this.listeners.add(callback);

    return () => this.listeners.delete(callback);
  }

  emit(type, detail) {
    const event = { type, detail };

    for (const callback of this.listeners || []) {
      try {
        callback(event);
      } catch (error) {
        console.error("Lyrics listener error:", error);
      }
    }

    eventBus.emit(`lyrics:${type}`, event);
  }
}

export const lyrics = new LyricsManager();
