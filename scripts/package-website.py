#!/usr/bin/env python3
"""Empaqueta la web pública para cargarla directamente en Cloudflare Pages."""
from pathlib import Path
import argparse
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, default=ROOT / "dist/calirepsai-website.zip")
args = parser.parse_args()
source = ROOT / "website"
if not (source / "index.html").is_file() or not (source / "about.html").is_file():
    parser.error("Faltan las páginas de la web en website/.")
args.output.parent.mkdir(parents=True, exist_ok=True)
files = sorted(p for p in source.rglob("*") if p.is_file())
with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(source).as_posix())
print(f"{args.output}: {len(files)} archivos; index.html en la raíz del ZIP.")
