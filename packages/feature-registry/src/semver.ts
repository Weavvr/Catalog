/**
 * Lightweight semantic versioning utilities.
 * Handles parsing, comparison, and range matching for feature versions.
 */

import type { SemVer, VersionRange } from './types.js';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/** Parse a semver string into components */
export function parseVersion(version: SemVer): ParsedVersion {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/** Format a parsed version back to string */
export function formatVersion(parsed: ParsedVersion): SemVer {
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  return parsed.prerelease ? `${base}-${parsed.prerelease}` : base;
}

/** Compare two versions: -1 (a < b), 0 (a == b), 1 (a > b) */
export function compareVersions(a: SemVer, b: SemVer): -1 | 0 | 1 {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;

  // Prerelease versions have lower precedence
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && vb.prerelease) {
    return va.prerelease < vb.prerelease ? -1 : va.prerelease > vb.prerelease ? 1 : 0;
  }

  return 0;
}

/** Check if a version satisfies a range expression */
export function satisfiesRange(version: SemVer, range: VersionRange): boolean {
  const parsed = parseVersion(version);

  // Exact match
  if (/^\d+\.\d+\.\d+/.test(range) && !range.startsWith('^') && !range.startsWith('~') && !range.startsWith('>') && !range.startsWith('<')) {
    return compareVersions(version, range) === 0;
  }

  // Caret range: ^1.2.3 allows >=1.2.3 <2.0.0
  const caretMatch = range.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
  if (caretMatch) {
    const min = { major: parseInt(caretMatch[1], 10), minor: parseInt(caretMatch[2], 10), patch: parseInt(caretMatch[3], 10) };
    if (parsed.major !== min.major) return false;
    if (parsed.minor < min.minor) return false;
    if (parsed.minor === min.minor && parsed.patch < min.patch) return false;
    return true;
  }

  // Tilde range: ~1.2.3 allows >=1.2.3 <1.3.0
  const tildeMatch = range.match(/^~(\d+)\.(\d+)\.(\d+)$/);
  if (tildeMatch) {
    const min = { major: parseInt(tildeMatch[1], 10), minor: parseInt(tildeMatch[2], 10), patch: parseInt(tildeMatch[3], 10) };
    if (parsed.major !== min.major || parsed.minor !== min.minor) return false;
    return parsed.patch >= min.patch;
  }

  // Compound range: >=1.0.0 <2.0.0
  const compoundMatch = range.match(/^>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)$/);
  if (compoundMatch) {
    return compareVersions(version, compoundMatch[1]) >= 0 && compareVersions(version, compoundMatch[2]) < 0;
  }

  // Simple comparisons
  const simpleMatch = range.match(/^(>=?|<=?|=)(\d+\.\d+\.\d+)$/);
  if (simpleMatch) {
    const cmp = compareVersions(version, simpleMatch[2]);
    switch (simpleMatch[1]) {
      case '>=': return cmp >= 0;
      case '>': return cmp > 0;
      case '<=': return cmp <= 0;
      case '<': return cmp < 0;
      case '=': return cmp === 0;
    }
  }

  // Wildcard
  if (range === '*') return true;

  throw new Error(`Unsupported version range: ${range}`);
}

/** Determine the bump type between two versions */
export function getBumpType(from: SemVer, to: SemVer): 'major' | 'minor' | 'patch' | 'none' {
  const f = parseVersion(from);
  const t = parseVersion(to);

  if (t.major > f.major) return 'major';
  if (t.minor > f.minor) return 'minor';
  if (t.patch > f.patch) return 'patch';
  return 'none';
}

/** Calculate the next version given a bump type */
export function bumpVersion(current: SemVer, type: 'major' | 'minor' | 'patch'): SemVer {
  const parsed = parseVersion(current);
  switch (type) {
    case 'major':
      return formatVersion({ major: parsed.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatVersion({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
    case 'patch':
      return formatVersion({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
  }
}

/** Get the latest version from an array of versions */
export function latestVersion(versions: SemVer[]): SemVer | null {
  if (versions.length === 0) return null;
  return versions.sort(compareVersions).at(-1) ?? null;
}
