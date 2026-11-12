#!/usr/bin/env python3
"""Fail if an in-page link (#id) or a local asset referenced by index.html is missing."""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
ids = set(re.findall(r'\bid="([^"]+)"', html))
missing = [h for h in re.findall(r'href="#([^"]*)"', html) if h and h not in ids]
assets = [a for a in re.findall(r'(?:src|href)="(assets/[^"#]+)"', html) if not (root / a).exists()]
for m in missing:
    print(f"missing anchor: #{m}")
for a in assets:
    print(f"missing asset: {a}")
if missing or assets:
    sys.exit(1)
print(f"ok: {len(ids)} ids, all anchors and assets resolve")
