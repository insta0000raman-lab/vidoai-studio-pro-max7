/* ZERO X MOTION — PROJECT SERIALIZER */

import {
  serializeProject,
  parseProject
} from "./schema.js";

import { migrateProject } from "./migrations.js";
import { validateProject } from "../core/validation.js";

const PROJECT_FILE_EXTENSION = ".zxm";
const PROJECT_MIME_TYPE = "application/json";

export function exportProject(project) {
  if (!project) {
    throw new Error("No project is currently open.");
  }

  const exportData = {
    ...project,
    schemaVersion: project.schemaVersion || 1,
    exportedAt: new Date().toISOString(),
    application: "ZERO X MOTION"
  };

  const validationProject = {
    ...exportData,
    assets: exportData.assets || [],
    markers: exportData.markers || []
  };

  validateProject(validationProject);

  const json = serializeProject(exportData);

  return new Blob([json], {
    type: PROJECT_MIME_TYPE
  });
}

export function downloadProject(project) {
  const blob = exportProject(project);
  const url = URL.createObjectURL(blob);

  const safeName = (project.name || "Untitled Project")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim()
    .slice(0, 100) || "Untitled Project";

  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `${safeName}${PROJECT_FILE_EXTENSION}`;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return true;
}

export async function importProject(file) {
  if (!(file instanceof Blob)) {
    throw new TypeError("Please select a valid project file.");
  }

  if (file.size === 0) {
    throw new Error("The selected project file is empty.");
  }

  if (file.size > 50 * 1024 * 1024) {
    throw new Error("Project file is too large to import.");
  }

  const text = await file.text();

  let parsed;

  try {
    parsed = parseProject(text);
  } catch (error) {
    throw new Error(`Could not read project: ${error.message}`);
  }

  const migrated = migrateProject(parsed);

  if (!Array.isArray(migrated.tracks)) {
    throw new Error("Project tracks are missing.");
  }

  if (!Array.isArray(migrated.assets)) {
    migrated.assets = [];
  }

  if (!Array.isArray(migrated.markers)) {
    migrated.markers = [];
  }

  validateProject(migrated);

  return migrated;
}

export function createProjectFileName(projectName) {
  const safeName = String(projectName || "Untitled Project")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim()
    .slice(0, 100) || "Untitled Project";

  return `${safeName}${PROJECT_FILE_EXTENSION}`;
}

export function isProjectFile(file) {
  if (!file) return false;

  const name = file.name?.toLowerCase() || "";

  return (
    name.endsWith(".zxm") ||
    name.endsWith(".json")
  );
}
