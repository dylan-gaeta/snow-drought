#!/usr/bin/env python3
"""Stamp every local js/ and css/ reference in the site's HTML pages with a
?v=<content hash> so browsers and the GitHub Pages cache fetch a changed script
together with the page that loads it. Run before each push; rerunning changes
nothing unless a script or stylesheet changed."""

import hashlib
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
HASH_CHARS = 10
REFERENCE = re.compile(r'(?P<attr>(?:src|href))="(?P<path>(?:js|css)/[^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]*)?"')


def content_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:HASH_CHARS]


def main() -> int:
    changed = []
    for page in sorted(SITE.glob("*.html")):
        text = page.read_text()

        def stamp(match):
            asset = SITE / match.group("path")
            if not asset.is_file():
                raise FileNotFoundError(f"{page.name}: references missing {match.group('path')}")
            return f'{match.group("attr")}="{match.group("path")}?v={content_hash(asset)}"'

        stamped = REFERENCE.sub(stamp, text)
        if stamped != text:
            page.write_text(stamped)
            changed.append(page.name)
    print(f"stamped {len(changed)} pages: {changed}" if changed else "all pages already stamped", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
