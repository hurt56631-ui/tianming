#!/usr/bin/env python3
"""Offline fixtures: no network, no Android SDK."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

FILE = Path(__file__).with_name("restore-official-apk-assets.py")
spec = importlib.util.spec_from_file_location("restore", FILE)
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.web = self.root / "web"
        self.web.mkdir()
        self.apk = self.root / "official.apk"
        self.asset = "assets/audio/test.mp3"
        self.payload = b"official-test"
        self.manifest = self.web / ".hot-update-manifest.json"
        self.set_hash(hashlib.sha256(self.payload).hexdigest())
        with zipfile.ZipFile(self.apk, "w") as z:
            z.writestr("assets/public/index.html", "full")
            z.writestr("assets/public/" + self.asset, self.payload)

    def set_hash(self, value):
        self.manifest.write_text(json.dumps({"type": "tianming-hot-update", "files": [
            {"path": self.asset, "size": len(self.payload), "sha256": value},
            {"path": "game.js", "size": 1, "sha256": "0" * 64}
        ]}), encoding="utf-8")

    def test_restore_and_do_not_change_new_code(self):
        code = self.web / "game.js"
        code.write_text("new branch code", encoding="utf-8")
        self.assertEqual(restore.run(self.apk, self.manifest, self.web), 1)
        self.assertEqual((self.web / self.asset).read_bytes(), self.payload)
        self.assertEqual(code.read_text(encoding="utf-8"), "new branch code")
        self.assertEqual(restore.run(self.apk, self.manifest, self.web), 0)

    def test_hash_mismatch_fails_closed(self):
        self.set_hash("0" * 64)
        with self.assertRaisesRegex(ValueError, "SHA256"):
            restore.run(self.apk, self.manifest, self.web)
        self.assertFalse((self.web / self.asset).exists())

    def test_missing_original_resource_fails(self):
        with zipfile.ZipFile(self.apk, "w") as z:
            z.writestr("assets/public/index.html", "full")
        with self.assertRaisesRegex(ValueError, "lacks"):
            restore.run(self.apk, self.manifest, self.web)

    def test_no_path_traversal_or_old_code(self):
        for name in ("assets/../../secret", "assets\\path", "game.js"):
            with self.assertRaises(ValueError):
                restore.safe_name(name)


if __name__ == "__main__":
    unittest.main()
