"""PDF rendering: CJK font embedding (Alibaba PuHuiTi bundled in the image) and
structure of the generated document."""
import io
import json
from pathlib import Path

import pytest

reportlab = pytest.importorskip("reportlab", reason="reportlab not installed on host")
from common.resumepdf import generate  # noqa: E402

STATIC = Path(__file__).resolve().parent.parent / "app/public-static"


def _data(lang="zh"):
    name = "resume-data.json" if lang in ("", "zh") else f"resume-data.{lang}.json"
    return json.loads((STATIC / name).read_text())


def test_zh_pdf_embeds_real_font_subset():
    """Regression: STSong-Light is a NON-embedded CID font — viewers without an
    Asian font pack render blank pages. zh PDF must now embed a real font."""
    pdf, err = generate("zh")
    assert err == "", err
    assert pdf[:4] == b"%PDF"
    assert b"BaseFont" in pdf
    assert b"FontFile2" in pdf, "no embedded TrueType font program — CJK may render blank"


def test_zh_pdf_text_extractable():
    pypdf = pytest.importorskip("pypdf")
    pdf, err = generate("zh")
    assert err == ""
    r = pypdf.PdfReader(io.BytesIO(pdf))
    assert len(r.pages) >= 1
    text = "".join(p.extract_text() or "" for p in r.pages)
    assert any(ch > "\u4e00" for ch in text), "no Chinese text extracted"


def test_en_pdf_valid():
    pdf, err = generate("en")
    assert err == ""
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 10_000


def test_pdf_contains_candidate_name():
    pypdf = pytest.importorskip("pypdf")
    pdf, err = generate("zh")
    assert err == ""
    r = pypdf.PdfReader(io.BytesIO(pdf))
    text = "".join(p.extract_text() or "" for p in r.pages)
    data = _data("zh")
    assert data["name"] in text, "candidate name missing from rendered PDF"


def test_generate_unpublished_lang_errors_cleanly():
    pdf, err = generate("xx")
    assert pdf is None and err != ""
