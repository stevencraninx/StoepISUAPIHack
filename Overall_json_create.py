#!/usr/bin/env python
"""
Convert ISU Event Classification PDF -> JSON

Afhankelijkheden:
    pip install pdfplumber
Gebruik:
    python pdf_to_json.py WT3-500m-Women.pdf -o wt3_women500m-isu_auto.json
"""

import json
import re
import argparse
from pathlib import Path

import pdfplumber

# Punten per eindrang, overgenomen uit jouw voorbeeldbestand.
# Vanaf plaats 59 zijn de punten 0.
RANK_POINTS = {
    1: 10000,
    2: 8500,
    3: 7225,
    4: 6141,
    5: 5220,
    6: 4437,
    7: 3771,
    8: 3206,
    9: 2725,
    10: 2316,
    11: 1969,
    12: 1673,
    13: 1422,
    14: 1209,
    15: 1028,
    16: 874,
    17: 743,
    18: 631,
    19: 536,
    20: 456,
    21: 410,
    22: 369,
    23: 332,
    24: 299,
    25: 269,
    26: 242,
    27: 218,
    28: 196,
    29: 177,
    30: 159,
    31: 143,
    32: 129,
    33: 116,
    34: 104,
    35: 94,
    36: 84,
    37: 76,
    38: 68,
    39: 62,
    40: 55,
    41: 50,
    42: 45,
    43: 40,
    44: 36,
    45: 33,
    46: 29,
    47: 27,
    48: 24,
    49: 21,
    50: 19,
    51: 18,
    52: 17,
    53: 16,
    54: 15,
    55: 14,
    56: 13,
    57: 12,
    58: 11,
}


def get_points(rank: int) -> int:
    """Geef punten voor een bepaalde rang."""
    return RANK_POINTS.get(rank, 0)


def parse_classification_pdf(pdf_path: Path):
    """
    Parse de event classification PDF naar ruwe rijen
    met rank, helmet, naam, land, best time.
    """
    # Hoofd-regex voor de meeste regels
    main_pattern = re.compile(
        r"^(?P<rank>\d{1,3})\s+"
        r"(?P<helmet>\d+)\s+"
        r"(?P<name>.+?)\s+"
        r"(?P<nation>[A-Z]{3})\s+.*?"
        r"(?P<time>\d+:\d{2}\.\d{3}|\d{2}\.\d{3}|PEN)$"
    )

    rows = []

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for raw_line in text.splitlines():
                line = " ".join(raw_line.split())
                if not line:
                    continue

                # Header / footer / world record regel overslaan
                if (
                    "EVENT CLASSIFICATION" in line
                    or "Timing & Results" in line
                    or "World Record" in line
                    or "Print Date:" in line
                ):
                    continue
                # World record regel bovenaan
                if line.startswith("41.416 "):
                    continue

                tokens = line.split()

                # Groepslabels ("Final A", "Quarterfinals", "Rep", "Heats", "Preliminaries")
                if tokens[0] in ("Final", "Quarterfinals", "Rep", "Heats", "Preliminaries"):
                    # Strip alles tot aan het eerste getal (dat is de rank)
                    for i, tok in enumerate(tokens):
                        if tok.isdigit():
                            line = " ".join(tokens[i:])
                            tokens = line.split()
                            break

                # Eerst proberen met de hoofd-regex
                m = main_pattern.match(line)
                if m:
                    rows.append(m.groupdict())
                    continue

                # Fallback-parser voor "lastige" regels (bv. zonder tijd of zonder helmet)
                # Zoek laatste 3-letter landcode
                nat_idx = None
                for i, tok in enumerate(tokens):
                    if len(tok) == 3 and tok.isupper():
                        nat_idx = i
                if nat_idx is None:
                    continue

                rank = tokens[0]
                if not rank.isdigit():
                    continue

                # Helmet is token 2 als dat een getal is
                helmet = tokens[1] if len(tokens) > 1 and tokens[1].isdigit() else ""

                # Naam = alles tussen helmet/rank en nation
                if helmet:
                    name_tokens = tokens[2:nat_idx]
                else:
                    name_tokens = tokens[1:nat_idx]
                if not name_tokens:
                    continue
                name = " ".join(name_tokens)

                nation = tokens[nat_idx]

                # Tijd: laatste token als het op tijd lijkt, anders 'PEN' als dat ergens staat, anders leeg
                time = ""
                if any(tok == "PEN" for tok in tokens):
                    time = "PEN"
                else:
                    last = tokens[-1]
                    if re.fullmatch(r"\d+:\d{2}\.\d{3}", last) or re.fullmatch(r"\d{2}\.\d{3}", last):
                        time = last

                rows.append(
                    {
                        "rank": rank,
                        "helmet": helmet,
                        "name": name,
                        "nation": nation,
                        "time": time,
                    }
                )

    # Omzetten naar het gewenste JSON-formaat
    result = []
    for r in rows:
        rank = int(r["rank"])
        result.append(
            {
                "nation": r["nation"],
                "points": get_points(rank),
                "rank": rank,
                "time": r["time"],
                # Naam in hoofdletters achternaam, zoals in jouw voorbeeld
                "name": r["name"].upper(),
            }
        )

    # sorteren op rank, voor de zekerheid
    result.sort(key=lambda x: x["rank"])
    return result


def main():
    parser = argparse.ArgumentParser(description="Convert ISU classification PDF to JSON")
    parser.add_argument("pdf", type=Path, help="Input classification PDF")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output JSON file (default: zelfde naam als PDF, .json)",
    )
    args = parser.parse_args()

    pdf_path = args.pdf
    out_path = args.output or pdf_path.with_suffix(".json")

    data = parse_classification_pdf(pdf_path)

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(data)} rows to {out_path}")


if __name__ == "__main__":
    main()
