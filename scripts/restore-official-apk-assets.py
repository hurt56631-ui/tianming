#!/usr/bin/env python3
"""Restore only missing published runtime resources from a SHA-pinned official full APK.

The downloading workflow must first verify the original APK SHA256 itself.
No code overwrites or arbitrary archive extraction are allowed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
from zipfile import ZipFile, BadZipFile

ALLOWED_PREFIXES = ("assets/", "preview/", "vendor/", "bundled-scenarios/")
MAX_FILE_SIZE = 268435456
MAX_TOTAL_SIZE = 2500000000


def safe_name(name):
    if (not name or len(name) > 500 or "\\" in name or name.startswith("/")
        or any(piece in ("", ".", "..") for piece in name.split("/"))
        or (not name.startswith(ALLOWED_PREFIXES) and name != "icon.png")):
        raise ValueError("Unsafe resource path: " + repr(name))
    rel = PurePosixPath(name)
    if rel.is_absolute():
        raise ValueError("Absolute resource path: " + repr(name))
    return rel


def run(apk, manifest, web):
    data = json.loads(manifest.read_text(encoding="utf-8-sig"))
    if data.get("type") != "tianming-hot-update" or not isinstance(data.get("files"), list):
        raise ValueError("Invalid official media manifest")
    missing, total = [], 0
    for row in data["files"]:
        if not isinstance(row, dict) or not isinstance(row.get("path"), str):
            raise ValueError("Invalid manifest item")
        name = row["path"]
        if not name.startswith(ALLOWED_PREFIXES) and name != "icon.png":
            continue  # NEVER restore older JS, HTML or config code.
        rel = safe_name(name)
        size, expected_hash = row.get("size"), row.get("sha256")
        if (type(size) is not int or size < 0 or size > MAX_FILE_SIZE
            or not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash)):
            raise ValueError("Invalid official size/hash: " + name)
        dest = web.joinpath(*rel.parts)
        if dest.is_symlink():
            raise ValueError("Symlink destination not allowed: " + name)
        if dest.exists():
            if not dest.is_file():
                raise ValueError("Existing resource is not a file: " + name)
            continue
        missing.append((name, dest, size, expected_hash))
        total += size
    if total > MAX_TOTAL_SIZE or len(missing) > 15000:
        raise ValueError("Official resource restore exceeds bounded limits")
    if not missing:
        print("[apk-assets] All official assets present; no restore needed")
        return 0
    try:
        with ZipFile(apk) as archive:
            index = {info.filename: info for info in archive.infolist() if not info.is_dir()}
            prefix = "assets/public/"
            if prefix + "index.html" not in index:
                raise ValueError("Not a full Capacitor APK: assets/public/index.html missing")
            absent = [name for name, _, _, _ in missing if prefix + name not in index]
            if absent:
                raise ValueError("Official APK lacks " + str(len(absent)) + " required files: " + ", ".join(absent[:5]))
            for name, _, size, _ in missing:
                if index[prefix + name].file_size != size:
                    raise ValueError("Official APK file size differs from manifest: " + name)
            for i, (name, dest, size, expected_hash) in enumerate(missing, 1):
                parent = dest.parent
                while parent != web and parent != parent.parent:
                    if parent.is_symlink():
                        raise ValueError("Symlink resource directory: " + str(parent))
                    parent = parent.parent
                dest.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile(dir=dest.parent, prefix=".official-asset-", delete=False) as tmp:
                    part = Path(tmp.name)
                    digest = hashlib.sha256()
                    written = 0
                    try:
                        with archive.open(index[prefix + name]) as inp:
                            for chunk in iter(lambda: inp.read(1048576), b""):
                                written += len(chunk)
                                if written > size or written > MAX_FILE_SIZE:
                                    raise ValueError("Oversize restored file: " + name)
                                digest.update(chunk)
                                tmp.write(chunk)
                    except Exception:
                        part.unlink(missing_ok=True)
                        raise
                if written != size or digest.hexdigest() != expected_hash:
                    part.unlink(missing_ok=True)
                    raise ValueError("Official asset SHA256/size mismatch: " + name)
                os.replace(part, dest)
                if i % 100 == 0:
                    print("[apk-assets] Checked " + str(i) + "/" + str(len(missing)))
    except BadZipFile as err:
        raise ValueError("Official APK is not a valid ZIP archive") from err
    print("[apk-assets] PASS: " + str(len(missing)) + " assets restored; " + str(total) + " bytes SHA256-verified")
    return len(missing)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--web-root", type=Path, required=True)
    args = parser.parse_args()
    if not args.apk.is_file() or not args.manifest.is_file() or not args.web_root.is_dir():
        parser.error("APK, manifest and web directory must all exist")
    run(args.apk, args.manifest, args.web_root.resolve())


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as err:
        print("[apk-assets] FAIL: " + str(err), file=sys.stderr)
        sys.exit(1)
