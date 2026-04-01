/**
 * Test Fixtures - Common test data for LXD MCP
 */

/**
 * LXD Instance Configuration Fixture
 */
export interface InstanceFixture {
  name: string;
  image: string;
  profile?: string;
  config?: Record<string, string>;
  devices?: Record<string, Record<string, string>>;
}

/**
 * LXD Image Fixture
 */
export interface ImageFixture {
  alias: string;
  fingerprint: string;
  name: string;
  description?: string;
}

/**
 * LXD Project Fixture
 */
export interface ProjectFixture {
  name: string;
  description?: string;
  config?: Record<string, string>;
}

/**
 * LXD Snapshot Fixture
 */
export interface SnapshotFixture {
  name: string;
  description?: string;
  instanceName: string;
}

/**
 * Default test fixtures
 */
export const DEFAULT_INSTANCE_FIXTURE: InstanceFixture = {
  name: 'test-instance',
  image: 'alpine/3.18',
  config: {
    'limits.memory': '128MiB',
  },
};

export const DEFAULT_IMAGE_FIXTURE: ImageFixture = {
  alias: 'test-image',
  fingerprint: 'abc123def456',
  name: 'alpine/3.18',
  description: 'Test Alpine image',
};

export const DEFAULT_PROJECT_FIXTURE: ProjectFixture = {
  name: 'test-project',
  description: 'Test project for LXD MCP',
  config: {
    'features.images': 'true',
    'features.profiles': 'true',
  },
};

/**
 * Test data management utilities
 */
export class FixtureManager {
  private fixtures: Map<string, any> = new Map();
  
  /**
   * Create a new fixture
   */
  create<T>(key: string, fixture: T): T {
    this.fixtures.set(key, fixture);
    return fixture;
  }
  
  /**
   * Get a fixture by key
   */
  get<T>(key: string): T | undefined {
    return this.fixtures.get(key);
  }
  
  /**
   * Generate a unique fixture name
   */
  generateName(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}-${timestamp}-${random}`;
  }
  
  /**
   * Clear all fixtures
   */
  clear(): void {
    this.fixtures.clear();
  }
}