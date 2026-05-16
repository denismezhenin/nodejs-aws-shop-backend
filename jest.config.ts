import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/test", "<rootDir>/src"],
  testMatch: ["**/test/**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  collectCoverageFrom: [
    "src/product_service/**/*.ts",
    "src/import_service/**/*.ts",
    "src/db/**/*.ts",
    "src/utils/**/*.ts",
  ],
  coverageDirectory: "coverage",
  clearMocks: true,
};

export default config;
