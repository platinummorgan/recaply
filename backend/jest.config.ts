import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  clearMocks: true,
  restoreMocks: true,
  modulePathIgnorePatterns: ['<rootDir>/dist'],
};

export default config;

