export function generatePythonToolchainConfig(): string {
  return `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "python-project"
version = "0.0.0"
requires-python = ">=3.14"
dependencies = []

[tool.hatch.envs.default]
python = "3.14"
skip-install = true
dependencies = [
  "diff-cover>=11.0.1",
  "hypothesis>=6.170.15",
  "pyrefly>=1.4.1",
  "pytest>=9.2.0",
  "pytest-cov>=7.1.0",
  "ruff>=0.17.4",
  "semgrep>=1.185.0",
]

[tool.hatch.envs.default.scripts]
lint = "ruff check ."
format = "ruff format --check ."
typecheck = "pyrefly check"
test = "pytest --cov --cov-report=term-missing --cov-report=xml"
security = "semgrep scan --config p/python --error --strict"
secrets = "gitleaks detect --no-banner"
coverage-diff = "diff-cover coverage.xml"
check = ["lint", "format", "typecheck", "test", "security", "secrets"]

[tool.pytest.ini_options]
addopts = "--strict-markers"
testpaths = ["tests"]
pythonpath = [".", "src"]

[tool.coverage.run]
branch = true
source = ["."]
omit = ["tests/*"]

[tool.ruff]
target-version = "py314"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
`;
}
