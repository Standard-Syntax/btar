import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function normalizeBaseBranch(baseBranch = "main"): string {
  const shortName = baseBranch.replace(/^origin\//, "");
  if (
    !shortName || shortName === "HEAD" || shortName.startsWith("-") ||
    [...shortName].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || "~^:?*[\\".includes(char)) ||
    shortName.includes("..") || shortName.includes("@{") || shortName.endsWith(".") ||
    shortName.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))
  ) {
    throw new Error("Base branch must be a valid Git branch name");
  }
  return `origin/${shortName}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function generateCircleCiConfig(threshold = 70, baseBranch = "main"): string {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("Threshold must be an integer between 0 and 100");
  }
  const normalizedBaseBranch = normalizeBaseBranch(baseBranch);
  const remoteBranch = normalizedBaseBranch.slice("origin/".length);
  return `version: 2.1

jobs:
  quality:
    docker:
      - image: cimg/python:3.14
    steps:
      - checkout
      - run:
          name: Install Hatch
          command: python -m pip install --upgrade hatch
      - run:
          name: Verify Hatch Python version
          command: hatch run python -c "import sys; raise SystemExit(sys.version_info < (3, 14))"
      - run:
          name: Lint
          command: hatch run ruff check . && hatch run ruff format --check .
      - run:
          name: Type check
          command: hatch run pyrefly check
      - run:
          name: Test with coverage
          command: hatch run pytest --cov --cov-report=xml --cov-report=term-missing
      - run:
          name: Check changed-line coverage
          command: |
            git fetch origin ${shellQuote(`+refs/heads/${remoteBranch}:refs/remotes/origin/${remoteBranch}`)}
            hatch run diff-cover coverage.xml ${shellQuote(`--compare-branch=${normalizedBaseBranch}`)} --fail-under=${threshold}
      - run:
          name: Scan Python source
          command: hatch run semgrep scan --config p/python --error --strict
      - store_artifacts:
          path: coverage.xml

  secrets:
    docker:
      - image: cimg/base:current
    steps:
      - checkout
      - run:
          name: Install Gitleaks
          command: |
            curl --fail --location --silent --show-error --output /tmp/gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v8.24.2/gitleaks_8.24.2_linux_x64.tar.gz
            echo "fa0500f6b7e41d28791ebc680f5dd9899cd42b58629218a5f041efa899151a8e  /tmp/gitleaks.tar.gz" | sha256sum --check
            tar --extract --gzip --file /tmp/gitleaks.tar.gz --directory /tmp gitleaks
            /tmp/gitleaks detect --source=. --no-banner

workflows:
  quality:
    jobs:
      - quality
      - secrets
`;
}

const REQUIRED_TOOLS = ["ruff", "pyrefly", "pytest", "pytest-cov", "hypothesis", "diff-cover", "semgrep"];

function hatchDependencies(path: string): string[] {
  try {
    const parsed: unknown = Bun.TOML.parse(readFileSync(path, "utf-8"));
    if (typeof parsed !== "object" || parsed === null || !("tool" in parsed)) return [];
    const tool = parsed.tool;
    if (typeof tool !== "object" || tool === null || !("hatch" in tool)) return [];
    const hatch = tool.hatch;
    if (typeof hatch !== "object" || hatch === null || !("envs" in hatch)) return [];
    const envs = hatch.envs;
    if (typeof envs !== "object" || envs === null || !("default" in envs)) return [];
    const env = envs.default;
    if (typeof env !== "object" || env === null || !("dependencies" in env)) return [];
    return Array.isArray(env.dependencies) ? env.dependencies.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function missingHatchTools(path: string): string[] {
  const dependencies = hatchDependencies(path);
  const names = dependencies.map((entry) => {
    if (entry.includes(";")) return undefined;
    return entry.match(/^\s*([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\s*(?:[<>=!~]|@).*)?\s*$/)?.[1].toLowerCase().replaceAll("_", "-").replaceAll(".", "-");
  });
  return REQUIRED_TOOLS.filter((tool) => !names.includes(tool));
}

export async function initCiCommand(options: { directory?: string; force?: boolean; threshold?: number; baseBranch?: string } = {}): Promise<void> {
  const targetDirectory = options.directory ?? process.cwd();
  const directory = join(targetDirectory, ".circleci");
  const destination = join(directory, "config.yml");
  if (existsSync(destination) && !options.force) {
    console.error(`CircleCI configuration already exists: ${destination}\nUse --force to overwrite.`);
    process.exitCode = 1;
    return;
  }
  const missing = missingHatchTools(join(targetDirectory, "pyproject.toml"));
  if (missing.length > 0) {
    console.error(`Missing Hatch default environment dependencies: ${missing.join(", ")}. Generate and merge the python-toolchain configuration into pyproject.toml first.`);
    process.exitCode = 1;
    return;
  }
  const config = generateCircleCiConfig(options.threshold, options.baseBranch);
  mkdirSync(directory, { recursive: true });
  writeFileSync(destination, config);
  console.log(`Created CircleCI configuration: ${destination}`);
}
