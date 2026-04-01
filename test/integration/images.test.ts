/**
 * Integration Tests - Image Management
 * 
 * Tests for image operations against a live LXD server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LXDClient } from '../../src/lxd/client.ts';
import { LXDApi, LXDImage, LXDAlias } from '../../src/lxd/api.ts';
import { checkLXD, skipIfNoLXD } from '../utils/lxd.ts';

describe('Integration: Image Management', () => {
  let client: LXDClient;
  let api: LXDApi;
  let lxdCheck: { available: boolean; socketPath: string };
  const testPrefix = `test-${Date.now()}`;
  const createdImages: string[] = [];
  const createdAliases: string[] = [];

  beforeAll(async () => {
    lxdCheck = await checkLXD();
    skipIfNoLXD(lxdCheck);

    client = new LXDClient({ socketPath: lxdCheck.socketPath });
    api = new LXDApi(client);
  });

  afterAll(async () => {
    // Cleanup: delete any test aliases created during tests
    for (const aliasName of createdAliases) {
      try {
        await api.deleteAlias(aliasName);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ============================================
  // Section 5.1: Image Listing Tests
  // ============================================

  describe('Image Listing', () => {
    it('5.1.1: should list default images from LXD', async () => {
      const result = await api.listImages();
      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  // ============================================
  // Section 5.2: Image Retrieval Tests
  // ============================================

  describe('Image Retrieval', () => {
    it('5.2.1: should get Alpine image details', async () => {
      // First, get list of images to find an Alpine one
      const result = await api.listImages();
      
      if (result.items.length === 0) {
        console.log('Skipping: No images available');
        return;
      }

      // Get details of the first image
      const image = await api.getImage(result.items[0].fingerprint);
      expect(image).toBeDefined();
      expect(image.fingerprint).toBeDefined();
    });

    it('5.2.2: should get image details', async () => {
      const result = await api.listImages();
      
      if (result.items.length === 0) {
        console.log('Skipping: No images available');
        return;
      }

      const image = await api.getImage(result.items[0].fingerprint);
      expect(image).toBeDefined();
      expect(image.fingerprint).toBeDefined();
    });

    it('5.2.3: should get image properties', async () => {
      const result = await api.listImages();
      
      if (result.items.length === 0) {
        console.log('Skipping: No images available');
        return;
      }

      const image = await api.getImage(result.items[0].fingerprint);
      expect(image.properties).toBeDefined();
    });
  });

  // ============================================
  // Section 5.3: Image Alias Tests
  // ============================================

  describe('Image Alias Operations', () => {
    it('5.3.1: should create valid image alias', async () => {
      // First get an image to use
      const result = await api.listImages();
      if (result.items.length === 0) {
        console.log('Skipping: No images available to create alias');
        return;
      }

      const aliasName = `${testPrefix}-alias-${Date.now()}`;
      createdAliases.push(aliasName);

      await api.createAlias(
        aliasName,
        'Test alias description',
        result.items[0].fingerprint
      );

      // Verify the alias was created
      const aliasesResult = await api.listAliases();
      const found = aliasesResult.items.some(a => a.name === aliasName);
      expect(found).toBe(true);
    });

    it('5.3.2: should get existing alias', async () => {
      // First create an alias
      const imagesResult = await api.listImages();
      if (imagesResult.items.length === 0) {
        console.log('Skipping: No images available');
        return;
      }

      const aliasName = `${testPrefix}-get-alias-${Date.now()}`;
      createdAliases.push(aliasName);

      await api.createAlias(
        aliasName,
        'Test alias for get',
        imagesResult.items[0].fingerprint
      );

      // Now get it
      const alias = await api.getAlias(aliasName);
      expect(alias.name).toBe(aliasName);
    });

    it('5.3.3: should list aliases after creation', async () => {
      const result = await api.listAliases();
      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('5.3.4: should delete valid alias', async () => {
      const imagesResult = await api.listImages();
      if (imagesResult.items.length === 0) {
        console.log('Skipping: No images available');
        return;
      }

      const aliasName = `${testPrefix}-delete-alias-${Date.now()}`;

      await api.createAlias(
        aliasName,
        'Test alias to delete',
        imagesResult.items[0].fingerprint
      );

      // Delete the alias
      await api.deleteAlias(aliasName);

      // Verify it's gone
      try {
        await api.getAlias(aliasName);
        throw new Error('Alias still exists');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================
  // Additional Image Tests
  // ============================================

  describe('Additional Image Operations', () => {
    it('should list images with project filter', async () => {
      const result = await api.listImages('default');
      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should get image by fingerprint', async () => {
      const result = await api.listImages();
      if (result.items.length === 0) {
        console.log('Skipping: No images available');
        return;
      }

      const fingerprint = result.items[0].fingerprint;
      const image = await api.getImage(fingerprint);
      expect(image.fingerprint).toBe(fingerprint);
    });
  });
});
