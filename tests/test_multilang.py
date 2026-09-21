"""Multi-language: language normalization, cookie/file conventions, PDF languages."""
import json
from pathlib import Path

import pytest

from common.kb import normalize_lang

STATIC = Path(__file__).resolve().parent.parent / "app/public-static"


def test_normalize_lang_zh_is_default():
    """zh variants normalize to 'zh' (resume-data.json, no suffix on disk)."""
    for code in ("", "zh", "zh-cn", "zh-CN", "ZH", "zh-TW"):
        assert normalize_lang(code) == "zh"


def test_normalize_lang_other_codes_map_to_primary():
    assert normalize_lang("en-US") == "en"
    assert normalize_lang("en") == "en"
    assert normalize_lang("ja") == "ja"


def test_resume_langs_json_short_labels():
    data = json.loads((STATIC / "resume-langs.json").read_text())
    assert data["langs"], "resume-langs.json must list at least one language"
    for l in data["langs"]:
        assert len(l["label"]) <= 4, f"label for {l['code']} too long: {l['label']}"


def test_resume_data_files_exist_for_all_published_langs():
    langs = json.loads((STATIC / "resume-langs.json").read_text())["langs"]
    for l in langs:
        name = "resume-data.json" if l["code"] in ("", "zh") else f"resume-data.{l['code']}.json"
        assert (STATIC / name).exists(), f"missing {name}"


def test_zh_and_en_resume_data_same_schema(resume_data_zh, resume_data_en):
    """All languages must expose the same top-level keys so the renderer never
    hits a missing field when switching language."""
    for key in resume_data_zh:
        assert key in resume_data_en, f"en resume-data missing key {key!r}"


def test_generate_pdf_every_published_lang():
    """generate() must produce a valid PDF for each published language."""
    from common.resumepdf import generate
    langs = json.loads((STATIC / "resume-langs.json").read_text())["langs"]
    for l in langs:
        pdf, err = generate(l["code"])
        assert err == "", f"generate failed for {l['code']}: {err}"
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 10_000, f"PDF suspiciously small for {l['code']}"


def test_lang_labels_are_short_and_layout_stable():
    """LANG_LABELS mapping in index.html must cover every published language
    with a <=4 char label (keeps the select fixed-width across languages)."""
    import re
    html = (STATIC / "index.html").read_text()
    m = re.search(r"const LANG_LABELS = \{(.*?)\}", html, re.S)
    assert m, "LANG_LABELS missing from index.html"
    labels = dict(re.findall(r"(\w+):'([^']+)'", m.group(1)))
    langs = json.loads((STATIC / "resume-langs.json").read_text())["langs"]
    for l in langs:
        assert l["code"] in labels, f"no short label for {l['code']}"
        assert len(labels[l["code"]]) <= 4
