/**
 * Test Data Management Utilities
 */

import { FixtureManager, InstanceFixture, ProjectFixture, DEFAULT_INSTANCE_FIXTURE, DEFAULT_PROJECT_FIXTURE } from '../fixtures/data.ts';

/**
 * Test data management singleton
 */
export class TestDataManager {
  private static instance: TestDataManager;
  private fixtureManager: FixtureManager;
  
  private constructor() {
    this.fixtureManager = new FixtureManager();
  }
  
  static getInstance(): TestDataManager {
    if (!TestDataManager.instance) {
      TestDataManager.instance = new TestDataManager();
    }
    return TestDataManager.instance;
  }
  
  /**
   * Create a test instance with unique name
   */
  createTestInstance(prefix: string = 'test'): InstanceFixture {
    const name = this.fixtureManager.generateName(prefix);
    const instance = {
      ...DEFAULT_INSTANCE_FIXTURE,
      name,
    };
    
    this.fixtureManager.create(`instance-${name}`, instance);
    return instance;
  }
  
  /**
   * Create a test project with unique name
   */
  createTestProject(prefix: string = 'test'): ProjectFixture {
    const name = this.fixtureManager.generateName(prefix);
    const project = {
      ...DEFAULT_PROJECT_FIXTURE,
      name,
    };
    
    this.fixtureManager.create(`project-${name}`, project);
    return project;
  }
  
  /**
   * Cleanup test data
   */
  async cleanup(): Promise<void> {
    // Cleanup logic would go here
    this.fixtureManager.clear();
  }
}

// Export default instance
export const testDataManager = TestDataManager.getInstance();