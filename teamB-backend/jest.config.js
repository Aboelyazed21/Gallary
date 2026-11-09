/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/src/tests/setup.ts'],
  // Node16-style `.js` import specifiers point back to the .ts sources under ts-jest
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.routes.ts', '!src/server.ts'],
  coverageThreshold: {
    global: { lines: 60, functions: 60, statements: 60, branches: 55 },
  },
  clearMocks: true,
  detectOpenHandles: false,
  testTimeout: 20000,
};
