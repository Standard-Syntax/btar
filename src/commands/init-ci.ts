/**
 * Generate CircleCI configuration for analyzing another project.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface InitCiOptions {
  threshold?: number;
  force?: boolean;
}

export function generateCircleCiConfig(threshold: number): string {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("Threshold must be an integer between 0 and 100");
  }

  return `version: 2.1

jobs:
  analyze:
    docker:
      - image: cimg/python:3.14-node
    steps:
      - checkout
      - run:
          name: Install BTAR
          command: npm install -g btar
      - run:
          name: Prepare Python when pyproject.toml exists
          command: |
            if [ -f pyproject.toml ]; then
              python -m pip install uv
              uv sync --python 3.14
            fi
      - run:
          name: Agent-readiness verification
          command: btar analyze . --json --fail-under ${threshold} > btar-report.json
      - store_artifacts:
          path: btar-report.json

workflows:
  btar:
    jobs:
      - analyze
`;
}

export async function initCiCommand(options: InitCiOptions = {}): Promise<void> {
  const threshold = options.threshold ?? 70;
  const config = generateCircleCiConfig(threshold);
  const directory = join(process.cwd(), ".circleci");
  const destination = join(directory, "config.yml");

  if (existsSync(destination) && !options.force) {
    console.error(`CircleCI configuration already exists: ${destination}\nUse --force to overwrite.`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(directory, { recursive: true });
  writeFileSync(destination, config);
  console.log(`Created CircleCI configuration: ${destination}`);
  console.log(`Threshold: ${threshold}`);
}
