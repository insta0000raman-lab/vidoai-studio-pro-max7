/* ZERO X MOTION — PROJECT MIGRATIONS */

import { PROJECT_SCHEMA_VERSION } from "./schema.js";

const migrations = new Map();

function cloneProject(project) {
  if (typeof structuredClone === "function") {
    return structuredClone(project);
  }

  return JSON.parse(JSON.stringify(project));
}

function registerMigration(fromVersion, migrate) {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new Error("Invalid migration version.");
  }

  if (typeof migrate !== "function") {
    throw new TypeError("Migration must be a function.");
  }

  migrations.set(fromVersion, migrate);
}

/*
 * Migration 1 → 2
 * Reserved for the next project schema update.
 */
registerMigration(1, project => {
  const updated = cloneProject(project);

  updated.schemaVersion = 2;

  if (!updated.metadata) {
    updated.metadata = {};
  }

  if (!Array.isArray(updated.assets)) {
    updated.assets = [];
  }

  if (!Array.isArray(updated.markers)) {
    updated.markers = [];
  }

  return updated;
});

export function getProjectVersion(project) {
  const version =
    project?.schemaVersion ??
    project?.formatVersion ??
    1;

  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Project has an invalid schema version.");
  }

  return version;
}

export function migrateProject(project) {
  if (!project || typeof project !== "object") {
    throw new Error("Cannot migrate an invalid project.");
  }

  let current = cloneProject(project);
  let version = getProjectVersion(current);

  if (version > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `This project uses schema version ${version}. ` +
      `Your editor supports version ${PROJECT_SCHEMA_VERSION}.`
    );
  }

  while (version < PROJECT_SCHEMA_VERSION) {
    const migration = migrations.get(version);

    if (!migration) {
      throw new Error(
        `Missing migration from project version ${version}.`
      );
    }

    current = migration(current);

    if (!current || typeof current !== "object") {
      throw new Error(
        `Migration from version ${version} returned invalid data.`
      );
    }

    version = getProjectVersion(current);

    if (version <= getProjectVersion(project)) {
      throw new Error("Migration did not advance the project version.");
    }
  }

  current.schemaVersion = PROJECT_SCHEMA_VERSION;

  return current;
}

export function canMigrateProject(project) {
  try {
    const version = getProjectVersion(project);

    return {
      supported: version <= PROJECT_SCHEMA_VERSION,
      currentVersion: version,
      targetVersion: PROJECT_SCHEMA_VERSION
    };
  } catch (error) {
    return {
      supported: false,
      error: error.message
    };
  }
}

export function getAvailableMigrations() {
  return [...migrations.keys()].sort((a, b) => a - b);
      }
