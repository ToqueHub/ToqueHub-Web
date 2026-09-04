#!/usr/bin/env python3
"""Generate deterministic synthetic accounting statements for Finance OCR regression tests."""

from __future__ import annotations

import csv
import json
import math
import random
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-fixtures" / "finance" / "accounting-reports"
VERIFY = OUTPUT / "_verification"

LANGUAGES = {
    "fr": {
        "title": "COMPTE DE RÉSULTAT",
        "period": "Exercice du {start} au {end}",
        "unit": "Montants en {unit}",
        "code": "Compte",
        "label": "Libellé",
        "amount": "Montant",
        "labels": {
            "revenue": "Chiffre d'affaires",
            "materials": "Achats de matières et marchandises",
            "payroll": "Salaires et charges sociales",
            "rent": "Loyers et charges locatives",
            "energy": "Énergie et services",
            "marketing": "Marketing et communication",
            "depreciation": "Dotations aux amortissements",
            "opex": "Total charges d'exploitation",
            "operating": "Résultat d'exploitation",
            "financial": "Charges financières",
            "tax": "Impôts sur les bénéfices",
            "net": "Résultat net",
        },
    },
    "en": {
        "title": "INCOME STATEMENT",
        "period": "Financial year from {start} to {end}",
        "unit": "Amounts in {unit}",
        "code": "Account",
        "label": "Description",
        "amount": "Amount",
        "labels": {
            "revenue": "Revenue and turnover",
            "materials": "Materials and merchandise purchases",
            "payroll": "Wages, salaries and social costs",
            "rent": "Rent and occupancy costs",
            "energy": "Energy and utilities",
            "marketing": "Marketing and communication",
            "depreciation": "Depreciation and amortisation",
            "opex": "Total operating expenses",
            "operating": "Operating profit (loss)",
            "financial": "Financial expenses",
            "tax": "Income tax expense",
            "net": "Net profit (loss)",
        },
    },
    "fi": {
        "title": "TULOSLASKELMA",
        "period": "Tilikausi {start}–{end}",
        "unit": "Luvut yksikössä {unit}",
        "code": "Tili",
        "label": "Selite",
        "amount": "Määrä",
        "labels": {
            "revenue": "Liikevaihto",
            "materials": "Aineet, tarvikkeet ja tavaraostot",
            "payroll": "Palkat ja henkilösivukulut",
            "rent": "Vuokrat ja toimitilakulut",
            "energy": "Energia ja palvelut",
            "marketing": "Markkinointi ja viestintä",
            "depreciation": "Poistot ja arvonalentumiset",
            "opex": "Liiketoiminnan kulut yhteensä",
            "operating": "Liikevoitto (-tappio)",
            "financial": "Rahoituskulut",
            "tax": "Tuloverot",
            "net": "Tilikauden voitto (tappio)",
        },
    },
}

FORMATS = [
    "pdf_text",
    "pdf_multipage",
    "pdf_scan",
    "pdf_scan_rotated",
    "xlsx",
    "xlsx_multisheet",
    "csv_trial_balance",
    "png_scan",
    "pdf_thousands",
    "pdf_millions",
]
SIZES = ["small", "medium", "large", "giant"]
SIZE_REVENUE = {"small": 180_000, "medium": 2_400_000, "large": 48_000_000, "giant": 1_850_000_000}


def fiscal_period(index: int, language_index: int) -> tuple[date, date]:
    year = 2017 + ((index + language_index * 3) % 9)
    starts = [(1, 1), (6, 1), (7, 1), (4, 1)]
    month, day = starts[(index + language_index) % len(starts)]
    start = date(year, month, day)
    end_year = year if month == 1 else year + 1
    end_month = 12 if month == 1 else month - 1
    if end_month in (4, 6, 9, 11):
        end_day = 30
    elif end_month == 2:
        end_day = 29 if end_year % 4 == 0 else 28
    else:
        end_day = 31
    return start, date(end_year, end_month, end_day)


def build_cases() -> list[dict]:
    cases: list[dict] = []
    companies = {
        "fr": ["Bistro Lumière SAS", "Maison Épure SARL", "Groupe Horizon SA"],
        "en": ["Northstar Foods Ltd", "Harbour Kitchens plc", "Atlas Hospitality Group"],
        "fi": ["Kahvila Revontuli Oy", "Pohjolan Ruoka Oy", "Suomen Ravintolat Oyj"],
    }
    for language_index, language in enumerate(("fr", "en", "fi")):
        for index, format_name in enumerate(FORMATS, start=1):
            size = SIZES[(index + language_index - 1) % len(SIZES)]
            revenue = SIZE_REVENUE[size] * (1 + language_index * 0.07 + index * 0.013)
            materials = revenue * (0.27 + (index % 3) * 0.018)
            payroll = revenue * (0.29 + (index % 4) * 0.012)
            rent = revenue * (0.075 + (index % 2) * 0.01)
            energy = revenue * (0.032 + (index % 3) * 0.004)
            marketing = revenue * (0.018 + (index % 4) * 0.003)
            depreciation = revenue * (0.028 + (index % 2) * 0.006)
            financial = revenue * (0.009 + (index % 3) * 0.002)
            operating = revenue - materials - payroll - rent - energy - marketing - depreciation
            tax = max(0, (operating - financial) * (0.18 + language_index * 0.01))
            net = operating - financial - tax
            start, end = fiscal_period(index, language_index)
            unit_multiplier = 1_000_000 if format_name == "pdf_millions" else 1000 if format_name == "pdf_thousands" else 1
            slug = f"{language}-{index:02d}-{format_name}-{start.year}-{end.year}"
            extension = "xlsx" if format_name.startswith("xlsx") else "csv" if format_name.startswith("csv") else "png" if format_name.startswith("png") else "pdf"
            cases.append(
                {
                    "id": slug,
                    "language": language,
                    "format": format_name,
                    "fileName": f"{slug}.{extension}",
                    "companyName": companies[language][(index - 1) % len(companies[language])],
                    "businessId": f"{1000000 + language_index * 100000 + index * 917}-{index % 9}",
                    "size": size,
                    "periodStart": start.isoformat(),
                    "periodEnd": end.isoformat(),
                    "currency": "EUR",
                    "unitMultiplier": unit_multiplier,
                    "expected": {
                        "revenue": round(revenue, 2),
                        "materialPurchases": round(materials, 2),
                        "payroll": round(payroll, 2),
                        "otherOpex": round(rent + energy + marketing + depreciation, 2),
                        "operatingResult": round(operating, 2),
                        "financial": round(financial, 2),
                        "tax": round(tax, 2),
                        "netResult": round(net, 2),
                    },
                }
            )
    return cases


def rows_for(case: dict) -> list[tuple[str, str, float, bool]]:
    labels = LANGUAGES[case["language"]]["labels"]
    expected = case["expected"]
    other = expected["otherOpex"]
    rent, energy, marketing = other * 0.52, other * 0.21, other * 0.12
    depreciation = other - rent - energy - marketing
    return [
        ("3000", labels["revenue"], expected["revenue"], False),
        ("4000", labels["materials"], expected["materialPurchases"], False),
        ("5000", labels["payroll"], expected["payroll"], False),
        ("6000", labels["rent"], rent, False),
        ("6100", labels["energy"], energy, False),
        ("6200", labels["marketing"], marketing, False),
        ("7000", labels["depreciation"], depreciation, False),
        ("", labels["opex"], expected["materialPurchases"] + expected["payroll"] + other, True),
        ("", labels["operating"], expected["operatingResult"], True),
        ("8000", labels["financial"], expected["financial"], False),
        ("9000", labels["tax"], expected["tax"], False),
        ("", labels["net"], expected["netResult"], True),
    ]


def display_amount(case: dict, amount_value: float, row_index: int) -> str:
    value = amount_value / case["unitMultiplier"]
    language = case["language"]
    if language in ("fr", "fi"):
        rendered = f"{value:,.2f}".replace(",", " ").replace(".", ",")
    else:
        rendered = f"{value:,.2f}"
    if case["format"] in ("pdf_scan_rotated", "csv_trial_balance") and row_index in (1, 3, 5, 6, 9, 10):
        return f"({rendered})"
    return rendered


def draw_page(draw, case: dict, page_rows: list, page_number: int, total_pages: int, image_mode: bool = False):
    lang = LANGUAGES[case["language"]]
    width = 1654 if image_mode else A4[0]
    margin = 92 if image_mode else 44
    y = 105 if image_mode else A4[1] - 52
    scale = 2.7 if image_mode else 1
    title_size = int(32 if image_mode else 17)
    body_size = int(19 if image_mode else 9)
    small_size = int(16 if image_mode else 7.5)
    if image_mode:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", body_size)
        bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", title_size)
        small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", small_size)
        draw.text((margin, y), case["companyName"], fill="#0f172a", font=bold)
        y += 54
        draw.text((margin, y), lang["title"], fill="#0f766e", font=font)
        y += 38
        draw.text((margin, y), lang["period"].format(start=case["periodStart"], end=case["periodEnd"]), fill="#475569", font=small)
        y += 28
        unit = "EUR" if case["unitMultiplier"] == 1 else "kEUR" if case["unitMultiplier"] == 1000 else "MEUR"
        draw.text((margin, y), f'{lang["unit"].format(unit=unit)} · {case["businessId"]}', fill="#64748b", font=small)
        y += 55
        draw.rectangle((margin, y, width - margin, y + 44), fill="#e6fffb")
        draw.text((margin + 12, y + 11), lang["code"], fill="#0f172a", font=small)
        draw.text((margin + 250, y + 11), lang["label"], fill="#0f172a", font=small)
        draw.text((width - margin - 220, y + 11), lang["amount"], fill="#0f172a", font=small)
        y += 53
        for original_index, (code, label, value, total) in page_rows:
            if total:
                draw.rectangle((margin, y - 5, width - margin, y + 32), fill="#f1f5f9")
            draw.text((margin + 12, y), code, fill="#334155", font=small)
            draw.text((margin + 250, y), label, fill="#0f172a", font=small)
            draw.text((width - margin - 230, y), display_amount(case, value, original_index), fill="#0f172a", font=small)
            y += 44
        draw.text((margin, 2250), f"Page {page_number}/{total_pages} · SYNTHETIC OCR TEST FIXTURE", fill="#94a3b8", font=small)
    else:
        draw.setFillColor(HexColor("#0f172a"))
        draw.setFont("Helvetica-Bold", title_size)
        draw.drawString(margin, y, case["companyName"])
        y -= 24
        draw.setFillColor(HexColor("#0f766e"))
        draw.setFont("Helvetica-Bold", 11)
        draw.drawString(margin, y, lang["title"])
        y -= 18
        draw.setFillColor(HexColor("#475569"))
        draw.setFont("Helvetica", small_size)
        draw.drawString(margin, y, lang["period"].format(start=case["periodStart"], end=case["periodEnd"]))
        y -= 13
        unit = "EUR" if case["unitMultiplier"] == 1 else "kEUR" if case["unitMultiplier"] == 1000 else "MEUR"
        draw.drawString(margin, y, f'{lang["unit"].format(unit=unit)} · {case["businessId"]}')
        y -= 28
        draw.setFillColor(HexColor("#e6fffb"))
        draw.rect(margin, y - 4, width - margin * 2, 22, fill=1, stroke=0)
        draw.setFillColor(HexColor("#0f172a"))
        draw.setFont("Helvetica-Bold", body_size)
        draw.drawString(margin + 8, y + 4, lang["code"])
        draw.drawString(margin + 100, y + 4, lang["label"])
        draw.drawRightString(width - margin - 8, y + 4, lang["amount"])
        y -= 20
        for original_index, (code, label, value, total) in page_rows:
            if total:
                draw.setFillColor(HexColor("#f1f5f9"))
                draw.rect(margin, y - 3, width - margin * 2, 18, fill=1, stroke=0)
            draw.setFillColor(HexColor("#0f172a"))
            draw.setFont("Helvetica-Bold" if total else "Helvetica", body_size)
            draw.drawString(margin + 8, y + 2, code)
            draw.drawString(margin + 100, y + 2, label[:54])
            draw.drawRightString(width - margin - 8, y + 2, display_amount(case, value, original_index))
            y -= 20
        draw.setFillColor(HexColor("#94a3b8"))
        draw.setFont("Helvetica", 6.5)
        draw.drawString(margin, 26, f"Page {page_number}/{total_pages} · SYNTHETIC OCR TEST FIXTURE")


def make_text_pdf(case: dict, multipage: bool):
    path = OUTPUT / case["fileName"]
    pdf = canvas.Canvas(str(path), pagesize=A4)
    indexed = list(enumerate(rows_for(case)))
    pages = [indexed[:7], indexed[7:]] if multipage else [indexed]
    for page_number, page_rows in enumerate(pages, start=1):
        draw_page(pdf, case, page_rows, page_number, len(pages))
        pdf.showPage()
    pdf.save()


def page_image(case: dict, page_rows: list, page_number: int, total_pages: int) -> Image.Image:
    image = Image.new("RGB", (1654, 2339), "#ffffff")
    draw_page(ImageDraw.Draw(image), case, page_rows, page_number, total_pages, image_mode=True)
    if case["format"] == "pdf_scan_rotated":
        image = image.rotate(1.15, resample=Image.Resampling.BICUBIC, expand=False, fillcolor="white")
        image = ImageEnhance.Contrast(image).enhance(0.9).filter(ImageFilter.GaussianBlur(0.25))
    return image


def make_scan(case: dict, as_png: bool = False):
    indexed = list(enumerate(rows_for(case)))
    pages = [indexed[:7], indexed[7:]] if case["format"] == "pdf_scan" else [indexed]
    images = [page_image(case, rows, index + 1, len(pages)) for index, rows in enumerate(pages)]
    path = OUTPUT / case["fileName"]
    if as_png:
        images[0].save(path, optimize=True)
    else:
        images[0].save(path, "PDF", resolution=150, save_all=True, append_images=images[1:])


def make_csv(case: dict):
    lang = LANGUAGES[case["language"]]
    delimiter = ";" if case["language"] == "fr" else "," if case["language"] == "en" else "\t"
    with (OUTPUT / case["fileName"]).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter=delimiter)
        writer.writerow([case["companyName"], lang["title"]])
        writer.writerow([lang["period"].format(start=case["periodStart"], end=case["periodEnd"])])
        writer.writerow([lang["code"], lang["label"], lang["amount"]])
        for index, (code, label, value, _) in enumerate(rows_for(case)):
            writer.writerow([code, label, display_amount(case, value, index)])


def main():
    random.seed(42)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    VERIFY.mkdir(parents=True, exist_ok=True)
    cases = build_cases()
    for case in cases:
        format_name = case["format"]
        if format_name == "pdf_text":
            make_text_pdf(case, False)
        elif format_name == "pdf_multipage":
            make_text_pdf(case, True)
        elif format_name in ("pdf_thousands", "pdf_millions"):
            make_text_pdf(case, False)
        elif format_name in ("pdf_scan", "pdf_scan_rotated"):
            make_scan(case)
        elif format_name == "png_scan":
            make_scan(case, as_png=True)
        elif format_name == "csv_trial_balance":
            make_csv(case)
    (OUTPUT / "manifest.json").write_text(json.dumps({"version": 1, "cases": cases}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated non-XLSX corpus assets in {OUTPUT}")


if __name__ == "__main__":
    main()
