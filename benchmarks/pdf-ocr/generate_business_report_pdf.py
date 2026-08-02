#!/usr/bin/env python3
"""Generate the end-to-end French business OCR benchmark report."""

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
EVALUATION_PATH = REPO_ROOT / "outputs/pdf-ocr-business-benchmark-2026-08-02/evaluation.json"
RAW_PATH = REPO_ROOT / "outputs/pdf-ocr-business-benchmark-2026-08-02/raw-results.json"
OUTPUT_PATH = REPO_ROOT / "output/pdf/rapport-benchmark-ocr-metier-toquehub-firecrawl.pdf"
ARIAL = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
ARIAL_BOLD = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")

NAVY = colors.HexColor("#173B4D")
TEAL = colors.HexColor("#08745B")
GOLD = colors.HexColor("#F3C969")
INK = colors.HexColor("#172126")
SLATE = colors.HexColor("#53636C")
PALE = colors.HexColor("#EEF4F5")
LIGHT_TEAL = colors.HexColor("#E5F4EF")
LIGHT_GOLD = colors.HexColor("#FFF4CF")
LIGHT_RED = colors.HexColor("#FBE9E9")
RED = colors.HexColor("#B33B46")


def register_fonts() -> tuple[str, str]:
    regular = "Helvetica"
    bold = "Helvetica-Bold"
    if ARIAL.is_file():
        pdfmetrics.registerFont(TTFont("BusinessReportSans", str(ARIAL)))
        regular = "BusinessReportSans"
    if ARIAL_BOLD.is_file():
        pdfmetrics.registerFont(TTFont("BusinessReportSans-Bold", str(ARIAL_BOLD)))
        bold = "BusinessReportSans-Bold"
    return regular, bold


REGULAR, BOLD = register_fonts()


def pct(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "—"
    return f"{value * 100:.{digits}f} %".replace(".", ",")


def seconds(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "—"
    return f"{value / 1000:.{digits}f} s".replace(".", ",")


def milliseconds(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "—"
    return f"{value:.{digits}f} ms".replace(".", ",")


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "BusinessTitle",
            parent=base["Title"],
            fontName=BOLD,
            fontSize=29,
            leading=34,
            textColor=colors.white,
            alignment=TA_LEFT,
            spaceAfter=14,
        ),
        "subtitle": ParagraphStyle(
            "BusinessSubtitle",
            parent=base["Normal"],
            fontName=REGULAR,
            fontSize=13,
            leading=18,
            textColor=colors.HexColor("#DDE9EC"),
        ),
        "h1": ParagraphStyle(
            "BusinessH1",
            parent=base["Heading1"],
            fontName=BOLD,
            fontSize=19,
            leading=23,
            textColor=NAVY,
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "BusinessH2",
            parent=base["Heading2"],
            fontName=BOLD,
            fontSize=12.5,
            leading=16,
            textColor=TEAL,
            spaceBefore=7,
            spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "BusinessBody",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=9.3,
            leading=13.6,
            textColor=INK,
            spaceAfter=7,
        ),
        "small": ParagraphStyle(
            "BusinessSmall",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=7.3,
            leading=10,
            textColor=SLATE,
            spaceAfter=4,
        ),
        "callout": ParagraphStyle(
            "BusinessCallout",
            parent=base["BodyText"],
            fontName=BOLD,
            fontSize=11.5,
            leading=16,
            textColor=NAVY,
        ),
        "metric": ParagraphStyle(
            "BusinessMetric",
            parent=base["Normal"],
            fontName=BOLD,
            fontSize=16,
            leading=19,
            textColor=NAVY,
            alignment=TA_CENTER,
        ),
        "metric_label": ParagraphStyle(
            "BusinessMetricLabel",
            parent=base["Normal"],
            fontName=REGULAR,
            fontSize=7.2,
            leading=9.5,
            textColor=SLATE,
            alignment=TA_CENTER,
        ),
        "table": ParagraphStyle(
            "BusinessTable",
            parent=base["Normal"],
            fontName=REGULAR,
            fontSize=7.1,
            leading=9.2,
            textColor=INK,
        ),
        "table_header": ParagraphStyle(
            "BusinessTableHeader",
            parent=base["Normal"],
            fontName=BOLD,
            fontSize=7.1,
            leading=9.2,
            textColor=colors.white,
        ),
    }


STYLES = styles()


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, STYLES[style])


def bullet(text: str) -> Paragraph:
    return p(f"<font color='#08745B'><b>•</b></font>&nbsp;&nbsp;{text}")


def metric_cards(items: list[tuple[str, str]], width: float = 173 * mm) -> Table:
    cell_width = width / len(items)
    table = Table(
        [
            [p(value, "metric") for value, _ in items],
            [p(label, "metric_label") for _, label in items],
        ],
        colWidths=[cell_width] * len(items),
        rowHeights=[11 * mm, 12 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PALE),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#C8D6DA")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def info_box(text: str, background=LIGHT_TEAL, border=TEAL) -> Table:
    table = Table([[p(text, "callout")]], colWidths=[173 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 1.1, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 11),
                ("RIGHTPADDING", (0, 0), (-1, -1), 11),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def styled_table(data: list[list[object]], widths: list[float]) -> Table:
    rows = []
    for row_index, row in enumerate(data):
        style = "table_header" if row_index == 0 else "table"
        rows.append([cell if hasattr(cell, "wrap") else p(str(cell), style) for cell in row])
    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C8D5D9")),
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for row_index in range(2, len(rows), 2):
        commands.append(("BACKGROUND", (0, row_index), (-1, row_index), PALE))
    table.setStyle(TableStyle(commands))
    return table


def bar_chart(
    title: str,
    labels: list[str],
    values: list[float],
    maximum: float,
    formatter,
    fills: list,
    height: int = 150,
) -> Drawing:
    width = 490
    drawing = Drawing(width, height)
    drawing.add(String(0, height - 14, title, fontName=BOLD, fontSize=10.5, fillColor=NAVY))
    row_height = (height - 38) / len(labels)
    label_width = 160
    bar_width = 245
    for index, (label, value) in enumerate(zip(labels, values)):
        y = height - 39 - (index + 1) * row_height + 8
        drawing.add(String(0, y + 2, label, fontName=REGULAR, fontSize=7.4, fillColor=INK))
        drawing.add(Rect(label_width, y, bar_width, 10, fillColor=PALE, strokeColor=None))
        rendered = bar_width * min(max(value / maximum, 0), 1) if maximum else 0
        drawing.add(Rect(label_width, y, rendered, 10, fillColor=fills[index], strokeColor=None))
        drawing.add(
            String(
                label_width + bar_width + 7,
                y + 1.5,
                formatter(value),
                fontName=BOLD,
                fontSize=7.4,
                fillColor=INK,
            )
        )
    return drawing


def first_page(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, height - 15 * mm, width, 15 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#82AEBB"))
    canvas.circle(width - 22 * mm, 30 * mm, 38 * mm, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.circle(width - 22 * mm, 30 * mm, 26 * mm, fill=1, stroke=0)
    canvas.setFont(REGULAR, 8)
    canvas.setFillColor(colors.HexColor("#DDE9EC"))
    canvas.drawString(20 * mm, 13 * mm, "ToqueHub — benchmark reproductible — 2 août 2026")
    canvas.restoreState()


def later_page(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D1DDE0"))
    canvas.line(18 * mm, height - 15 * mm, width - 18 * mm, height - 15 * mm)
    canvas.setFont(REGULAR, 7.2)
    canvas.setFillColor(SLATE)
    canvas.drawString(18 * mm, height - 11 * mm, "ToqueHub — benchmark OCR métier de bout en bout")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def scenario_row(label: str, summary: dict) -> list[str]:
    latency = summary["latencyMs"]
    quality = summary["quality"]
    return [
        label,
        seconds(latency["median"]),
        seconds(latency["p95"]),
        seconds(latency["mean"]),
        pct(summary["successRate"]),
        pct(quality["meanBusinessScore"]),
        pct(quality["perfectCriticalRate"]),
        str(summary["remoteCalls"]["total"]),
    ]


def build_report(evaluation: dict, raw: dict) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=17 * mm,
        title="Benchmark OCR métier ToqueHub vs Firecrawl",
        author="OpenAI Codex pour ToqueHub",
    )

    current = evaluation["scenarios"]["current_retry"]["summary"]
    current_raw = evaluation["scenarios"]["current"]["summary"]
    hybrid = evaluation["scenarios"]["hybrid_ai_retry"]["summary"]
    no_ai = evaluation["scenarios"]["hybrid_heuristics_retry"]["summary"]
    native_current = evaluation["scenarios"]["current_retry"]["byCategory"]["native_text"]
    native_hybrid = evaluation["scenarios"]["hybrid_ai_retry"]["byCategory"]["native_text"]
    native_no_ai = evaluation["scenarios"]["hybrid_heuristics_retry"]["byCategory"]["native_text"]
    paired = evaluation["pairedNativeTextComparison"]
    routing = evaluation["routing"]
    current_categories = evaluation["scenarios"]["current_retry"]["byCategory"]
    current_languages = evaluation["scenarios"]["current_retry"]["byLanguage"]
    current_types = evaluation["scenarios"]["current_retry"]["byDocumentType"]
    failed_primary = [
        record for record in raw["results"] if not record.get("current", {}).get("primary", {}).get("success")
    ]

    story = [
        Spacer(1, 34 * mm),
        p("Benchmark OCR métier", "title"),
        p("ToqueHub actuel vs Firecrawl PDF Inspector", "title"),
        p(
            "Mesure de la rapidité jusqu’au JSON final, de la justesse des champs métier et de la robustesse sur 100 PDF contrôlés.",
            "subtitle",
        ),
        Spacer(1, 22 * mm),
        metric_cards(
            [
                ("100", "documents"),
                ("105", "pages"),
                ("7", "profils PDF"),
                ("3", "langues"),
            ]
        ),
        Spacer(1, 10 * mm),
        p(
            "Objet de la décision : remplacer ou conserver le parcours ToqueHub qui lit le PDF avec Mistral OCR et renvoie directement l’extraction structurée utilisée par les stocks.",
            "subtitle",
        ),
        PageBreak(),
        p("Décision exécutive", "h1"),
        info_box(
            "CONSERVER LE PARCOURS OCR ACTUEL. Firecrawl ne doit pas remplacer l’appel Mistral OCR annoté pour ce cas métier. Sur les PDF texte, Firecrawl lit le fichier presque instantanément, mais l’analyse Mistral qui reste nécessaire porte le temps médian de 8,2 s à 41,0 s."
        ),
        Spacer(1, 7 * mm),
        metric_cards(
            [
                (seconds(current["latencyMs"]["median"]), "médiane actuelle, avec retry"),
                (pct(current["quality"]["meanBusinessScore"]), "score métier actuel"),
                (pct(current["successRate"]), "succès avec retry"),
                (pct(routing["accuracy"]), "routage Firecrawl correct"),
            ]
        ),
        Spacer(1, 7 * mm),
        p("Pourquoi cette décision", "h2"),
        bullet(
            f"Le parcours actuel avec un retry borné traite 100/100 documents, avec une médiane de {seconds(current['latencyMs']['median'])}, un p95 de {seconds(current['latencyMs']['p95'])} et un score métier de {pct(current['quality']['meanBusinessScore'])}."
        ),
        bullet(
            f"L’hybride Firecrawl + analyse Mistral conserve 100/100 succès, mais monte à {seconds(hybrid['latencyMs']['median'])} de médiane globale et {seconds(hybrid['latencyMs']['p95'])} au p95, pour un score métier légèrement inférieur ({pct(hybrid['quality']['meanBusinessScore'])})."
        ),
        bullet(
            f"Supprimer l’analyse IA accélère réellement les PDF texte ({seconds(native_no_ai['latencyMs']['median'], 2)}), mais leur score métier s’effondre à {pct(native_no_ai['quality']['meanBusinessScore'])} : ce chemin n’est pas exploitable en production."
        ),
        bullet(
            "Firecrawl reste intéressant comme contrôle préalable ultraléger, pour identifier les PDF scannés, mixtes ou avec encodage défectueux. Ce rôle apporte de l’observabilité, pas un gain démontré sur le délai jusqu’au JSON final."
        ),
        p("Priorités techniques", "h2"),
        styled_table(
            [
                ["Priorité", "Action", "Impact attendu"],
                ["P0", "Garder Mistral OCR avec document_annotation", "Évite le second appel lent au modèle de chat"],
                ["P0", "Ajouter 1 retry uniquement sur timeout/réseau", "Récupère l’échec transitoire observé sans changer le p50"],
                ["P1", "Corriger la classification order_confirmation", "Type exact passé de 1/12 à cibler vers ≥ 95 %"],
                ["P1", "Instrumenter upload, file d’attente, OCR, matching et sauvegarde", "Localise la lenteur si l’interface dépasse nettement 8–12 s"],
            ],
            [15 * mm, 91 * mm, 67 * mm],
        ),
        PageBreak(),
        p("Ce qui a réellement été comparé", "h1"),
        p(
            "Le chronomètre commence avec le PDF déjà chargé en mémoire et s’arrête quand l’objet métier final est disponible après extraction, normalisation et matching ToqueHub. Les lectures de fichier et le démarrage des bibliothèques sont exclus ; les appels réseau, l’encodage base64 et les requêtes Prisma du parcours métier sont inclus.",
        ),
        styled_table(
            [
                ["Scénario", "Chaîne mesurée", "Appels distants"],
                ["ToqueHub actuel", "PDF → Mistral /v1/ocr + annotation métier → extractBusinessData → JSON", "1 normalement"],
                ["Firecrawl + IA", "PDF → pdf-inspector → texte local → Mistral chat structuré → JSON ; scans → parcours actuel", "1 par document"],
                ["Firecrawl sans IA", "PDF → pdf-inspector → parseur heuristique ; scans → parcours actuel", "0 sur PDF texte"],
            ],
            [35 * mm, 100 * mm, 38 * mm],
        ),
        p("Corpus contrôlé", "h2"),
        p(
            "Chaque document possède une vérité terrain JSON : type, fournisseur, numéros, dates, totaux, références, libellés, quantités, unités, prix, TVA, lots et DDM/DLC. Les 100 documents couvrent factures, bons de livraison, commandes fournisseur, confirmations de commande et tickets de caisse en français, finnois et anglais.",
        ),
        styled_table(
            [
                ["Profil", "Documents", "Caractéristique"],
                ["PDF texte natif", "40", "5 mises en page : classique, paysage, ticket, dense, compact"],
                ["Scan propre", "15", "200 dpi, compression légère"],
                ["Scan basse résolution", "15", "définition réduite"],
                ["Scan incliné", "10", "rotation et marges irrégulières"],
                ["Scan bruité", "8", "bruit, contraste et flou"],
                ["Scan compressé", "7", "artefacts JPEG"],
                ["PDF mixte", "5", "page texte + page image contenant les totaux"],
            ],
            [45 * mm, 25 * mm, 103 * mm],
        ),
        p("Score métier", "h2"),
        p(
            "Le score agrège 25 % de métadonnées, 20 % de totaux, 15 % de détection de lignes et 40 % de champs produit. Une erreur de traitement vaut 0. Le taux « document critique parfait » exige tous les champs essentiels, tous les totaux et toutes les lignes/références/quantités/unités/prix attendus.",
            "small",
        ),
        PageBreak(),
        p("Résultats de bout en bout", "h1"),
        styled_table(
            [
                ["Scénario", "p50", "p95", "Moyenne", "Succès", "Score métier", "Parfaits", "Appels"],
                scenario_row("ToqueHub actuel + retry", current),
                scenario_row("Firecrawl + IA + retry", hybrid),
                scenario_row("Firecrawl sans IA + retry", no_ai),
            ],
            [39 * mm, 18 * mm, 18 * mm, 19 * mm, 18 * mm, 23 * mm, 18 * mm, 18 * mm],
        ),
        Spacer(1, 6 * mm),
        bar_chart(
            "Latence p95 jusqu’au JSON final",
            ["ToqueHub actuel + retry", "Firecrawl + IA + retry", "Firecrawl sans IA + retry"],
            [current["latencyMs"]["p95"], hybrid["latencyMs"]["p95"], no_ai["latencyMs"]["p95"]],
            max(current["latencyMs"]["p95"], hybrid["latencyMs"]["p95"], no_ai["latencyMs"]["p95"]),
            lambda value: seconds(value),
            [TEAL, RED, GOLD],
        ),
        Spacer(1, 3 * mm),
        bar_chart(
            "Score métier global",
            ["ToqueHub actuel + retry", "Firecrawl + IA + retry", "Firecrawl sans IA + retry"],
            [current["quality"]["meanBusinessScore"], hybrid["quality"]["meanBusinessScore"], no_ai["quality"]["meanBusinessScore"]],
            1,
            lambda value: pct(value),
            [TEAL, colors.HexColor("#4E8797"), GOLD],
        ),
        info_box(
            f"Conclusion quantitative : l’hybride Firecrawl + IA consomme le même nombre d’appels distants ({hybrid['remoteCalls']['total']}) que le parcours actuel ({current['remoteCalls']['total']}), mais son temps cumulé est {hybrid['latencyMs']['total'] / current['latencyMs']['total']:.2f}× supérieur.".replace(".", ","),
            LIGHT_GOLD,
            GOLD,
        ),
        PageBreak(),
        p("Face-à-face sur les 40 PDF texte", "h1"),
        p(
            "C’est le seul sous-ensemble où Firecrawl peut réellement remplacer la lecture PDF. Les 40 comparaisons sont appariées : même PDF, même vérité terrain, même base ToqueHub et un appel distant par chemin avec IA.",
        ),
        styled_table(
            [
                ["Scénario PDF texte", "p50", "Moyenne", "Score métier", "Parfaits", "Lignes rappel"],
                ["ToqueHub OCR annoté", seconds(native_current["latencyMs"]["median"]), seconds(native_current["latencyMs"]["mean"]), pct(native_current["quality"]["meanBusinessScore"]), pct(native_current["quality"]["perfectCriticalRate"]), pct(native_current["quality"]["lineRecall"])],
                ["Firecrawl + Mistral chat", seconds(native_hybrid["latencyMs"]["median"]), seconds(native_hybrid["latencyMs"]["mean"]), pct(native_hybrid["quality"]["meanBusinessScore"]), pct(native_hybrid["quality"]["perfectCriticalRate"]), pct(native_hybrid["quality"]["lineRecall"])],
                ["Firecrawl + heuristiques", seconds(native_no_ai["latencyMs"]["median"], 2), seconds(native_no_ai["latencyMs"]["mean"], 2), pct(native_no_ai["quality"]["meanBusinessScore"]), pct(native_no_ai["quality"]["perfectCriticalRate"]), pct(native_no_ai["quality"]["lineRecall"])],
            ],
            [42 * mm, 23 * mm, 25 * mm, 28 * mm, 25 * mm, 30 * mm],
        ),
        Spacer(1, 6 * mm),
        bar_chart(
            "Médiane sur PDF texte",
            ["ToqueHub OCR annoté", "Firecrawl + Mistral chat", "Firecrawl + heuristiques"],
            [native_current["latencyMs"]["median"], native_hybrid["latencyMs"]["median"], native_no_ai["latencyMs"]["median"]],
            native_hybrid["latencyMs"]["median"],
            lambda value: seconds(value, 2 if value < 1000 else 1),
            [TEAL, RED, GOLD],
        ),
        p("Lecture statistique", "h2"),
        bullet(
            f"Le surcoût moyen Firecrawl + chat est de {seconds(paired['hybridAiMinusCurrentLatencyMs']['meanDelta'])} par PDF texte. IC 95 % : {seconds(paired['hybridAiMinusCurrentLatencyMs']['confidenceInterval95'][0])} à {seconds(paired['hybridAiMinusCurrentLatencyMs']['confidenceInterval95'][1])}."
        ),
        bullet(
            f"L’écart de score métier est de {paired['hybridAiMinusCurrentBusinessScore']['meanDelta'] * 100:+.2f} point. Son IC 95 % va de {paired['hybridAiMinusCurrentBusinessScore']['confidenceInterval95'][0] * 100:+.2f} à {paired['hybridAiMinusCurrentBusinessScore']['confidenceInterval95'][1] * 100:+.2f} points : aucune amélioration de qualité Firecrawl n’est démontrée.".replace(".", ",")
        ),
        bullet(
            f"Firecrawl lui-même ne coûte presque rien : médiane {milliseconds(routing['inspectorLatencyMs']['median'])}, p95 {milliseconds(routing['inspectorLatencyMs']['p95'])}. Le goulot est l’analyse Mistral chat, pas la lecture locale du PDF."
        ),
        PageBreak(),
        p("Robustesse selon la qualité du PDF", "h1"),
        p("Résultats du parcours recommandé ToqueHub + un retry borné."),
        styled_table(
            [["Profil", "N", "p50", "p95", "Score métier", "Parfaits", "Succès"]]
            + [
                [
                    name.replace("native_text", "PDF texte").replace("scan_", "scan ").replace("mixed", "mixte"),
                    str(group["documents"]),
                    seconds(group["latencyMs"]["median"]),
                    seconds(group["latencyMs"]["p95"]),
                    pct(group["quality"]["meanBusinessScore"]),
                    pct(group["quality"]["perfectCriticalRate"]),
                    pct(group["successRate"]),
                ]
                for name, group in current_categories.items()
            ],
            [36 * mm, 13 * mm, 23 * mm, 23 * mm, 31 * mm, 24 * mm, 23 * mm],
        ),
        p("Observations", "h2"),
        bullet(
            f"Le seul échec initial est {failed_primary[0]['id'] if failed_primary else '—'} (scan basse résolution) : timeout à {seconds(current_raw['latencyMs']['max'])}, puis succès en {seconds(failed_primary[0]['current']['diagnosticRetry']['wallMs']) if failed_primary else '—'}."
        ),
        bullet(
            "Les scans inclinés et bruités restent très solides. La basse résolution est le profil le plus fragile : une ligne produit manquée et une tentative ayant nécessité un retry."
        ),
        bullet(
            "Le p95 du petit groupe « scan compressé » correspond à un unique appel lent de 42,7 s ; avec N=7, il doit être lu comme un signal de queue longue, pas comme une fréquence stabilisée."
        ),
        p("Par langue", "h2"),
        styled_table(
            [["Langue", "N", "p50", "Score métier", "Parfaits", "Type exact", "Date exacte"]]
            + [
                [
                    language.upper(),
                    str(group["documents"]),
                    seconds(group["latencyMs"]["median"]),
                    pct(group["quality"]["meanBusinessScore"]),
                    pct(group["quality"]["perfectCriticalRate"]),
                    pct(group["quality"]["documentTypeAccuracy"]),
                    pct(group["quality"]["documentDateAccuracy"]),
                ]
                for language, group in current_languages.items()
            ],
            [25 * mm, 16 * mm, 24 * mm, 31 * mm, 25 * mm, 27 * mm, 25 * mm],
        ),
        PageBreak(),
        p("Qualité métier : forces et défauts", "h1"),
        metric_cards(
            [
                (pct(current["quality"]["supplierAccuracy"]), "fournisseur"),
                (pct(current["quality"]["identifierAccuracy"]), "numéro document"),
                (pct(current["quality"]["totalsAccuracy"]), "totaux"),
                (pct(current["quality"]["lineRecall"]), "rappel lignes"),
            ]
        ),
        Spacer(1, 6 * mm),
        styled_table(
            [
                ["Champ", "Exactitude", "Interprétation"],
                ["Type de document", pct(current["quality"]["documentTypeAccuracy"]), "Défaut concentré sur order_confirmation"],
                ["Date document", pct(current["quality"]["documentDateAccuracy"]), "5 dates fausses/manquantes sur 100"],
                ["Référence produit", pct(current["quality"]["referenceAccuracy"]), "1 ligne manquée sur scan basse résolution"],
                ["Quantité", pct(current["quality"]["quantityAccuracy"]), "Très robuste aux scans"],
                ["Prix unitaire", pct(current["quality"]["unitPriceAccuracy"]), "Très robuste aux scans"],
                ["Total de ligne", pct(current["quality"]["lineTotalAccuracy"]), "Quelques écarts d’arrondi/lecture"],
                ["Taux de TVA", pct(current["quality"]["vatRateAccuracy"]), "Point faible secondaire, surtout finnois"],
            ],
            [42 * mm, 28 * mm, 103 * mm],
        ),
        p("Défaut principal : confirmation vs commande", "h2"),
        info_box(
            f"Sur les 12 documents order_confirmation, le type exact n’est correct que dans {round(current_types['order_confirmation']['quality']['documentTypeAccuracy'] * current_types['order_confirmation']['documents'])}/12 cas. Les numéros, dates de livraison, totaux et lignes sont néanmoins correctement extraits. C’est un problème de classification sémantique du schéma/prompt, pas de lecture du PDF.",
            LIGHT_RED,
            RED,
        ),
        Spacer(1, 5 * mm),
        p("Correctif recommandé", "h2"),
        bullet("Ajouter une règle déterministe ou un exemple explicite : « accusé / order confirmation » → order_confirmation ; « commande émise » → supplier_order."),
        bullet("Ajouter un test de non-régression sur les trois langues, puis réexécuter le sous-ensemble de 24 commandes/confirmations."),
        bullet("Contrôler séparément la date de document et la date de livraison dans le schéma d’annotation."),
        bullet("Pour la TVA, recalculer le taux à partir des montants lorsque le document fournit HT, taxe et TTC."),
        PageBreak(),
        p("Architecture cible et plan d’action", "h1"),
        styled_table(
            [
                ["Étape", "Décision"],
                ["1. Entrée", "Conserver les validations actuelles de taille et MIME."],
                ["2. Lecture", "Appeler directement Mistral OCR avec document_annotation et le schéma ToqueHub."],
                ["3. Résilience", "Sur timeout/réseau/5xx : un retry borné et idempotent ; aucun retry sur erreur fonctionnelle 4xx."],
                ["4. Matching", "Conserver extractBusinessData et le matching fournisseur/produit."],
                ["5. Firecrawl optionnel", "Seulement préflight/diagnostic derrière un feature flag ; ne pas envoyer son Markdown au modèle de chat dans le chemin nominal."],
                ["6. Observabilité", "Mesurer upload, attente, OCR, extraction, matching, persistance et délai UI séparément."],
            ],
            [35 * mm, 138 * mm],
        ),
        p("Seuils de suivi suggérés", "h2"),
        styled_table(
            [
                ["Indicateur", "Seuil d’alerte initial", "Cible"],
                ["Succès premier passage", "< 98,5 %", "≥ 99 %"],
                ["Succès après retry", "< 99,5 %", "≥ 99,8 %"],
                ["Latence p50 cœur OCR", "> 12 s", "< 10 s"],
                ["Latence p95 hors retry", "> 20 s", "< 15 s"],
                ["Type de document exact", "< 95 %", "≥ 97 %"],
                ["Rappel lignes produit", "< 98 %", "≥ 99 %"],
            ],
            [55 * mm, 58 * mm, 60 * mm],
        ),
        p("Ce que Firecrawl peut quand même apporter", "h2"),
        bullet("Détecter instantanément si un PDF est texte, scanné ou mixte, ainsi que les pages nécessitant un OCR."),
        bullet("Refuser ou signaler tôt un PDF vide, corrompu ou avec problèmes d’encodage."),
        bullet("Produire des métriques de qualité d’entrée sans consommer de token distant."),
        bullet("Servir à d’autres usages de lecture simple où aucun JSON métier fiable n’est requis."),
        PageBreak(),
        p("Limites et reproductibilité", "h1"),
        p("Limites à garder en tête", "h2"),
        bullet("Le corpus métier est synthétique et contrôlé. Il permet une vérité terrain exacte et des comparaisons appariées, mais ne reproduit pas tous les logos, tampons, fonds colorés ou particularités fournisseurs réels."),
        bullet("Les documents sont imprimés ; l’écriture manuscrite n’est pas représentée car elle n’est pas le flux principal de factures et bons fournisseur décrit."),
        bullet("Les temps Mistral dépendent du réseau, de la charge du fournisseur et du compte. Les ordres de grandeur et comparaisons appariées sont plus fiables que la valeur absolue d’une exécution unique."),
        bullet("Le chronomètre n’inclut pas upload, stockage objet, file de jobs ni délai d’actualisation de l’interface. Si l’expérience réelle est bien plus lente, ces étapes doivent être instrumentées."),
        bullet("Les intervalles de confiance portent sur les 40 PDF texte du corpus, pas sur l’ensemble futur de documents ToqueHub."),
        p("Reproductibilité", "h2"),
        styled_table(
            [
                ["Élément", "Valeur"],
                ["Date", "2026-08-02 — Europe/Helsinki"],
                ["Firecrawl", "@firecrawl/pdf-inspector 1.11.2"],
                ["Mistral", "mistral-ocr-latest + schéma document_annotation ToqueHub"],
                ["Timeout nominal", "60 s ; retry diagnostique 120 s"],
                ["Répétitions Firecrawl", "5 par document, médiane utilisée"],
                ["Fichiers bruts", "outputs/pdf-ocr-business-benchmark-2026-08-02/"],
                ["Scripts", "benchmarks/pdf-ocr/prepare_business_corpus.py, run_business_benchmark.ts, evaluate_business_results.mjs"],
            ],
            [43 * mm, 130 * mm],
        ),
        Spacer(1, 7 * mm),
        info_box(
            "Verdict final : ne pas remplacer l’OCR ToqueHub par Firecrawl pour l’analyse métier. Conserver l’annotation structurée en un appel, ajouter un retry ciblé, corriger la classification des confirmations de commande et instrumenter les étapes autour de l’OCR.",
            LIGHT_TEAL,
            TEAL,
        ),
    ]

    doc.build(story, onFirstPage=first_page, onLaterPages=later_page)


if __name__ == "__main__":
    with EVALUATION_PATH.open(encoding="utf-8") as handle:
        evaluation_data = json.load(handle)
    with RAW_PATH.open(encoding="utf-8") as handle:
        raw_data = json.load(handle)
    build_report(evaluation_data, raw_data)
    print(OUTPUT_PATH)
