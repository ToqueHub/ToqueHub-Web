#!/usr/bin/env python3
"""Generate 100 synthetic business PDFs with field-level ground truth."""

from __future__ import annotations

import json
import shutil
import tempfile
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, LETTER, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

from prepare_corpus import PROFILES, ScanProfile, image_only_pdf, register_fonts


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_ROOT = REPO_ROOT / "tmp/pdfs/ocr-business-benchmark"
CORPUS_DIR = OUTPUT_ROOT / "corpus"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"


LABELS = {
    "fr": {
        "invoice": "FACTURE",
        "delivery_note": "BON DE LIVRAISON",
        "supplier_order": "CONFIRMATION DE COMMANDE",
        "order_confirmation": "ACCUSÉ DE COMMANDE",
        "receipt": "TICKET DE CAISSE",
        "supplier": "Fournisseur",
        "document_date": "Date du document",
        "delivery_date": "Date de livraison",
        "invoice_number": "Numéro de facture",
        "delivery_number": "Numéro de BL",
        "order_number": "Numéro de commande",
        "receipt_number": "Numéro du ticket",
        "reference": "Référence",
        "product": "Produit",
        "quantity": "Quantité",
        "unit": "Unité",
        "price": "Prix unitaire HT",
        "line_total": "Total HT",
        "subtotal": "Total HT",
        "tax": "TVA 14 %",
        "grand_total": "Total TTC",
        "freight": "FRAIS DE TRANSPORT",
        "discount": "REMISE",
    },
    "fi": {
        "invoice": "LASKU",
        "delivery_note": "LÄHETYSLUETTELO",
        "supplier_order": "TILAUSVAHVISTUS",
        "order_confirmation": "TILAUSVAHVISTUS",
        "receipt": "KUITTI",
        "supplier": "Toimittaja",
        "document_date": "Lasku päiväys",
        "delivery_date": "Toimituspäivä",
        "invoice_number": "Laskunumero",
        "delivery_number": "Lähetysnumero",
        "order_number": "Tilausnumero",
        "receipt_number": "Kuittinumero",
        "reference": "Nimike",
        "product": "Nimi",
        "quantity": "Määrä",
        "unit": "Yksikkö",
        "price": "á hinta",
        "line_total": "Yhteensä",
        "subtotal": "Veroton",
        "tax": "ALV 14 %",
        "grand_total": "Loppusumma",
        "freight": "RAHTI",
        "discount": "ALENNUS",
    },
    "en": {
        "invoice": "INVOICE",
        "delivery_note": "DELIVERY NOTE",
        "supplier_order": "SUPPLIER ORDER",
        "order_confirmation": "ORDER CONFIRMATION",
        "receipt": "RECEIPT",
        "supplier": "Supplier",
        "document_date": "Document date",
        "delivery_date": "Delivery date",
        "invoice_number": "Invoice number",
        "delivery_number": "Delivery note number",
        "order_number": "Order number",
        "receipt_number": "Receipt number",
        "reference": "SKU",
        "product": "Product",
        "quantity": "Quantity",
        "unit": "Unit",
        "price": "Unit price excl. VAT",
        "line_total": "Line total",
        "subtotal": "Subtotal",
        "tax": "VAT 14 %",
        "grand_total": "Grand total",
        "freight": "FREIGHT",
        "discount": "DISCOUNT",
    },
}


SUPPLIERS = {
    "fr": ["Maison du Marché SAS", "Aliments du Nord SARL", "Primeurs de la Côte SAS"],
    "fi": ["Pohjolan Ruokatukku Oy", "Suomen Keittiötarvike Oy", "Helsingin Vihannestukku Oy"],
    "en": ["Baltic Kitchen Supplies Ltd", "Northern Pantry Foods Ltd", "Coastal Produce Ltd"],
}


PRODUCTS = {
    "fr": [
        ("Farine de blé T45", "kg"),
        ("Crème entière 35 %", "L"),
        ("Pommes Gala", "kg"),
        ("Café en grains", "kg"),
        ("Saumon fumé", "kg"),
        ("Huile de colza", "L"),
        ("Oeufs plein air", "pièce"),
    ],
    "fi": [
        ("Vehnäjauho", "kg"),
        ("Kuohukerma 35 %", "L"),
        ("Gala-omena", "kg"),
        ("Kahvipavut", "kg"),
        ("Savulohi", "kg"),
        ("Rypsiöljy", "L"),
        ("Vapaan kanan munat", "kpl"),
    ],
    "en": [
        ("Bread flour", "kg"),
        ("Whipping cream 35%", "L"),
        ("Gala apples", "kg"),
        ("Coffee beans", "kg"),
        ("Smoked salmon", "kg"),
        ("Rapeseed oil", "L"),
        ("Free range eggs", "pc"),
    ],
}


def round_money(value: float) -> float:
    return round(value + 1e-9, 2)


def localized_number(value: float | None, language: str) -> str:
    if value is None:
        return "-"
    text = f"{value:.2f}"
    return text.replace(".", ",") if language in {"fr", "fi"} else text


def business_record(index: int) -> dict[str, Any]:
    languages = ["fr", "fi", "en"]
    document_types = [
        "invoice",
        "invoice",
        "invoice",
        "delivery_note",
        "delivery_note",
        "supplier_order",
        "order_confirmation",
        "receipt",
    ]
    language = languages[index % len(languages)]
    document_type = document_types[index % len(document_types)]
    labels = LABELS[language]
    supplier = SUPPLIERS[language][(index // 3) % len(SUPPLIERS[language])]
    doc_date = date(2026, 1, 3) + timedelta(days=index * 2)
    delivery_date = doc_date + timedelta(days=1 + index % 3)
    document_number = f"{document_type[:3].upper()}-{20260000 + index}"
    has_prices = document_type != "delivery_note" or index % 2 == 0
    row_count = 4 + index % 4
    rows = []
    for row_index in range(row_count):
        name, unit = PRODUCTS[language][row_index]
        quantity = round(1 + ((index + row_index * 2) % 8) + (0.5 if unit == "kg" else 0), 2)
        unit_price = round_money(1.25 + index * 0.09 + row_index * 1.17) if has_prices else None
        total = round_money(quantity * unit_price) if unit_price is not None else None
        line = {
            "reference": f"{810000 + index * 10 + row_index}",
            "label": name,
            "quantity": quantity,
            "unit": unit,
            "unitPrice": unit_price,
            "total": total,
            "vatRate": 14 if has_prices else None,
            "lotNumber": f"LOT-{index:03d}-{row_index + 1}" if row_index == 0 and index % 5 == 0 else None,
            "bestBeforeDate": (
                doc_date + timedelta(days=20 + row_index)
            ).isoformat()
            if row_index == 0 and index % 5 == 0
            else None,
        }
        rows.append(line)
    freight = round_money(4.5 + (index % 5)) if has_prices and index % 4 == 0 else 0.0
    discount = round_money(2.0 + index % 3) if has_prices and index % 7 == 0 else 0.0
    if has_prices:
        subtotal = round_money(sum(row["total"] or 0 for row in rows) + freight - discount)
        tax = round_money(subtotal * 0.14)
        grand_total = round_money(subtotal + tax)
    else:
        subtotal = tax = grand_total = None
    identifiers = {
        "invoiceNumber": document_number if document_type == "invoice" else None,
        "deliveryNoteNumber": document_number if document_type == "delivery_note" else None,
        "purchaseOrderNumber": document_number
        if document_type in {"supplier_order", "order_confirmation"}
        else None,
        "receiptNumber": document_number if document_type == "receipt" else None,
    }
    return {
        "index": index,
        "language": language,
        "documentType": document_type,
        "title": labels[document_type],
        "supplierName": supplier,
        "documentDate": doc_date.isoformat(),
        "deliveryDate": delivery_date.isoformat()
        if document_type in {"delivery_note", "supplier_order", "order_confirmation"}
        else None,
        **identifiers,
        "totals": {
            "totalExcludingTax": subtotal,
            "totalTax": tax,
            "totalIncludingTax": grand_total,
        },
        "lines": rows,
        "freight": freight or None,
        "discount": discount or None,
        "hasPrices": has_prices,
    }


def document_number_label(record: dict[str, Any]) -> str:
    labels = LABELS[record["language"]]
    if record["documentType"] == "invoice":
        return labels["invoice_number"]
    if record["documentType"] == "delivery_note":
        return labels["delivery_number"]
    if record["documentType"] in {"supplier_order", "order_confirmation"}:
        return labels["order_number"]
    return labels["receipt_number"]


def document_number(record: dict[str, Any]) -> str:
    return next(
        value
        for value in [
            record["invoiceNumber"],
            record["deliveryNoteNumber"],
            record["purchaseOrderNumber"],
            record["receiptNumber"],
        ]
        if value
    )


def page_size_for_template(template: int):
    return [A4, landscape(LETTER), (260, 720), landscape(A4), (432, 648)][template % 5]


def draw_business_page(
    destination: Path,
    record: dict[str, Any],
    template: int,
    *,
    include_header: bool = True,
    include_rows: bool = True,
    include_totals: bool = True,
) -> None:
    register_fonts()
    regular = "BenchmarkSans" if "BenchmarkSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    bold = "BenchmarkSans-Bold" if "BenchmarkSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    page_size = page_size_for_template(template)
    width, height = page_size
    labels = LABELS[record["language"]]
    receipt = template % 5 == 2
    margin = 18 if receipt else 34
    pdf = canvas.Canvas(str(destination), pagesize=page_size, pageCompression=1)

    if include_header:
        if template % 5 in {0, 3}:
            pdf.setFillColor(colors.HexColor("#183B4E"))
            pdf.rect(0, height - 90, width, 90, fill=1, stroke=0)
            pdf.setFillColor(colors.white)
        elif template % 5 == 1:
            pdf.setFillColor(colors.HexColor("#F2C14E"))
            pdf.rect(0, height - 68, width, 68, fill=1, stroke=0)
            pdf.setFillColor(colors.HexColor("#183B4E"))
        else:
            pdf.setFillColor(colors.HexColor("#183B4E"))
        pdf.setFont(bold, 17 if receipt else 23)
        pdf.drawString(margin, height - (42 if receipt else 50), record["title"])
        pdf.setFillColor(colors.black)
        top = height - (85 if receipt else 118)
        pdf.setFont(bold, 9 if receipt else 11)
        pdf.drawString(margin, top, f"{labels['supplier']}: {record['supplierName']}")
        pdf.setFont(regular, 8 if receipt else 9)
        pdf.drawString(margin, top - 18, f"{labels['document_date']}: {record['documentDate']}")
        if record["deliveryDate"]:
            pdf.drawString(margin, top - 34, f"{labels['delivery_date']}: {record['deliveryDate']}")
        pdf.drawString(
            margin,
            top - (50 if record["deliveryDate"] else 34),
            f"{document_number_label(record)}: {document_number(record)}",
        )
        table_top = top - (78 if record["deliveryDate"] else 62)
    else:
        pdf.setFillColor(colors.HexColor("#183B4E"))
        pdf.setFont(bold, 18)
        pdf.drawString(margin, height - 48, f"{record['title']} - page 2")
        pdf.setFillColor(colors.black)
        table_top = height - 92

    if include_rows:
        right = width - margin
        available = right - margin
        proportions = [0.16, 0.34, 0.12, 0.10, 0.14, 0.14]
        positions = [margin]
        for proportion in proportions:
            positions.append(positions[-1] + available * proportion)
        row_height = 24 if receipt else 22
        pdf.setFillColor(colors.HexColor("#E8EEF1"))
        pdf.rect(margin, table_top - row_height + 4, available, row_height, fill=1, stroke=0)
        pdf.setFillColor(colors.black)
        pdf.setFont(bold, 5.8 if receipt else 7.3)
        headers = [
            labels["reference"],
            labels["product"],
            labels["quantity"],
            labels["unit"],
            labels["price"],
            labels["line_total"],
        ]
        for column, header in enumerate(headers):
            pdf.drawString(positions[column] + 2, table_top - 10, header[:17])
        y = table_top - row_height
        pdf.setFont(regular, 5.8 if receipt else 7.6)
        for row_index, row in enumerate(record["lines"]):
            if row_index % 2:
                pdf.setFillColor(colors.HexColor("#F6F8F9"))
                pdf.rect(margin, y - row_height + 4, available, row_height, fill=1, stroke=0)
            pdf.setFillColor(colors.black)
            values = [
                row["reference"],
                row["label"],
                localized_number(row["quantity"], record["language"]),
                row["unit"],
                localized_number(row["unitPrice"], record["language"]),
                localized_number(row["total"], record["language"]),
            ]
            for column, value in enumerate(values):
                pdf.drawString(positions[column] + 2, y - 9, str(value)[:30])
            if row["lotNumber"]:
                pdf.setFont(regular, 5.5 if receipt else 6.5)
                pdf.drawString(
                    positions[1] + 2,
                    y - 18,
                    f"Lot {row['lotNumber']} - DDM {row['bestBeforeDate']}",
                )
                pdf.setFont(regular, 5.8 if receipt else 7.6)
            y -= row_height
        if record["freight"]:
            pdf.drawString(margin + 2, y - 9, labels["freight"])
            pdf.drawRightString(right - 2, y - 9, localized_number(record["freight"], record["language"]))
            y -= row_height
        if record["discount"]:
            pdf.drawString(margin + 2, y - 9, labels["discount"])
            pdf.drawRightString(right - 2, y - 9, f"-{localized_number(record['discount'], record['language'])}")
            y -= row_height
    else:
        y = table_top
        right = width - margin

    if include_totals:
        pdf.setStrokeColor(colors.HexColor("#90A4AE"))
        pdf.line(margin, y + 5, right, y + 5)
        pdf.setFillColor(colors.black)
        pdf.setFont(bold, 8 if receipt else 10)
        totals = record["totals"]
        if totals["totalExcludingTax"] is None:
            pdf.drawRightString(right, y - 15, "Document sans prix")
        else:
            pdf.drawRightString(
                right,
                y - 12,
                f"{labels['subtotal']}: {localized_number(totals['totalExcludingTax'], record['language'])} EUR",
            )
            pdf.drawRightString(
                right,
                y - 28,
                f"{labels['tax']}: {localized_number(totals['totalTax'], record['language'])} EUR",
            )
            pdf.setFont(bold, 10 if receipt else 12)
            pdf.drawRightString(
                right,
                y - 48,
                f"{labels['grand_total']}: {localized_number(totals['totalIncludingTax'], record['language'])} EUR",
            )
    pdf.showPage()
    pdf.save()


def combine_pages(first: Path, second: Path, destination: Path) -> None:
    writer = PdfWriter()
    writer.add_page(PdfReader(str(first)).pages[0])
    writer.add_page(PdfReader(str(second)).pages[0])
    with destination.open("wb") as stream:
        writer.write(stream)


def metadata(path: Path) -> dict[str, Any]:
    reader = PdfReader(str(path))
    return {
        "byteSize": path.stat().st_size,
        "pageCount": len(reader.pages),
        "pageSizes": [
            {
                "widthPt": round(float(page.mediabox.width), 3),
                "heightPt": round(float(page.mediabox.height), 3),
            }
            for page in reader.pages
        ],
    }


def main() -> None:
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    CORPUS_DIR.mkdir(parents=True)
    category_sequence = [
        *("native_text" for _ in range(40)),
        *("scan_clean" for _ in range(15)),
        *("scan_lowres" for _ in range(15)),
        *("scan_skewed" for _ in range(10)),
        *("scan_noisy" for _ in range(8)),
        *("scan_compressed" for _ in range(7)),
        *("mixed" for _ in range(5)),
    ]
    documents = []
    with tempfile.TemporaryDirectory(prefix="toquehub-business-corpus-") as temp:
        work_dir = Path(temp)
        for index, category in enumerate(category_sequence):
            test_id = f"business-{index + 1:03d}"
            record = business_record(index)
            template = index % 5
            native = work_dir / f"{test_id}-native.pdf"
            destination = CORPUS_DIR / f"{test_id}.pdf"
            if category == "mixed":
                page_one = work_dir / f"{test_id}-page1.pdf"
                page_two_native = work_dir / f"{test_id}-page2-native.pdf"
                page_two_scan = work_dir / f"{test_id}-page2-scan.pdf"
                draw_business_page(page_one, record, template, include_totals=False)
                draw_business_page(
                    page_two_native,
                    record,
                    template,
                    include_header=False,
                    include_rows=False,
                    include_totals=True,
                )
                image_only_pdf(page_two_native, page_two_scan, PROFILES["scan_lowres"], work_dir)
                combine_pages(page_one, page_two_scan, destination)
                transformation: Any = {
                    "page1": "native_text",
                    "page2": PROFILES["scan_lowres"].__dict__,
                }
                expected_route = "ocr"
            else:
                draw_business_page(native, record, template)
                if category == "native_text":
                    shutil.copy2(native, destination)
                    transformation = None
                    expected_route = "local"
                else:
                    profile = PROFILES[category]
                    if category == "scan_skewed" and index % 2:
                        profile = ScanProfile(**{**profile.__dict__, "rotation": -profile.rotation})
                    image_only_pdf(native, destination, profile, work_dir)
                    transformation = profile.__dict__
                    expected_route = "ocr"
            documents.append(
                {
                    "id": test_id,
                    "filename": destination.name,
                    "category": category,
                    "template": ["classic", "landscape", "receipt", "dense", "compact"][template],
                    "language": record["language"],
                    "documentType": record["documentType"],
                    "expectedRouting": expected_route,
                    "transformation": transformation,
                    "groundTruth": record,
                    **metadata(destination),
                }
            )
            if (index + 1) % 10 == 0:
                print(f"Generated {index + 1}/100")
    counts: dict[str, int] = {}
    for document in documents:
        counts[document["category"]] = counts.get(document["category"], 0) + 1
    MANIFEST_PATH.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "documentCount": len(documents),
                "pageCount": sum(document["pageCount"] for document in documents),
                "categoryCounts": counts,
                "documents": documents,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(MANIFEST_PATH)


if __name__ == "__main__":
    main()
