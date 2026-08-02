#!/usr/bin/env python3
"""Generate the polished French PDF report for the OCR benchmark."""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
INPUT_PATH = REPO_ROOT / "outputs/pdf-ocr-benchmark-2026-08-02/comparison.json"
OUTPUT_PATH = REPO_ROOT / "output/pdf/rapport-comparatif-ocr-toquehub-firecrawl.pdf"
ARIAL = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
ARIAL_BOLD = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")

NAVY = colors.HexColor("#183B4E")
TEAL = colors.HexColor("#0B6E4F")
GOLD = colors.HexColor("#F2C14E")
INK = colors.HexColor("#1D252C")
SLATE = colors.HexColor("#52616B")
PALE = colors.HexColor("#EEF3F5")
LIGHT_TEAL = colors.HexColor("#E7F3EF")
LIGHT_GOLD = colors.HexColor("#FFF6D8")
RED = colors.HexColor("#B23A48")


def register_fonts() -> tuple[str, str]:
    regular = "Helvetica"
    bold = "Helvetica-Bold"
    if ARIAL.is_file():
        pdfmetrics.registerFont(TTFont("ReportSans", str(ARIAL)))
        regular = "ReportSans"
    if ARIAL_BOLD.is_file():
        pdfmetrics.registerFont(TTFont("ReportSans-Bold", str(ARIAL_BOLD)))
        bold = "ReportSans-Bold"
    return regular, bold


REGULAR, BOLD = register_fonts()


def pct(value: float, digits: int = 1) -> str:
    return f"{value * 100:.{digits}f} %".replace(".", ",")


def number(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def milliseconds(value: float) -> str:
    return f"{value:,.0f} ms".replace(",", " ")


def seconds(value: float) -> str:
    return f"{value / 1000:.1f} s".replace(".", ",")


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=base["Title"],
            fontName=BOLD,
            fontSize=29,
            leading=34,
            textColor=colors.white,
            alignment=TA_LEFT,
            spaceAfter=14,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle",
            parent=base["Normal"],
            fontName=REGULAR,
            fontSize=13,
            leading=18,
            textColor=colors.HexColor("#DDE8EC"),
        ),
        "h1": ParagraphStyle(
            "ReportH1",
            parent=base["Heading1"],
            fontName=BOLD,
            fontSize=19,
            leading=23,
            textColor=NAVY,
            spaceBefore=3,
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "ReportH2",
            parent=base["Heading2"],
            fontName=BOLD,
            fontSize=13,
            leading=16,
            textColor=TEAL,
            spaceBefore=8,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "ReportBody",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=9.5,
            leading=14,
            textColor=INK,
            spaceAfter=7,
        ),
        "small": ParagraphStyle(
            "ReportSmall",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=7.7,
            leading=10.5,
            textColor=SLATE,
            spaceAfter=4,
        ),
        "callout": ParagraphStyle(
            "ReportCallout",
            parent=base["BodyText"],
            fontName=BOLD,
            fontSize=12,
            leading=17,
            textColor=NAVY,
            alignment=TA_LEFT,
        ),
        "metric": ParagraphStyle(
            "Metric",
            parent=base["Normal"],
            fontName=BOLD,
            fontSize=17,
            leading=20,
            textColor=NAVY,
            alignment=TA_CENTER,
        ),
        "metric_label": ParagraphStyle(
            "MetricLabel",
            parent=base["Normal"],
            fontName=REGULAR,
            fontSize=7.5,
            leading=10,
            textColor=SLATE,
            alignment=TA_CENTER,
        ),
        "table": ParagraphStyle(
            "TableCell",
            parent=base["Normal"],
            fontName=REGULAR,
            fontSize=7.4,
            leading=9.5,
            textColor=INK,
        ),
        "table_bold": ParagraphStyle(
            "TableCellBold",
            parent=base["Normal"],
            fontName=BOLD,
            fontSize=7.4,
            leading=9.5,
            textColor=INK,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["Normal"],
            fontName=BOLD,
            fontSize=7.4,
            leading=9.5,
            textColor=colors.white,
        ),
        "step_number": ParagraphStyle(
            "StepNumber",
            parent=base["Normal"],
            fontName=BOLD,
            fontSize=17,
            leading=20,
            textColor=colors.white,
            alignment=TA_CENTER,
        ),
    }


STYLES = styles()


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, STYLES[style])


def metric_cards(items: list[tuple[str, str]], width: float = 173 * mm) -> Table:
    cell_width = width / len(items)
    values = [[p(value, "metric") for value, _ in items], [p(label, "metric_label") for _, label in items]]
    table = Table(values, colWidths=[cell_width] * len(items), rowHeights=[11 * mm, 12 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PALE),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCD8DD")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def info_box(text: str, background=LIGHT_TEAL, border=TEAL) -> Table:
    box = Table([[p(text, "callout")]], colWidths=[173 * mm])
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 1.1, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return box


def bar_chart(
    title: str,
    labels: list[str],
    values: list[float],
    maximum: float,
    value_format,
    bar_colors: list,
    width: int = 490,
    height: int = 190,
) -> Drawing:
    drawing = Drawing(width, height)
    drawing.add(String(0, height - 14, title, fontName=BOLD, fontSize=11, fillColor=NAVY))
    chart_top = height - 36
    row_height = (height - 50) / len(labels)
    label_width = 145
    bar_width = width - label_width - 55
    for index, (label, value) in enumerate(zip(labels, values)):
        y = chart_top - (index + 1) * row_height + 6
        drawing.add(String(0, y + 4, label, fontName=REGULAR, fontSize=7.5, fillColor=INK))
        drawing.add(Rect(label_width, y, bar_width, 10, fillColor=PALE, strokeColor=None))
        rendered = max(0, min(bar_width, bar_width * value / maximum)) if maximum else 0
        drawing.add(Rect(label_width, y, rendered, 10, fillColor=bar_colors[index], strokeColor=None))
        drawing.add(
            String(
                label_width + bar_width + 5,
                y + 2,
                value_format(value),
                fontName=BOLD,
                fontSize=7.5,
                fillColor=INK,
            )
        )
    return drawing


def styled_table(data, widths, header=True, font_size=7.4) -> Table:
    rows = []
    for row_index, row in enumerate(data):
        style_name = "table_header" if header and row_index == 0 else "table"
        rows.append([cell if hasattr(cell, "wrap") else p(str(cell), style_name) for cell in row])
    table = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CAD5DA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ]
        )
    for row_index in range(1 if header else 0, len(rows)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), PALE))
    table.setStyle(TableStyle(commands))
    return table


def bullet(text: str) -> Paragraph:
    return p(f"<font color='#0B6E4F'><b>•</b></font>&nbsp;&nbsp;{text}", "body")


def first_page(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, height - 15 * mm, width, 15 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#8DB8C8"))
    canvas.circle(width - 23 * mm, 30 * mm, 38 * mm, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.circle(width - 23 * mm, 30 * mm, 26 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#DDE8EC"))
    canvas.setFont(REGULAR, 8)
    canvas.drawString(20 * mm, 13 * mm, "ToqueHub - benchmark reproductible du 2 août 2026")
    canvas.restoreState()


def later_page(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D2DDE1"))
    canvas.line(18 * mm, height - 15 * mm, width - 18 * mm, height - 15 * mm)
    canvas.setFont(REGULAR, 7.5)
    canvas.setFillColor(SLATE)
    canvas.drawString(18 * mm, height - 11 * mm, "ToqueHub - analyse PDF vs Firecrawl")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_report(data: dict) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=16 * mm,
        title="Rapport comparatif OCR ToqueHub vs Firecrawl",
        author="ToqueHub / Codex",
        subject="Benchmark de 100 PDF",
    )
    story = []
    groups = data["groups"]
    scenarios = data["scenarios"]
    firecrawl = data["engines"]["firecrawl"]
    toquehub = data["engines"]["toquehub"]

    # Cover
    story.append(Spacer(1, 32 * mm))
    story.append(p("RAPPORT D'EFFICACITÉ", "subtitle"))
    story.append(Spacer(1, 4 * mm))
    story.append(p("Analyse PDF ToqueHub<br/>vs Firecrawl", "title"))
    story.append(Spacer(1, 7 * mm))
    story.append(
        p(
            "100 PDF comparés sur la rapidité, la qualité d'extraction, les tableaux, le routage OCR et la fiabilité.",
            "subtitle",
        )
    )
    story.append(Spacer(1, 24 * mm))
    cover_box = Table(
        [
            [p("DÉCISION", "metric_label")],
            [
                p(
                    "Conserver Mistral OCR. Ajouter Firecrawl en pré-analyse locale. Ne pas remplacer entièrement le moteur actuel.",
                    "callout",
                )
            ],
        ],
        colWidths=[164 * mm],
    )
    cover_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), GOLD),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 1.2, GOLD),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(cover_box)
    story.append(Spacer(1, 16 * mm))
    story.append(
        metric_cards(
            [
                ("100/100", "Routage Firecrawl correct"),
                ("773x", "Gain médian sur PDF natifs"),
                ("99/100", "OCR actuel au premier essai"),
            ],
            width=164 * mm,
        )
    )
    story.append(PageBreak())

    # Executive summary
    story.append(p("1. Conclusion exécutive", "h1"))
    story.append(
        info_box(
            "Le remplacement complet est rejeté. Firecrawl n'est pas un moteur OCR : 60 scans et 5 PDF mixtes exigent toujours Mistral. Pour Stocks, la qualité des tableaux métier reste nettement meilleure avec le système actuel."
        )
    )
    story.append(Spacer(1, 5 * mm))
    story.append(
        p(
            f"Firecrawl a classé correctement les 100 documents et a parcouru le corpus en {number(firecrawl['completeRunMedianMs'], 1)} ms. Sur les PDF natifs, sa latence médiane est de {number(firecrawl['nativeMedianLatencyMs'], 2)} ms, contre {number(toquehub['nativeMedianLatencyMs'], 0)} ms pour ToqueHub/Mistral.",
            "body",
        )
    )
    story.append(
        p(
            f"Cette vitesse ne suffit pas à justifier un remplacement. Sur les 35 PDF natifs, le score global Firecrawl est {number(groups['native']['firecrawl']['overall'])}, contre {number(groups['native']['toquehubOcr']['overall'])}. Sur les 5 documents métier natifs, l'écart atteint {number(groups['nativeBusiness']['firecrawl']['overall'])} contre {number(groups['nativeBusiness']['toquehubOcr']['overall'])}.",
            "body",
        )
    )
    story.append(
        metric_cards(
            [
                (number(groups["nativeBusiness"]["firecrawl"]["teds"]), "Tableaux métier - Firecrawl"),
                (number(groups["nativeBusiness"]["toquehubOcr"]["teds"]), "Tableaux métier - Mistral"),
                ("15,6 %", "Temps gagné - hybride protégé"),
            ]
        )
    )
    story.append(Spacer(1, 6 * mm))
    story.append(p("Décision recommandée", "h2"))
    story.append(bullet("Conserver Mistral OCR comme source de vérité pour factures, BL, commandes et tickets."))
    story.append(bullet("Ajouter Firecrawl avant Mistral pour classifier le PDF, signaler les pages OCR et détecter les tables."))
    story.append(bullet("Tester un fast-path uniquement pour les PDF TextBased fiables et sans table, derrière un feature flag."))
    story.append(bullet("Ajouter une seule relance bornée sur timeout ou erreur réseau."))
    story.append(PageBreak())

    # Corpus and methodology
    story.append(p("2. Corpus et méthode", "h1"))
    story.append(
        p(
            "Le corpus contient 100 PDF et 105 pages. Il associe 90 pages publiques uniques d'OpenDataLoader Bench et 15 documents métier synthétiques. Aucune facture réelle, donnée RH ou donnée personnelle du dépôt n'a été envoyée.",
            "body",
        )
    )
    category_rows = [["Catégorie", "PDF", "Caractéristiques"]]
    descriptions = {
        "native_text": "Texte natif, tableaux, colonnes, tailles de page variées",
        "scan_clean": "Raster 200 dpi, compression légère",
        "scan_lowres": "Raster 96 dpi, contraste réduit",
        "scan_skewed": "Inclinaison jusqu'à 2,8 degrés",
        "scan_noisy": "Bruit, flou, contraste réduit",
        "scan_compressed": "Compression JPEG forte",
        "mixed": "Deux pages : une native et une scannée",
    }
    for category, count in data["corpus"]["categoryCounts"].items():
        category_rows.append([category, str(count), descriptions[category]])
    story.append(styled_table(category_rows, [45 * mm, 20 * mm, 108 * mm]))
    story.append(Spacer(1, 6 * mm))
    story.append(p("Documents métier", "h2"))
    story.append(
        p(
            "Les 15 documents ToqueHub synthétiques couvrent factures, bons de livraison, confirmations de commande, tickets de caisse et catalogues en français, finnois et anglais. Plusieurs variantes emploient des formats A4, Letter, paysage, ticket étroit, tableaux denses et annotations manuscrites simulées.",
            "body",
        )
    )
    story.append(p("Mesures", "h2"))
    story.append(bullet("NID : similarité du texte et de l'ordre de lecture."))
    story.append(bullet("TEDS : fidélité structurelle et textuelle des tableaux."))
    story.append(bullet("MHS : titres et structure hiérarchique."))
    story.append(bullet("Score global : moyenne des métriques disponibles par document."))
    story.append(
        p(
            "Les temps Firecrawl mesurent l'appel local en mémoire après initialisation. Les temps ToqueHub mesurent la classe MistralClientService.ocrMarkdown du dépôt et incluent encodage base64, réseau et service Mistral.",
            "small",
        )
    )
    story.append(PageBreak())

    # Quality results
    story.append(p("3. Qualité et rapidité", "h1"))
    story.append(
        bar_chart(
            "Qualité globale selon le scénario (0 à 1)",
            ["ToqueHub actuel", "Firecrawl seul", "Hybride rapide", "Hybride protégé"],
            [
                scenarios["current"]["overallQuality"],
                scenarios["replacement"]["overallQuality"],
                scenarios["fastHybrid"]["overallQuality"],
                scenarios["guardedHybrid"]["overallQuality"],
            ],
            1,
            lambda value: number(value),
            [TEAL, RED, GOLD, NAVY],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        bar_chart(
            "Temps total séquentiel mesuré ou simulé",
            ["ToqueHub actuel", "Firecrawl seul", "Hybride rapide", "Hybride protégé"],
            [
                scenarios["current"]["totalLatencyMs"] / 1000,
                scenarios["replacement"]["totalLatencyMs"] / 1000,
                scenarios["fastHybrid"]["totalLatencyMs"] / 1000,
                scenarios["guardedHybrid"]["totalLatencyMs"] / 1000,
            ],
            scenarios["current"]["totalLatencyMs"] / 1000,
            lambda value: f"{value:.1f} s".replace(".", ","),
            [TEAL, RED, GOLD, NAVY],
        )
    )
    story.append(PageBreak())

    # Category details
    story.append(p("4. Résultats détaillés", "h1"))
    category_results = [["Catégorie", "N", "ToqueHub", "NID", "Médiane", "Firecrawl"]]
    for category, values in data["perCategory"].items():
        category_results.append(
            [
                category,
                values["documentCount"],
                number(values["toquehubQuality"]["overall"]),
                number(values["toquehubQuality"]["nid"]),
                milliseconds(values["toquehubMedianLatencyMs"]),
                number(values["firecrawlQuality"]["overall"]),
            ]
        )
    story.append(
        styled_table(
            category_results,
            [42 * mm, 12 * mm, 27 * mm, 23 * mm, 34 * mm, 29 * mm],
        )
    )
    story.append(Spacer(1, 7 * mm))
    story.append(p("Lecture des résultats", "h2"))
    story.append(
        p(
            "Les scores Firecrawl à zéro sur les scans ne signifient pas une erreur de classification : le moteur détecte correctement qu'un OCR est nécessaire, puis ne produit volontairement pas de texte. Sur les documents mixtes, il ne restitue que la partie native, d'où un score partiel.",
            "body",
        )
    )
    story.append(
        p(
            f"ToqueHub/Mistral réussit {toquehub['successfulDocuments']}/100 documents au premier passage. Sa médiane est de {milliseconds(toquehub['latencyMs']['median'])} et son p95 de {milliseconds(toquehub['latencyMs']['p95'])}. Firecrawl gagne le score natif dans {data['nativeHeadToHead']['firecrawlWins']} cas, Mistral dans {data['nativeHeadToHead']['mistralWins']} cas, avec {data['nativeHeadToHead']['ties']} égalité.",
            "body",
        )
    )
    story.append(
        info_box(
            "Point de fiabilité : test-068 a atteint le timeout actuel de 60 s. Une relance diagnostique a réussi en 2 046 ms. Le document est lisible; l'échec observé est compatible avec un incident transitoire.",
            background=LIGHT_GOLD,
            border=GOLD,
        )
    )
    story.append(PageBreak())

    # Scenarios and decision
    story.append(p("5. Architecture recommandée", "h1"))
    scenario_rows = [["Scénario", "Local", "OCR", "Pages OCR", "Qualité", "Temps", "Gain"]]
    for key in ["current", "replacement", "fastHybrid", "guardedHybrid"]:
        scenario = scenarios[key]
        scenario_rows.append(
            [
                scenario["label"],
                scenario["localDocuments"],
                scenario["ocrDocuments"],
                scenario["ocrPages"],
                number(scenario["overallQuality"]),
                seconds(scenario["totalLatencyMs"]),
                pct(scenario["latencyReductionVsCurrent"]),
            ]
        )
    story.append(
        styled_table(
            scenario_rows,
            [48 * mm, 16 * mm, 16 * mm, 23 * mm, 23 * mm, 22 * mm, 25 * mm],
        )
    )
    story.append(Spacer(1, 7 * mm))
    story.append(p("Règle du pilote protégé", "h2"))
    rule_box = Table(
        [
            [p("1", "step_number"), p("Classer avec pdf-inspector", "table_bold")],
            [p("2", "step_number"), p("Local uniquement si TextBased, sans erreur d'encodage, sans page OCR et sans table", "table")],
            [p("3", "step_number"), p("Sinon, conserver le parcours Mistral OCR actuel", "table")],
            [p("4", "step_number"), p("Mesurer qualité métier, latence, taux de fallback et coût par page", "table")],
        ],
        colWidths=[18 * mm, 155 * mm],
    )
    rule_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), NAVY),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.white),
                ("BACKGROUND", (1, 0), (1, -1), PALE),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(rule_box)
    story.append(Spacer(1, 6 * mm))
    story.append(
        p(
            "Dans le corpus, cette règle utilise Firecrawl sur 20 PDF et Mistral sur 80. Elle économise 20 % des appels, 19 % des pages OCR et 15,6 % du temps, avec une baisse de qualité globale de 0,012. Les 15 documents métier restent tous sur Mistral car leurs tableaux sont détectés.",
            "body",
        )
    )
    story.append(PageBreak())

    # Rollout, limits, sources
    story.append(p("6. Plan de mise en oeuvre", "h1"))
    steps = [
        ("Étape 1 - Instrumenter", "Enregistrer type PDF, confiance, pages OCR, tables, durée locale et durée Mistral."),
        ("Étape 2 - Ajouter le retry", "Une seule relance sur AbortError, timeout ou erreur réseau, avec backoff court."),
        ("Étape 3 - Mode observation", "Exécuter Firecrawl sans modifier le résultat utilisateur pendant une période de référence."),
        ("Étape 4 - Pilote protégé", "Activer le fast-path sans table pour un petit pourcentage d'organisations."),
        ("Étape 5 - Validation métier", "Comparer fournisseur, numéros, dates, totaux, lignes, unités et prix sur des documents anonymisés."),
    ]
    for title, detail in steps:
        story.append(KeepTogether([p(title, "h2"), p(detail, "body")]))

    story.append(p("Limites", "h2"))
    story.append(bullet("Les documents métier sont synthétiques; aucune donnée privée n'a été utilisée."))
    story.append(bullet("Le score mesure la lecture PDF/Markdown, pas chaque champ final de réception de stock."))
    story.append(bullet("Les gains dépendent du taux de PDF natifs en production; il est de 35 % dans ce corpus."))
    story.append(bullet("Les temps Mistral incluent le réseau; les temps Firecrawl sont locaux après initialisation."))

    story.append(p("Reproductibilité et sources", "h2"))
    story.append(
        p(
            "Firecrawl pdf-inspector 1.11.2, commit a15ec2d68d51dbe6a39d1da688ec7a3f642d846c.<br/>"
            "OpenDataLoader Bench, commit 7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109.<br/>"
            "Modèle ToqueHub : mistral-ocr-latest.<br/>"
            "Artefacts : outputs/pdf-ocr-benchmark-2026-08-02/.",
            "small",
        )
    )
    story.append(
        p(
            "Sources : <link href='https://github.com/firecrawl/pdf-inspector' color='#0B6E4F'>github.com/firecrawl/pdf-inspector</link> - "
            "<link href='https://github.com/opendataloader-project/opendataloader-bench' color='#0B6E4F'>github.com/opendataloader-project/opendataloader-bench</link>",
            "small",
        )
    )

    doc.build(story, onFirstPage=first_page, onLaterPages=later_page)


if __name__ == "__main__":
    build_report(json.loads(INPUT_PATH.read_text(encoding="utf-8")))
    print(OUTPUT_PATH)
