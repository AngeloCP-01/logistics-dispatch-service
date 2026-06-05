/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^@/(.*)\\.js$": "<rootDir>/src/$1",
    "^@tests/(.*)\\.js$": "<rootDir>/tests/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@tests/(.*)$": "<rootDir>/tests/$1",
  },
  testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true, tsconfig: "tsconfig.test.json" }],
  },
  testTimeout: 60000,
  clearMocks: true,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};
