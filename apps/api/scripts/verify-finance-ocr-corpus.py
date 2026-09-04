#!/usr/bin/env python3
"""Validate and render the synthetic Finance OCR corpus for visual QA."""

from __future__ import annotations

import json
import subprocess
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "test-fixtures" / "finance" / "accounting-reports"
VERIFY = CORPUS / "_verification"
PDF_PAGES = VERIFY / "pdf-pages"
CONTACTS = VERIFY / "contact-sheets"


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def render_pdfs(cases: list[dict]) -> list[tuple[str, str, Path]]:
    PDF_PAGES.mkdir(parents=True, exist_ok=True)
    pages: list[tuple[str, str, Path]] = []
    for case in cases:
        if not case["fileName"].endswith(".pdf"):
            continue
        prefix = PDF_PAGES / case["id"]
        subprocess.run(
            ["pdftoppm", "-png", "-r", "110", str(CORPUS / case["fileName"]), str(prefix)],
            check=True,
            capture_output=True,
        )
        for image_path in sorted(PDF_PAGES.glob(f'{case["id"]}-*.png')):
            pages.append((case["language"], f'{case["id"]} · {image_path.stem.rsplit("-", 1)[-1]}', image_path))
    return pages


def contact_sheet(items: list[tuple[str, Path]], destination: Path, columns: int = 2):
    if not items:
        return
    tile_width, tile_height = 1160, 820
    rows = (len(items) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_width, rows * tile_height), "#e8eef4")
    draw = ImageDraw.Draw(sheet)
    label_font = font(28, bold=True)
    for index, (label, image_path) in enumerate(items):
        row, column = divmod(index, columns)
        x, y = column * tile_width, row * tile_height
        draw.rectangle((x + 12, y + 12, x + tile_width - 12, y + tile_height - 12), fill="white")
        draw.text((x + 34, y + 27), label, fill="#10233f", font=label_font)
        image = Image.open(image_path).convert("RGB")
        image.thumbnail((tile_width - 68, tile_height - 96), Image.Resampling.LANCZOS)
        image_x = x + (tile_width - image.width) // 2
        image_y = y + 76 + (tile_height - 88 - image.height) // 2
        sheet.paste(image, (image_x, image_y))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, optimize=True)


def main():
    manifest = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
    cases = manifest["cases"]
    assert len(cases) == 30, f"Expected 30 cases, found {len(cases)}"
    assert Counter(case["language"] for case in cases) == {"fr": 10, "en": 10, "fi": 10}
    missing = [case["fileName"] for case in cases if not (CORPUS / case["fileName"]).is_file()]
    assert not missing, f"Missing fixtures: {missing}"

    pdf_pages = render_pdfs(cases)
    for language in ("fr", "en", "fi"):
        contact_sheet(
            [(label, image_path) for item_language, label, image_path in pdf_pages if item_language == language],
            CONTACTS / f"pdf-{language}.png",
        )

    xlsx_images = sorted((VERIFY / "xlsx").glob("*.png"))
    for language in ("fr", "en", "fi"):
        language_images = [image for image in xlsx_images if image.name.startswith(f"{language}-")]
        contact_sheet([(image.stem, image) for image in language_images], CONTACTS / f"xlsx-{language}.png")
    contact_sheet(
        [("Corpus manifest", VERIFY / "xlsx" / "corpus-manifest.png")],
        CONTACTS / "xlsx-manifest.png",
        columns=1,
    )

    scan_images = [(case["id"], CORPUS / case["fileName"]) for case in cases if case["fileName"].endswith(".png")]
    contact_sheet(scan_images, CONTACTS / "standalone-png-scans.png")
    print(
        json.dumps(
            {
                "reports": len(cases),
                "languages": Counter(case["language"] for case in cases),
                "pdfPagesRendered": len(pdf_pages),
                "xlsxSheetsRendered": len(xlsx_images),
                "contactSheets": len(list(CONTACTS.glob("*.png"))),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
