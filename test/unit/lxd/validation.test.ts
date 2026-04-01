/**
 * LXD Validation Unit Tests
 * 
 * Tests for LXD validation utilities for instance and snapshot names
 */

import { describe, it, expect } from 'vitest';
import { 
  validateInstanceName, 
  validateSnapshotName,
  isAbsolutePath,
  containsPathTraversal,
  isBlockedPath,
  validateFilePath
} from '../../../src/lxd/validation.ts';

describe('LXD Validation Utilities', () => {
  describe('validateInstanceName', () => {
    it('should validate valid instance names', () => {
      const validNames = [
        'test',
        'test-instance',
        'test_instance',
        'test123',
        'a',
        'instance-with-dashes',
        'instance_with_underscores',
        'instance123with456numbers'
      ];
      
      for (const name of validNames) {
        expect(validateInstanceName(name)).toBe(true);
      }
    });

    it('should reject invalid instance names', () => {
      const invalidNames = [
        '', // empty
        'test..name', // consecutive dots
        'test--name', // consecutive dashes
        'test__name', // consecutive underscores
        '-test', // starts with dash
        'test-', // ends with dash
        '_test', // starts with underscore
        'test_', // ends with underscore
        'test name', // space
        'test@name', // special character
        'a'.repeat(64), // too long
      ];
      
      for (const name of invalidNames) {
        expect(validateInstanceName(name)).toBe(false);
      }
    });

    it('should handle edge cases properly', () => {
      // Test boundaries
      expect(validateInstanceName('a')).toBe(true);
      expect(validateInstanceName('a'.repeat(63))).toBe(true);
      expect(validateInstanceName('a'.repeat(64))).toBe(false);
    });
  });

  describe('validateSnapshotName', () => {
    it('should validate valid snapshot names', () => {
      const validNames = [
        'snapshot',
        'snapshot-1',
        'snapshot_1',
        'snapshot123',
        'a',
        'snapshot-with-dashes',
        'snapshot_with_underscores',
        'snapshot123with456numbers'
      ];
      
      for (const name of validNames) {
        expect(validateSnapshotName(name)).toBe(true);
      }
    });

    it('should reject invalid snapshot names', () => {
      const invalidNames = [
        '', // empty
        'snapshot..1', // consecutive dots
        'snapshot--1', // consecutive dashes
        'snapshot__1', // consecutive underscores
        '-snapshot', // starts with dash
        'snapshot-', // ends with dash
        '_snapshot', // starts with underscore
        'snapshot_', // ends with underscore
        'snapshot 1', // space
        'snapshot@1', // special character
        'a'.repeat(64), // too long
      ];
      
      for (const name of invalidNames) {
        expect(validateSnapshotName(name)).toBe(false);
      }
    });

    it('should handle edge cases properly', () => {
      // Test boundaries
      expect(validateSnapshotName('a')).toBe(true);
      expect(validateSnapshotName('a'.repeat(63))).toBe(true);
      expect(validateSnapshotName('a'.repeat(64))).toBe(false);
    });
  });

  describe('isAbsolutePath', () => {
    it('should return true for absolute paths', () => {
      expect(isAbsolutePath('/')).toBe(true);
      expect(isAbsolutePath('/path/to/file')).toBe(true);
      expect(isAbsolutePath('/etc/config')).toBe(true);
      expect(isAbsolutePath('/proc/1')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isAbsolutePath('path/to/file')).toBe(false);
      expect(isAbsolutePath('./file')).toBe(false);
      expect(isAbsolutePath('../file')).toBe(false);
      expect(isAbsolutePath('file')).toBe(false);
      expect(isAbsolutePath('')).toBe(false);
    });
  });

  describe('containsPathTraversal', () => {
    it('should return true for paths with traversal', () => {
      expect(containsPathTraversal('../etc/passwd')).toBe(true);
      expect(containsPathTraversal('/etc/../etc/passwd')).toBe(true);
      expect(containsPathTraversal('/path/to/../../file')).toBe(true);
      expect(containsPathTraversal('..')).toBe(true);
      expect(containsPathTraversal('../')).toBe(true);
    });

    it('should return false for safe paths', () => {
      expect(containsPathTraversal('/etc/passwd')).toBe(false);
      expect(containsPathTraversal('/path/to/file')).toBe(false);
      expect(containsPathTraversal('/proc/1')).toBe(false);
      expect(containsPathTraversal('/')).toBe(false);
    });
  });

  describe('isBlockedPath', () => {
    it('should return true for blocked paths', () => {
      expect(isBlockedPath('/proc')).toBe(true);
      expect(isBlockedPath('/proc/')).toBe(true);
      expect(isBlockedPath('/proc/1')).toBe(true);
      expect(isBlockedPath('/sys')).toBe(true);
      expect(isBlockedPath('/sys/kernel')).toBe(true);
      expect(isBlockedPath('/dev')).toBe(true);
      expect(isBlockedPath('/dev/null')).toBe(true);
      expect(isBlockedPath('/run')).toBe(true);
      expect(isBlockedPath('/run/lock')).toBe(true);
    });

    it('should return false for allowed paths', () => {
      expect(isBlockedPath('/etc')).toBe(false);
      expect(isBlockedPath('/etc/passwd')).toBe(false);
      expect(isBlockedPath('/home')).toBe(false);
      expect(isBlockedPath('/var/log')).toBe(false);
      expect(isBlockedPath('/usr/bin')).toBe(false);
      expect(isBlockedPath('/')).toBe(false);
    });
  });

  describe('validateFilePath', () => {
    it('should return undefined for valid paths', () => {
      expect(validateFilePath('/etc/passwd')).toBeUndefined();
      expect(validateFilePath('/home/user/file.txt')).toBeUndefined();
      expect(validateFilePath('/var/log/app.log')).toBeUndefined();
    });

    it('should return error for relative paths', () => {
      const error = validateFilePath('etc/passwd');
      expect(error).toContain('absolute');
    });

    it('should return error for path traversal', () => {
      const error = validateFilePath('/etc/../etc/passwd');
      expect(error).toContain('traversal');
    });

    it('should return error for blocked paths', () => {
      expect(validateFilePath('/proc')).toContain('blocked');
      expect(validateFilePath('/sys/kernel')).toContain('blocked');
      expect(validateFilePath('/dev/null')).toContain('blocked');
      expect(validateFilePath('/run/lock')).toContain('blocked');
    });
  });
});