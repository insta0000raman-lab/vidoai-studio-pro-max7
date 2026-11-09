/* ZERO X MOTION — COMMAND SYSTEM */

import { history } from "./history.js";
import { eventBus } from "./event-bus.js";

class EditorCommand {
  constructor({
    id,
    label,
    execute,
    undo,
    validate = null
  }) {
    if (typeof execute !== "function") {
      throw new TypeError("Command execute() is required.");
    }

    if (typeof undo !== "function") {
      throw new TypeError("Command undo() is required.");
    }

    this.id = id || crypto.randomUUID();
    this.label = label || "Edit";
    this.executeAction = execute;
    this.undoAction = undo;
    this.validateAction = validate;
    this.createdAt = Date.now();
  }

  validate() {
    if (!this.validateAction) return true;

    return this.validateAction() !== false;
  }

  execute() {
    if (!this.validate()) {
      throw new Error(`Command validation failed: ${this.label}`);
    }

    return this.executeAction();
  }

  undo() {
    return this.undoAction();
  }
}

class CommandSystem {
  constructor() {
    this.commands = new Map();
    this.running = false;
    this.lastCommand = null;
  }

  register(name, handler) {
    if (!name || typeof handler !== "function") {
      throw new TypeError("Command name and handler are required.");
    }

    this.commands.set(name, handler);

    return () => this.unregister(name);
  }

  unregister(name) {
    return this.commands.delete(name);
  }

  has(name) {
    return this.commands.has(name);
  }

  execute(command) {
    if (this.running) {
      throw new Error("Another editor command is running.");
    }

    if (!(command instanceof EditorCommand)) {
      throw new TypeError("Expected an EditorCommand instance.");
    }

    this.running = true;

    try {
      const result = command.execute();

      history.execute({
        label: command.label,
        undo: () => command.undo(),
        redo: () => command.execute()
      });

      this.lastCommand = command;

      eventBus.emit("command:executed", {
        id: command.id,
        label: command.label,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      eventBus.emit("command:failed", {
        label: command.label,
        message: error.message
      });

      throw error;
    } finally {
      this.running = false;
    }
  }

  run(name, payload = {}) {
    const handler = this.commands.get(name);

    if (!handler) {
      throw new Error(`Unknown editor command: ${name}`);
    }

    const command = handler(payload);

    return this.execute(command);
  }

  undo() {
    return history.undo();
  }

  redo() {
    return history.redo();
  }

  clear() {
    this.commands.clear();
    this.lastCommand = null;
  }

  getStatus() {
    return {
      registeredCommands: [...this.commands.keys()],
      running: this.running,
      lastCommand: this.lastCommand?.label || null
    };
  }
}

export { EditorCommand };

export const commandSystem = new CommandSystem();

export default commandSystem;
