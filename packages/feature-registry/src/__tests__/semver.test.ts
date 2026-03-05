import { describe, it, expect } from 'vitest';
import {
  parseVersion,
  formatVersion,
  compareVersions,
  satisfiesRange,
  getBumpType,
  bumpVersion,
  latestVersion,
} from '../semver.js';

describe('parseVersion', () => {
  it('parses a basic semver string', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('parses a prerelease version', () => {
    expect(parseVersion('1.0.0-beta.1')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: 'beta.1',
    });
  });

  it('throws on invalid input', () => {
    expect(() => parseVersion('not-a-version')).toThrow('Invalid semver');
  });
});

describe('formatVersion', () => {
  it('formats a version without prerelease', () => {
    expect(formatVersion({ major: 2, minor: 1, patch: 0 })).toBe('2.1.0');
  });

  it('formats a version with prerelease', () => {
    expect(formatVersion({ major: 1, minor: 0, patch: 0, prerelease: 'rc.1' })).toBe(
      '1.0.0-rc.1',
    );
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('compares major versions', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
  });

  it('compares minor versions', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
  });

  it('compares patch versions', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBe(1);
  });

  it('prerelease has lower precedence', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0')).toBe(-1);
  });
});

describe('satisfiesRange', () => {
  it('matches exact version', () => {
    expect(satisfiesRange('1.0.0', '1.0.0')).toBe(true);
    expect(satisfiesRange('1.0.1', '1.0.0')).toBe(false);
  });

  it('matches caret range', () => {
    expect(satisfiesRange('1.2.3', '^1.0.0')).toBe(true);
    expect(satisfiesRange('1.0.0', '^1.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfiesRange('0.9.0', '^1.0.0')).toBe(false);
  });

  it('matches tilde range', () => {
    expect(satisfiesRange('1.2.5', '~1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.3', '~1.2.3')).toBe(true);
    expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
  });

  it('matches wildcard', () => {
    expect(satisfiesRange('99.99.99', '*')).toBe(true);
  });

  it('matches comparison operators', () => {
    expect(satisfiesRange('2.0.0', '>=1.0.0')).toBe(true);
    expect(satisfiesRange('0.9.0', '>=1.0.0')).toBe(false);
    expect(satisfiesRange('0.9.0', '<1.0.0')).toBe(true);
  });

  it('matches compound range', () => {
    expect(satisfiesRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
  });
});

describe('getBumpType', () => {
  it('detects major bump', () => {
    expect(getBumpType('1.0.0', '2.0.0')).toBe('major');
  });

  it('detects minor bump', () => {
    expect(getBumpType('1.0.0', '1.1.0')).toBe('minor');
  });

  it('detects patch bump', () => {
    expect(getBumpType('1.0.0', '1.0.1')).toBe('patch');
  });

  it('detects no bump', () => {
    expect(getBumpType('1.0.0', '1.0.0')).toBe('none');
  });
});

describe('bumpVersion', () => {
  it('bumps major', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('bumps minor', () => {
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('bumps patch', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
  });
});

describe('latestVersion', () => {
  it('returns the latest version', () => {
    expect(latestVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
  });

  it('returns null for empty array', () => {
    expect(latestVersion([])).toBeNull();
  });
});
