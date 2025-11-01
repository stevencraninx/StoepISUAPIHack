# parse_overall_two_wts.py
# Gebruik: python parse_overall_two_wts.py input.txt
import sys
import json
import re
from typing import List, Tuple, Optional, Dict

CODE_RE = re.compile(r"^[A-Z]{3}-\d+$")

def to_int(tok: str) -> Optional[int]:
    try:
        return int(tok)
    except Exception:
        return None

def drop_leading_index(line: str) -> str:
    # verwijder eventueel een leidend volgnummer + spatie ('1 ', '23 ', ...)
    return re.sub(r"^\s*\d+\s+", "", line.strip())

def find_code_index(tokens: List[str], start: int = 0) -> Optional[int]:
    for i in range(start, len(tokens)):
        if CODE_RE.fullmatch(tokens[i]):
            return i
    return None

def parse_line(line: str) -> Tuple[Optional[Dict], Optional[Dict], Optional[str]]:
    """
    Parse een regel naar twee blokken (WT1, WT2).
    Geeft ook een warning-string terug (of None) bij onregelmatigheden.
    """
    warn = None
    line = drop_leading_index(line)
    if not line:
        return None, None, None

    tokens = line.split()
    if len(tokens) < 7:
        return None, None, f"Te weinig tokens: {line}"

    nation = tokens[0]
    code1 = find_code_index(tokens, 0)
    if code1 is None or code1 < 2:
        return None, None, f"Geen eerste code of te vroeg: {line}"

    # WT1 naam = alles tussen nation en eerste code
    name1 = " ".join(tokens[1:code1])

    i = code1 + 1
    if i + 2 >= len(tokens):
        return None, None, f"Onvoldoende velden na code1: {line}"

    points1 = to_int(tokens[i]);   i += 1
    rank1   = to_int(tokens[i]);   i += 1
    time1   = tokens[i] if i < len(tokens) else None
    i += 1

    # Zoek tweede code vanaf huidige positie; alles tot die code is name2
    code2 = find_code_index(tokens, i)
    if code2 is None or code2 <= i:
        # Er is geen geldig tweede blok -> alleen WT1 vullen
        wt1 = {"nation": nation, "points": points1, "rank": rank1, "time": time1, "name": name1}
        return wt1, None, None

    name2 = " ".join(tokens[i:code2])

    j = code2 + 1
    if j + 2 >= len(tokens):
        # onvolledig WT2 blok; toch WT1 teruggeven
        wt1 = {"nation": nation, "points": points1, "rank": rank1, "time": time1, "name": name1}
        return wt1, None, f"Onvolledig WT2 blok: {line}"

    points2 = to_int(tokens[j]);   j += 1
    rank2   = to_int(tokens[j]);   j += 1
    time2   = tokens[j] if j < len(tokens) else None

    wt1 = {"nation": nation, "points": points1, "rank": rank1, "time": time1, "name": name1}
    wt2 = {"nation": nation, "points": points2, "rank": rank2, "time": time2, "name": name2}

    return wt1, wt2, None

def parse_file(path: str) -> Tuple[List[Dict], List[Dict], List[str]]:
    wt1_list, wt2_list, warnings = [], [], []
    with open(path, "r", encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            a, b, warn = parse_line(ln)
            if a: wt1_list.append(a)
            if b: wt2_list.append(b)
            if warn: warnings.append(warn)
    return wt1_list, wt2_list, warnings

def main():
    if len(sys.argv) < 2:
        print("Gebruik: python parse_overall_two_wts.py <input.txt>")
        sys.exit(1)

    in_path = sys.argv[1]
    wt1, wt2, warns = parse_file(in_path)

    # Output-bestanden
    out1 = "wt1_mixed2000m-isu.json"
    out2 = "wt2_mixed2000m-isu.json"

    with open(out1, "w", encoding="utf-8") as f:
        json.dump(wt1, f, ensure_ascii=False, indent=2)
    with open(out2, "w", encoding="utf-8") as f:
        json.dump(wt2, f, ensure_ascii=False, indent=2)

    print(f"WT1 items: {len(wt1)} -> {out1}")
    print(f"WT2 items: {len(wt2)} -> {out2}")
    if warns:
        print("\nWaarschuwingen:")
        for w in warns:
            print(" -", w)

if __name__ == "__main__":
    main()
