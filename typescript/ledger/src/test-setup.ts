// Global test setup
import "reflect-metadata";

// Mock console methods to reduce noise during testing
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

beforeAll(() => {
  // Suppress console output during tests unless VERBOSE_TESTS is set
  if (!process.env.VERBOSE_TESTS) {
    console.error = jest.fn((message) => {
      // Still show actual errors, but suppress expected test errors
      if (typeof message === "string" && message.includes("Test error")) {
        return;
      }
      originalError(message);
    });
    console.warn = jest.fn();
    console.log = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});

// Global test utilities
global.testUtils = {
  // Helper to create mock dates
  createMockDate: (dateString: string) => new Date(dateString),

  // Helper to create mock ObjectId
  createMockObjectId: (id: string = "mock-object-id") => ({
    toString: () => id,
    toHexString: () => id,
    equals: (other: any) => other.toString() === id,
  }),

  // Helper to wait for async operations
  waitFor: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),

  // Helper to create mock logger
  createMockLogger: () => ({
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
  }),
};

// Extend Jest matchers
expect.extend({
  toBeApproximatelyEqual(
    received: number,
    expected: number,
    tolerance: number = 0.01,
  ) {
    const pass = Math.abs(received - expected) < tolerance;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be approximately equal to ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be approximately equal to ${expected} (tolerance: ${tolerance})`,
        pass: false,
      };
    }
  },

  toBeBalanced(received: { totalDebit: number; totalCredit: number }) {
    const tolerance = 0.01;
    const pass =
      Math.abs(received.totalDebit - received.totalCredit) < tolerance;
    if (pass) {
      return {
        message: () => `expected journal entry not to be balanced`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected journal entry to be balanced. Debit: ${received.totalDebit}, Credit: ${received.totalCredit}`,
        pass: false,
      };
    }
  },
});

// Type declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeApproximatelyEqual(expected: number, tolerance?: number): R;
      toBeBalanced(): R;
    }
  }

  var testUtils: {
    createMockDate: (dateString: string) => Date;
    createMockObjectId: (id?: string) => any;
    waitFor: (ms: number) => Promise<void>;
    createMockLogger: () => any;
  };
}

// Set up test environment variables
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://localhost:27017/ledger-test";
process.env.LOG_LEVEL = "error";
