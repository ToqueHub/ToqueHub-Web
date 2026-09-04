#!/usr/bin/env python3
"""Build a deterministic 100-document corpus for PDF routing/OCR comparison."""

from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageEnhance, ImageFilter
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, LETTER, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


SEED = 20260802
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_SOURCE_ROOT = REPO_ROOT / "tmp/opendataloader-bench"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "tmp/pdfs/ocr-benchmark"
ARIAL = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
ARIAL_BOLD = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
HAND_FONT = Path("/Library/Fonts/PatrickHand_Regular.ttf")


@dataclass(frozen=True)
class ScanProfile:
    category: str
    dpi: int
    jpeg_quality: int
    rotation: float = 0.0
    blur_radius: float = 0.0
    noise_opacity: float = 0.0
    contrast: float = 1.0


PROFILES = {
    "scan_clean": ScanProfile("scan_clean", 200, 92),
    "scan_lowres": ScanProfile("scan_lowres", 96, 55, contrast=0.92),
    "scan_skewed": ScanProfile("scan_skewed", 150, 72, rotation=2.8, blur_radius=0.35),
    "scan_noisy": ScanProfile(
        "scan_noisy", 130, 42, rotation=-1.2, blur_radius=1.0, noise_opacity=0.22, contrast=0.82
    ),
    "scan_compressed": ScanProfile(
        "scan_compressed", 120, 18, blur_radius=0.55, contrast=0.88
    ),
}


def register_fonts() -> None:
    if ARIAL.is_file():
        pdfmetrics.registerFont(TTFont("BenchmarkSans", str(ARIAL)))
    if ARIAL_BOLD.is_file():
        pdfmetrics.registerFont(TTFont("BenchmarkSans-Bold", str(ARIAL_BOLD)))
    if HAND_FONT.is_file():
        pdfmetrics.registerFont(TTFont("BenchmarkHand", str(HAND_FONT)))


def font(name: str, fallback: str) -> str:
    return name if name in pdfmetrics.getRegisteredFontNames() else fallback


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def source_layout(document: dict[str, Any]) -> str:
    if document.get("pagesWithTables"):
        return "table"
    if document.get("pagesWithColumns"):
        return "multi_column"
    return "simple"


def render_first_page(source_pdf: Path, dpi: int, destination: Path) -> None:
    prefix = destination.with_suffix("")
    subprocess.run(
        [
            "pdftoppm",
            "-f",
            "1",
            "-l",
            "1",
            "-singlefile",
            "-r",
            str(dpi),
            "-png",
            str(source_pdf),
            str(prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


def degraded_image(source_pdf: Path, profile: ScanProfile, work_dir: Path) -> Image.Image:
    rendered = work_dir / f"render-{source_pdf.stem}-{profile.category}.png"
    render_first_page(source_pdf, profile.dpi, rendered)
    image = Image.open(rendered).convert("L")
    if profile.contrast != 1.0:
        image = ImageEnhance.Contrast(image).enhance(profile.contrast)
    if profile.blur_radius:
        image = image.filter(ImageFilter.GaussianBlur(profile.blur_radius))
    if profile.noise_opacity:
        noise = Image.effect_noise(image.size, 22).convert("L")
        image = Image.blend(image, noise, profile.noise_opacity)
    if profile.rotation:
        image = image.rotate(profile.rotation, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=255)

    compressed = BytesIO()
    image.save(compressed, format="JPEG", quality=profile.jpeg_quality, optimize=True)
    compressed.seek(0)
    return Image.open(compressed).copy()


def image_only_pdf(source_pdf: Path, destination: Path, profile: ScanProfile, work_dir: Path) -> None:
    source_page = PdfReader(str(source_pdf)).pages[0]
    page_width = float(source_page.mediabox.width)
    page_height = float(source_page.mediabox.height)
    image = degraded_image(source_pdf, profile, work_dir)
    image_width, image_height = image.size
    scale = min(page_width / image_width, page_height / image_height)
    draw_width = image_width * scale
    draw_height = image_height * scale
    x = (page_width - draw_width) / 2
    y = (page_height - draw_height) / 2
    destination.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(destination), pagesize=(page_width, page_height), pageCompression=1)
    pdf.drawImage(ImageReader(image), x, y, width=draw_width, height=draw_height, mask="auto")
    pdf.showPage()
    pdf.save()


def combine_mixed(native_pdf: Path, scanned_pdf: Path, destination: Path) -> None:
    writer = PdfWriter()
    writer.add_page(PdfReader(str(native_pdf)).pages[0])
    writer.add_page(PdfReader(str(scanned_pdf)).pages[0])
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as stream:
        writer.write(stream)


def money(value: float, language: str) -> str:
    decimal = f"{value:,.2f}"
    if language in {"fr", "fi"}:
        decimal = decimal.replace(",", " ").replace(".", ",")
    return decimal


def synthetic_content(index: int) -> dict[str, Any]:
    languages = ["fr", "fi", "en"]
    language = languages[index % len(languages)]
    document_types = ["invoice", "delivery_note", "supplier_order", "receipt", "catalog"]
    document_type = document_types[index % len(document_types)]
    labels = {
        "fr": {
            "invoice": "FACTURE",
            "delivery_note": "BON DE LIVRAISON",
            "supplier_order": "CONFIRMATION DE COMMANDE",
            "receipt": "TICKET DE CAISSE",
            "catalog": "CATALOGUE FOURNISSEUR",
            "ref": "Réf.",
            "product": "Produit",
            "qty": "Quantité",
            "unit": "Unité",
            "price": "Prix HT",
            "total": "Total",
            "date": "Date",
            "note": "Livraison contrôlée - réserve sur deux cartons.",
        },
        "fi": {
            "invoice": "LASKU",
            "delivery_note": "LÄHETYSLUETTELO",
            "supplier_order": "TILAUSVAHVISTUS",
            "receipt": "KUITTI",
            "catalog": "TUOTELUETTELO",
            "ref": "Nimike",
            "product": "Tuote",
            "qty": "Määrä",
            "unit": "Yksikkö",
            "price": "á hinta",
            "total": "Yhteensä",
            "date": "Päiväys",
            "note": "Toimitus tarkastettu - kaksi laatikkoa tarkistettava.",
        },
        "en": {
            "invoice": "INVOICE",
            "delivery_note": "DELIVERY NOTE",
            "supplier_order": "ORDER CONFIRMATION",
            "receipt": "RECEIPT",
            "catalog": "SUPPLIER CATALOG",
            "ref": "SKU",
            "product": "Product",
            "qty": "Quantity",
            "unit": "Unit",
            "price": "Unit price",
            "total": "Total",
            "date": "Date",
            "note": "Delivery checked - review two damaged cartons.",
        },
    }[language]
    supplier = {
        "fr": "Maison du Marché SAS",
        "fi": "Pohjolan Ruokatukku Oy",
        "en": "Baltic Kitchen Supplies Ltd",
    }[language]
    products = {
        "fr": ["Farine T45", "Crème entière 35 %", "Pommes Gala", "Café en grains", "Saumon fumé"],
        "fi": ["Vehnäjauho", "Kuohukerma 35 %", "Gala-omena", "Kahvipavut", "Savulohi"],
        "en": ["Bread flour", "Whipping cream 35%", "Gala apples", "Coffee beans", "Smoked salmon"],
    }[language]
    rows = []
    for row_index in range(4 + index % 2):
        quantity = 1 + ((index + row_index * 3) % 9)
        unit = ["kg", "L", "kpl" if language == "fi" else "pc"][row_index % 3]
        unit_price = round(1.35 + index * 0.17 + row_index * 1.13, 2)
        rows.append(
            {
                "reference": f"{7000 + index * 10 + row_index}",
                "product": products[row_index],
                "quantity": quantity,
                "unit": unit,
                "unit_price": unit_price,
                "line_total": round(quantity * unit_price, 2),
            }
        )
    subtotal = round(sum(row["line_total"] for row in rows), 2)
    tax = round(subtotal * 0.14, 2)
    return {
        "language": language,
        "document_type": document_type,
        "title": labels[document_type],
        "labels": labels,
        "supplier": supplier,
        "number": f"TH-{2026000 + index:07d}",
        "date": (date(2026, 1, 10) + timedelta(days=index * 7)).isoformat(),
        "rows": rows,
        "subtotal": subtotal,
        "tax": tax,
        "grand_total": round(subtotal + tax, 2),
        "note": labels["note"],
    }


def synthetic_markdown(content: dict[str, Any]) -> str:
    labels = content["labels"]
    header = (
        f"# {content['title']}\n\n"
        f"**{content['supplier']}**  \n"
        f"{labels['date']}: {content['date']}  \n"
        f"No: {content['number']}\n\n"
    )
    table = (
        f"| {labels['ref']} | {labels['product']} | {labels['qty']} | {labels['unit']} | {labels['price']} | {labels['total']} |\n"
        "|---|---|---:|---|---:|---:|\n"
    )
    for row in content["rows"]:
        table += (
            f"| {row['reference']} | {row['product']} | {row['quantity']} | {row['unit']} | "
            f"{money(row['unit_price'], content['language'])} | {money(row['line_total'], content['language'])} |\n"
        )
    totals = (
        f"\nSous-total / Veroton / Subtotal: {money(content['subtotal'], content['language'])} EUR  \n"
        f"TVA / ALV / VAT 14 %: {money(content['tax'], content['language'])} EUR  \n"
        f"**{labels['total']}: {money(content['grand_total'], content['language'])} EUR**\n\n"
        f"Note: {content['note']}"
    )
    return header + table + totals


def draw_synthetic_pdf(destination: Path, content: dict[str, Any], template_index: int) -> str:
    register_fonts()
    sans = font("BenchmarkSans", "Helvetica")
    bold = font("BenchmarkSans-Bold", "Helvetica-Bold")
    hand = font("BenchmarkHand", sans)
    template = template_index % 5
    if template == 0:
        page_size = A4
    elif template == 1:
        page_size = landscape(LETTER)
    elif template == 2:
        page_size = (250, 700)
    elif template == 3:
        page_size = landscape(A4)
    else:
        page_size = (432, 648)
    width, height = page_size
    pdf = canvas.Canvas(str(destination), pagesize=page_size, pageCompression=1)

    if template in {0, 3}:
        pdf.setFillColor(colors.HexColor("#183B4E"))
        pdf.rect(0, height - 95, width, 95, fill=1, stroke=0)
        pdf.setFillColor(colors.white)
        pdf.setFont(bold, 24 if template == 0 else 20)
        pdf.drawString(36, height - 54, content["title"])
        pdf.setFont(sans, 9)
        pdf.drawRightString(width - 36, height - 47, content["number"])
        pdf.drawRightString(width - 36, height - 64, content["date"])
    elif template == 1:
        pdf.setFillColor(colors.HexColor("#F2C14E"))
        pdf.rect(0, 0, 58, height, fill=1, stroke=0)
        pdf.setFillColor(colors.HexColor("#212121"))
        pdf.setFont(bold, 23)
        pdf.drawString(82, height - 50, content["title"])
    elif template == 2:
        pdf.setFont(bold, 16)
        pdf.drawCentredString(width / 2, height - 38, content["supplier"])
        pdf.setFont(sans, 11)
        pdf.drawCentredString(width / 2, height - 58, content["title"])
        pdf.setDash(2, 2)
        pdf.line(18, height - 70, width - 18, height - 70)
        pdf.setDash()
    else:
        pdf.setStrokeColor(colors.HexColor("#455A64"))
        pdf.setLineWidth(2)
        pdf.rect(24, 24, width - 48, height - 48, fill=0, stroke=1)
        pdf.setFont(bold, 20)
        pdf.drawString(42, height - 58, content["title"])

    top = height - (122 if template in {0, 3} else 85)
    left = 28 if template == 2 else 42 if template == 4 else 82 if template == 1 else 36
    right = width - (18 if template == 2 else 36)
    pdf.setFillColor(colors.black)
    pdf.setFont(bold, 11 if template != 2 else 9)
    if template != 2:
        pdf.drawString(left, top, content["supplier"])
    pdf.setFont(sans, 8 if template == 2 else 9)
    pdf.drawString(left, top - 18, f"{content['labels']['date']}: {content['date']}")
    pdf.drawString(left, top - 34, f"No: {content['number']}")

    table_top = top - 62
    headers = [
        content["labels"]["ref"],
        content["labels"]["product"],
        content["labels"]["qty"],
        content["labels"]["unit"],
        content["labels"]["price"],
        content["labels"]["total"],
    ]
    available = right - left
    proportions = [0.14, 0.32, 0.12, 0.10, 0.16, 0.16]
    x_positions = [left]
    for proportion in proportions:
        x_positions.append(x_positions[-1] + available * proportion)
    row_height = 22 if template != 2 else 26
    pdf.setFillColor(colors.HexColor("#E8EEF1"))
    pdf.rect(left, table_top - row_height + 5, available, row_height, fill=1, stroke=0)
    pdf.setFillColor(colors.black)
    pdf.setFont(bold, 6.5 if template == 2 else 7.5)
    for column, label in enumerate(headers):
        pdf.drawString(x_positions[column] + 3, table_top - 10, str(label)[:14])
    pdf.setFont(sans, 6.5 if template == 2 else 8)
    y = table_top - row_height
    for row_number, row in enumerate(content["rows"]):
        if row_number % 2:
            pdf.setFillColor(colors.HexColor("#F7F9FA"))
            pdf.rect(left, y - row_height + 5, available, row_height, fill=1, stroke=0)
        pdf.setFillColor(colors.black)
        values = [
            row["reference"],
            row["product"],
            str(row["quantity"]),
            row["unit"],
            money(row["unit_price"], content["language"]),
            money(row["line_total"], content["language"]),
        ]
        for column, value in enumerate(values):
            pdf.drawString(x_positions[column] + 3, y - 9, str(value)[:28])
        y -= row_height

    pdf.setStrokeColor(colors.HexColor("#90A4AE"))
    pdf.line(left, y + 7, right, y + 7)
    pdf.setFillColor(colors.black)
    pdf.setFont(bold, 9 if template != 2 else 8)
    total_text = f"{content['labels']['total']}: {money(content['grand_total'], content['language'])} EUR"
    pdf.drawRightString(right, y - 12, total_text)
    pdf.setFont(sans, 7 if template == 2 else 8)
    pdf.drawRightString(
        right,
        y - 28,
        f"VAT / ALV / TVA 14 %: {money(content['tax'], content['language'])} EUR",
    )
    if template in {3, 4}:
        pdf.setFillColor(colors.HexColor("#0B6E4F"))
        pdf.setFont(hand, 12 if template == 4 else 14)
        pdf.saveState()
        pdf.translate(left + 8, max(42, y - 70))
        pdf.rotate(-4)
        pdf.drawString(0, 0, content["note"][:72])
        pdf.restoreState()
    else:
        pdf.setFillColor(colors.HexColor("#455A64"))
        pdf.setFont(sans, 7 if template == 2 else 8)
        pdf.drawString(left, max(28, y - 58), content["note"][:82])
    pdf.showPage()
    pdf.save()
    return synthetic_markdown(content)


def document_metadata(path: Path) -> dict[str, Any]:
    reader = PdfReader(str(path))
    sizes = []
    for page in reader.pages:
        sizes.append(
            {
                "widthPt": round(float(page.mediabox.width), 3),
                "heightPt": round(float(page.mediabox.height), 3),
            }
        )
    return {"byteSize": path.stat().st_size, "pageCount": len(reader.pages), "pageSizes": sizes}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    output_root = args.output_root.resolve()
    corpus_dir = output_root / "corpus"
    truth_dir = output_root / "ground-truth/markdown"
    manifest_path = output_root / "manifest.json"
    inventory_path = output_root / "source-inventory.json"
    if manifest_path.exists() and not args.force:
        raise SystemExit(f"Corpus already exists at {output_root}; pass --force to rebuild it.")
    if not inventory_path.is_file():
        raise SystemExit(f"Missing source inventory: {inventory_path}")
    if args.force:
        for generated in (corpus_dir, output_root / "ground-truth"):
            if generated.exists():
                shutil.rmtree(generated)
    corpus_dir.mkdir(parents=True, exist_ok=True)
    truth_dir.mkdir(parents=True, exist_ok=True)

    inventory = load_json(inventory_path)["documents"]
    eligible = [
        document
        for document in inventory
        if document.get("success")
        and document.get("pdfType") == "TextBased"
        and not document.get("hasEncodingIssues")
    ]
    buckets = {
        "table": [document for document in eligible if source_layout(document) == "table"],
        "multi_column": [
            document for document in eligible if source_layout(document) == "multi_column"
        ],
        "simple": [document for document in eligible if source_layout(document) == "simple"],
    }
    rng = random.Random(SEED)
    for values in buckets.values():
        rng.shuffle(values)

    selected_ids: set[str] = set()

    def take(layout: str) -> dict[str, Any]:
        while buckets[layout]:
            document = buckets[layout].pop()
            if document["id"] not in selected_ids:
                selected_ids.add(document["id"])
                return document
        raise RuntimeError(f"Not enough source documents in {layout}")

    entries: list[dict[str, Any]] = []
    benchmark_number = 0

    def next_id() -> str:
        nonlocal benchmark_number
        benchmark_number += 1
        return f"test-{benchmark_number:03d}"

    with tempfile.TemporaryDirectory(prefix="toquehub-ocr-corpus-") as temporary:
        work_dir = Path(temporary)

        # 30 untouched public documents: equal coverage of tables, columns and simple layouts.
        for layout in ("table", "multi_column", "simple"):
            for _ in range(10):
                document = take(layout)
                test_id = next_id()
                source_pdf = source_root / "pdfs" / document["filename"]
                destination = corpus_dir / f"{test_id}.pdf"
                shutil.copy2(source_pdf, destination)
                truth_source = source_root / "ground-truth/markdown" / f"{document['id']}.md"
                write_text(truth_dir / f"{test_id}.md", truth_source.read_text(encoding="utf-8"))
                entries.append(
                    {
                        "id": test_id,
                        "filename": destination.name,
                        "origin": "opendataloader-bench",
                        "sourceIds": [document["id"]],
                        "category": "native_text",
                        "layout": layout,
                        "expectedRouting": "local",
                        "expectedPdfType": "TextBased",
                        "transformation": None,
                        **document_metadata(destination),
                    }
                )

        # 50 scanned public documents with varied degradation profiles and layouts.
        public_scan_counts = {
            "scan_clean": 15,
            "scan_lowres": 15,
            "scan_skewed": 10,
            "scan_noisy": 5,
            "scan_compressed": 5,
        }
        layout_cycle = ["table", "multi_column", "simple"]
        cycle_index = 0
        for category, count in public_scan_counts.items():
            for item_index in range(count):
                layout = layout_cycle[cycle_index % len(layout_cycle)]
                cycle_index += 1
                document = take(layout)
                test_id = next_id()
                source_pdf = source_root / "pdfs" / document["filename"]
                destination = corpus_dir / f"{test_id}.pdf"
                profile = PROFILES[category]
                if category == "scan_skewed" and item_index % 2:
                    profile = ScanProfile(**{**profile.__dict__, "rotation": -profile.rotation})
                image_only_pdf(source_pdf, destination, profile, work_dir)
                truth_source = source_root / "ground-truth/markdown" / f"{document['id']}.md"
                write_text(truth_dir / f"{test_id}.md", truth_source.read_text(encoding="utf-8"))
                entries.append(
                    {
                        "id": test_id,
                        "filename": destination.name,
                        "origin": "opendataloader-bench",
                        "sourceIds": [document["id"]],
                        "category": category,
                        "layout": layout,
                        "expectedRouting": "ocr",
                        "expectedPdfType": "ImageBasedOrScanned",
                        "transformation": profile.__dict__,
                        **document_metadata(destination),
                    }
                )

        # 15 domain documents: invoices, delivery notes, orders, receipts and catalogs.
        synthetic_categories = [
            *("native_text" for _ in range(5)),
            *("scan_clean" for _ in range(3)),
            *("scan_lowres" for _ in range(3)),
            *("scan_skewed" for _ in range(2)),
            "scan_noisy",
            "scan_compressed",
        ]
        for synthetic_index, category in enumerate(synthetic_categories):
            test_id = next_id()
            native_synthetic = work_dir / f"synthetic-{synthetic_index:02d}.pdf"
            content = synthetic_content(synthetic_index)
            ground_truth = draw_synthetic_pdf(native_synthetic, content, synthetic_index)
            destination = corpus_dir / f"{test_id}.pdf"
            if category == "native_text":
                shutil.copy2(native_synthetic, destination)
                transformation = None
                expected_routing = "local"
                expected_pdf_type = "TextBased"
            else:
                profile = PROFILES[category]
                if category == "scan_skewed" and synthetic_index % 2:
                    profile = ScanProfile(**{**profile.__dict__, "rotation": -profile.rotation})
                image_only_pdf(native_synthetic, destination, profile, work_dir)
                transformation = profile.__dict__
                expected_routing = "ocr"
                expected_pdf_type = "ImageBasedOrScanned"
            write_text(truth_dir / f"{test_id}.md", ground_truth)
            entries.append(
                {
                    "id": test_id,
                    "filename": destination.name,
                    "origin": "synthetic-toquehub-business",
                    "sourceIds": [f"synthetic-{synthetic_index:02d}"],
                    "category": category,
                    "layout": ["classic", "landscape", "receipt", "dense", "compact"][
                        synthetic_index % 5
                    ],
                    "language": content["language"],
                    "documentType": content["document_type"],
                    "expectedRouting": expected_routing,
                    "expectedPdfType": expected_pdf_type,
                    "transformation": transformation,
                    **document_metadata(destination),
                }
            )

        # Five two-page mixed PDFs: one native page followed by one low-resolution scan.
        for pair_index in range(5):
            native_layout = layout_cycle[(pair_index * 2) % len(layout_cycle)]
            scan_layout = layout_cycle[(pair_index * 2 + 1) % len(layout_cycle)]
            native_document = take(native_layout)
            scan_document = take(scan_layout)
            native_pdf = source_root / "pdfs" / native_document["filename"]
            scan_source = source_root / "pdfs" / scan_document["filename"]
            scanned_page = work_dir / f"mixed-scan-{pair_index}.pdf"
            image_only_pdf(scan_source, scanned_page, PROFILES["scan_lowres"], work_dir)
            test_id = next_id()
            destination = corpus_dir / f"{test_id}.pdf"
            combine_mixed(native_pdf, scanned_page, destination)
            native_truth = (
                source_root / "ground-truth/markdown" / f"{native_document['id']}.md"
            ).read_text(encoding="utf-8")
            scan_truth = (
                source_root / "ground-truth/markdown" / f"{scan_document['id']}.md"
            ).read_text(encoding="utf-8")
            write_text(
                truth_dir / f"{test_id}.md",
                f"{native_truth.rstrip()}\n\n<!-- Page 2 -->\n\n{scan_truth.rstrip()}",
            )
            entries.append(
                {
                    "id": test_id,
                    "filename": destination.name,
                    "origin": "opendataloader-bench",
                    "sourceIds": [native_document["id"], scan_document["id"]],
                    "category": "mixed",
                    "layout": f"{native_layout}+{scan_layout}",
                    "expectedRouting": "ocr",
                    "expectedPdfType": "Mixed",
                    "transformation": {
                        "page1": "native_text",
                        "page2": PROFILES["scan_lowres"].__dict__,
                    },
                    **document_metadata(destination),
                }
            )

    if len(entries) != 100 or benchmark_number != 100:
        raise RuntimeError(f"Expected 100 documents, generated {len(entries)}")
    category_counts: dict[str, int] = {}
    layout_counts: dict[str, int] = {}
    for entry in entries:
        category_counts[entry["category"]] = category_counts.get(entry["category"], 0) + 1
        layout_counts[entry["layout"]] = layout_counts.get(entry["layout"], 0) + 1
    manifest = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "seed": SEED,
        "documentCount": len(entries),
        "sourceCorpus": {
            "name": "opendataloader-bench",
            "commit": "7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109",
            "uniquePublicSourcePages": len(selected_ids),
            "syntheticBusinessDocuments": 15,
        },
        "categoryCounts": category_counts,
        "layoutCounts": layout_counts,
        "documents": entries,
    }
    write_text(manifest_path, json.dumps(manifest, indent=2, ensure_ascii=False))
    print(json.dumps({"manifest": str(manifest_path), "categoryCounts": category_counts}, indent=2))


if __name__ == "__main__":
    main()
