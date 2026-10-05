"""Package only the extension runtime files after verification succeeds."""

import json
import os
from pathlib import Path
import zipfile


root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
runtime_files = [
    "manifest.json", "providers.js", "content-core.js", "content.js",
    "stream-bridge.js", "overlay.js", "background-core.js", "background.js",
    "welcome.html", "welcome.css", "welcome.js",
    "popup.html", "popup.css", "popup.js",
]
for filename in runtime_files:
    if not (root / filename).is_file():
        raise FileNotFoundError(filename)

dist = root / "dist"
dist.mkdir(exist_ok=True)
archive_path = dist / f"AI-Chat-Notifications-v{manifest['version']}.zip"
with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for filename in runtime_files:
        archive.write(root / filename, filename)

with zipfile.ZipFile(archive_path) as archive:
    if archive.testzip() is not None:
        raise RuntimeError("ZIP integrity check failed")
    packaged_manifest = json.loads(archive.read("manifest.json"))
    if packaged_manifest["version"] != manifest["version"]:
        raise RuntimeError("Packaged version mismatch")

if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"archive={archive_path.relative_to(root).as_posix()}\n")

print(f"Verified extension ZIP: {archive_path.name}")
