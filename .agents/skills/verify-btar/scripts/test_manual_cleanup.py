#!/usr/bin/env python3
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1] / "SKILL.md"


class ManualCleanupTests(unittest.TestCase):
    def run_cleanup(self, action):
        setup = SKILL.read_text().split('```bash\n')[3].split('capture() {')[0]
        with tempfile.TemporaryDirectory(prefix="btar-manual-test-") as directory:
            root = Path(directory)
            unrelated = root / "unrelated"
            unrelated.mkdir()
            (unrelated / "keep.txt").write_text("preserve me")
            try:
                completed = subprocess.run(
                    ["bash", "-c", setup + '\ntrap - EXIT\n' + action],
                    env=dict(os.environ, BTAR_EVIDENCE=str(root), UNRELATED=str(unrelated)),
                    capture_output=True, text=True,
                )
                target = Path((root / "target.txt").read_text().strip())
                self.assertEqual((unrelated / "keep.txt").read_text(), "preserve me")
                return completed, target.exists(), target.is_symlink()
            finally:
                if (root / "target.txt").exists():
                    target = Path((root / "target.txt").read_text().strip())
                    for path in (target, target.with_name(target.name + "-moved")):
                        if path.is_symlink():
                            path.unlink()
                        elif path.exists():
                            shutil.rmtree(path)

    def test_mutable_target_cannot_redirect_cleanup(self):
        result, exists, _ = self.run_cleanup('export BTAR_TARGET="$UNRELATED"\ncleanup_target')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(exists)

    def test_repeated_cleanup_succeeds(self):
        result, exists, _ = self.run_cleanup('cleanup_target && cleanup_target')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(exists)

    def test_replaced_directory_is_preserved(self):
        result, exists, _ = self.run_cleanup(
            'mv "$BTAR_OWNED_TARGET" "$BTAR_OWNED_TARGET-moved"\n'
            'mkdir "$BTAR_OWNED_TARGET"\ncleanup_target')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ownership changed", result.stderr)
        self.assertTrue(exists)

    def test_symlink_is_preserved(self):
        result, exists, symlink = self.run_cleanup(
            'mv "$BTAR_OWNED_TARGET" "$BTAR_OWNED_TARGET-moved"\n'
            'ln -s "$UNRELATED" "$BTAR_OWNED_TARGET"\ncleanup_target')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ownership changed", result.stderr)
        self.assertTrue(exists)
        self.assertTrue(symlink)


if __name__ == "__main__":
    unittest.main()
