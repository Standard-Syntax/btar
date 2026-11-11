# Verification evidence

These logs record local checks from the implementation run. They are historical evidence. Hosted status must be checked at each published PR head.

The hashes below identify the tracked, normalized files. Verify them from the repository root with `sha256sum .audit/evidence/*.log`.

The original local `/tmp/btar-final-*.log` files are not part of the committed evidence. The following Python transformation reproduces every tracked log from those originals when they are available. It reads UTF-8 text with universal newline conversion, removes ANSI CSI sequences, strips trailing whitespace from each line, removes trailing blank lines, and writes one final newline.

```python
import re
from pathlib import Path

for source in sorted(Path("/tmp").glob("btar-final-*.log")):
    text = source.read_text(encoding="utf-8")
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = "\n".join(line.rstrip() for line in text.splitlines()).rstrip() + "\n"
    target = Path(".audit/evidence") / source.name.removeprefix("btar-final-")
    target.write_text(text, encoding="utf-8")
```

| File | Tracked SHA-256 |
| --- | --- |
| circleci.log | `6ec9c46fc7cf0dea86a14956287d62901355fa771f449a0b99915cccb88b6a64` |
| gitleaks.log | `5f9e64b46626d4a170465f27677f37f40a65c26b350fc789601a462a9ba6b9bd` |
| implementation.log | `22e784424dcfb67ba36a661be32fb8d1f46e903a81d6d6e18a287be93c0c1c70` |
| precommit.log | `ed230e78305c25045c67103e0eff8fa6538a8e8898e80b087f5a3db13f9fe8fb` |
| pty.log | `0b08a4911dbc3f36f0f49f224eaea94d692cc562b85ed2b2a911488c42c54ae1` |
| python.log | `2dd2c127e58e7ac2a5da9993d7b8de7564969adee39ee34f47dc523bdd441a87` |
| tests.log | `3428d05564beff3769b3398f00990860f76b45b4e07e8afb891fcea288db2aed` |
