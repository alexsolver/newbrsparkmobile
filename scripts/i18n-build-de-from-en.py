#!/usr/bin/env python3
"""
Build de-DE.json from en-US.json (Google via deep-translator).
- Deduplicates full leaf strings before calling the API.
- Preserves {{mustache}} by translating only text between tokens.
- Skips API calls for strings with no letters (punctuation/numbers only).
- Batches plain strings without placeholders via translate_batch.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

try:
    from deep_translator import GoogleTranslator
except ImportError:
    print("pip install deep-translator", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "src/i18n/locales/en-US.json"
OUT_PATH = ROOT / "src/i18n/locales/de-DE.json"

BRAND_PH = "__ARIA__"
SPLIT_RE = re.compile(r"(\{\{[^}]+\}\})")
HAS_LETTER = re.compile(r"[A-Za-zÀ-ÿ]")


def protect_brand(s: str) -> str:
    return s.replace("Aria", BRAND_PH)


def restore_brand(s: str) -> str:
    if s is None:
        return s
    return s.replace(BRAND_PH, "Aria")


def collect_strings(node, out: list[str]) -> None:
    if isinstance(node, dict):
        for v in node.values():
            collect_strings(v, out)
    elif isinstance(node, list):
        for x in node:
            collect_strings(x, out)
    elif isinstance(node, str):
        out.append(node)


def translate_one(translator: GoogleTranslator, text: str) -> str:
    raw = text
    t = text.strip()
    if not t:
        return raw
    if not HAS_LETTER.search(t):
        return raw
    try:
        out = translator.translate(protect_brand(t))
        if out is None:
            return raw
        return restore_brand(out)
    except Exception as e:
        print(f"[warn] {t[:70]!r}: {e}", file=sys.stderr)
        return raw
    finally:
        time.sleep(0.06)


def translate_with_placeholders(translator: GoogleTranslator, s: str) -> str:
    parts = SPLIT_RE.split(s)
    buf: list[str] = []
    for p in parts:
        if p.startswith("{{") and p.endswith("}}"):
            buf.append(p)
        elif not p:
            buf.append(p)
        elif not HAS_LETTER.search(p):
            buf.append(p)
        else:
            buf.append(translate_one(translator, p) if p.strip() else p)
    return "".join(buf)


def translate_full_string(translator: GoogleTranslator, s: str) -> str:
    if "{{" in s:
        return translate_with_placeholders(translator, s)
    return translate_one(translator, s)


def apply_map(node, mapping: dict[str, str]):
    if isinstance(node, dict):
        return {k: apply_map(v, mapping) for k, v in node.items()}
    if isinstance(node, list):
        return [apply_map(x, mapping) for x in node]
    if isinstance(node, str):
        return mapping.get(node, node)
    return node


def batch_translate_plain(translator: GoogleTranslator, strings: list[str]) -> dict[str, str]:
    """translate_batch for homogeneous chunks; fallback per string on failure."""
    result: dict[str, str] = {}
    chunk_size = 35
    for i in range(0, len(strings), chunk_size):
        chunk = strings[i : i + chunk_size]
        try:
            protected = [protect_brand(s) for s in chunk]
            outs = translator.translate_batch(protected)
            if outs is None or len(outs) != len(chunk):
                raise ValueError("batch size mismatch")
            for src, out in zip(chunk, outs):
                result[src] = restore_brand(out) if out is not None else src
            time.sleep(0.35)
        except Exception as e:
            print(f"[warn] batch {i}: {e}; falling back to single", file=sys.stderr)
            for s in chunk:
                result[s] = translate_one(translator, s)
    return result


def main():
    data = json.loads(EN_PATH.read_text(encoding="utf-8"))
    all_strs: list[str] = []
    collect_strings(data, all_strs)
    seen: set[str] = set()
    unique: list[str] = []
    for s in all_strs:
        if s not in seen:
            seen.add(s)
            unique.append(s)

    with_ph = [s for s in unique if "{{" in s]
    plain_candidates = [s for s in unique if "{{" not in s and HAS_LETTER.search(s)]
    no_api = [s for s in unique if s not in with_ph and s not in plain_candidates]

    translator = GoogleTranslator(source="en", target="de")
    mapping: dict[str, str] = {s: s for s in no_api}

    print(f"Unique strings: {len(unique)} (with {{{{}}}}: {len(with_ph)}, plain: {len(plain_candidates)}, skip: {len(no_api)})", flush=True)

    print("Batch-translating plain strings...", flush=True)
    mapping.update(batch_translate_plain(translator, plain_candidates))

    print("Translating strings with placeholders...", flush=True)
    for j, s in enumerate(with_ph):
        mapping[s] = translate_full_string(translator, s)
        if (j + 1) % 50 == 0:
            print(f"  … {j + 1}/{len(with_ph)}", flush=True)

    out = apply_map(data, mapping)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}", flush=True)


if __name__ == "__main__":
    main()
