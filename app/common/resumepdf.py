"""Generate a resume PDF from the structured landing-page data (resume-data[.lang].json).

Not the uploaded file: a freshly rendered document from the same data that powers
the public landing page. Chinese (and any CJK content) uses the bundled
Alibaba PuHuiTi fonts (free for commercial use, same approach as gtjaqh-data-agent):
``app/fonts/AlibabaPuHuiTi-3-55-Regular.ttf`` / ``-3-85-Bold.ttf``, copied into the
image at /srv/fonts. Latin-only documents use Helvetica. No silent fallback to
other Chinese fonts (avoids licensing-risk system fonts).
"""
import json
import os
import re
from pathlib import Path

from . import kb

FONT_DIR = Path(os.getenv("FONT_DIR", "/srv/fonts"))
FONT_PATTERNS = {
    "normal": ["alibabapuhuiti-3-55-regular", "alibabapuhuiti-regular"],
    "bold": ["alibabapuhuiti-3-85-bold", "alibabapuhuiti-3-105-heavy", "alibabapuhuiti-3-65-medium"],
}
_font_registered = False
FONT_NORMAL, FONT_BOLD = "PuHuiTi", "PuHuiTi-Bold"
FONT_LATIN, FONT_LATIN_BOLD = "Helvetica", "Helvetica-Bold"


def _find_font(weight: str) -> Path | None:
    if not FONT_DIR.is_dir():
        return None
    files = [p for p in FONT_DIR.iterdir() if p.suffix.lower() in (".ttf", ".ttc", ".otf")]
    for pattern in FONT_PATTERNS[weight]:
        for p in files:
            if pattern in p.name.lower():
                return p
    if weight == "normal":
        for p in sorted(files, key=lambda x: x.name):
            return p
    return None


def _ensure_fonts() -> tuple[str, str]:
    """Register PuHuiTi normal+bold; returns (normal_font, bold_font)."""
    global _font_registered
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    if _font_registered:
        return FONT_NORMAL, FONT_BOLD
    have = set()
    for name, weight in ((FONT_NORMAL, "normal"), (FONT_BOLD, "bold")):
        path = _find_font(weight)
        if not path:
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, str(path), subfontIndex=0) if path.suffix.lower() == ".ttc" else TTFont(name, str(path)))
            have.add(name)
        except Exception:
            pass
    if FONT_NORMAL not in have:
        raise RuntimeError(
            "找不到中文字体：请将 AlibabaPuHuiTi-3-55-Regular.ttf / AlibabaPuHuiTi-3-85-Bold.ttf "
            f"放入 {FONT_DIR}（Docker 打包时随 COPY fonts/ 打入镜像），"
            "或用环境变量 FONT_DIR 指定目录。不做其它字体回退。"
        )
    pdfmetrics.registerFontFamily(
        FONT_NORMAL, normal=FONT_NORMAL,
        bold=FONT_BOLD if FONT_BOLD in have else FONT_NORMAL,
        italic=FONT_NORMAL, boldItalic=FONT_BOLD if FONT_BOLD in have else FONT_NORMAL,
    )
    _font_registered = True
    return FONT_NORMAL, (FONT_BOLD if FONT_BOLD in have else FONT_NORMAL)

# section headings per language
_HEADINGS = {
    "zh": {"summary": "个人简介", "experience": "工作经历", "projects": "项目经验", "skills": "技能", "education": "教育经历"},
    "en": {"summary": "Summary", "experience": "Experience", "projects": "Projects", "skills": "Skills", "education": "Education"},
}
_FALLBACK = _HEADINGS["en"]


def _esc(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _needs_cid(data: dict) -> bool:
    blob = json.dumps(data, ensure_ascii=False)
    return bool(re.search(r"[\u4e00-\u9fff]", blob))


def generate(lang: str = "zh") -> tuple[bytes | None, str]:
    """Returns (pdf_bytes, error). One of the two is None/empty."""
    try:
        data = json.loads(kb.read_resume_page(lang))
    except json.JSONDecodeError:
        return None, "resume page data is corrupt"
    if not data.get("name"):
        return None, f"no resume published for lang={lang}"

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (HRFlowable, Paragraph, SimpleDocTemplate, Spacer)

    cid = _needs_cid(data)
    if cid:
        base, bold = _ensure_fonts()
    else:
        base, bold = FONT_LATIN, FONT_LATIN_BOLD

    ink = colors.HexColor("#1a2233")
    sub = colors.HexColor("#5a6478")
    accent = colors.HexColor("#2563eb")

    s_name = ParagraphStyle("name", fontName=bold, fontSize=20, leading=26, textColor=ink)
    s_status = ParagraphStyle("status", fontName=base, fontSize=10, leading=14, textColor=sub)
    s_tag = ParagraphStyle("tag", fontName=base, fontSize=9, leading=12, textColor=accent)
    s_h2 = ParagraphStyle("h2", fontName=bold, fontSize=12.5, leading=16, textColor=ink,
                          spaceBefore=4, spaceAfter=6)
    s_h3 = ParagraphStyle("h3", fontName=bold, fontSize=10.5, leading=14, textColor=ink)
    s_meta = ParagraphStyle("meta", fontName=base, fontSize=8.5, leading=11, textColor=sub)
    s_body = ParagraphStyle("body", fontName=base, fontSize=9.5, leading=14.5, textColor=ink)
    s_li = ParagraphStyle("li", parent=s_body, leftIndent=10, bulletIndent=2, spaceAfter=1)
    s_skill = ParagraphStyle("skill", parent=s_body, spaceAfter=2)

    h = _HEADINGS.get(lang if lang in _HEADINGS else "", _FALLBACK)
    story = []

    story.append(Paragraph(_esc(data["name"]), s_name))
    if data.get("status"):
        story.append(Spacer(1, 2))
        story.append(Paragraph(_esc(data["status"]), s_status))
    if data.get("tags"):
        story.append(Spacer(1, 4))
        story.append(Paragraph(" · ".join(_esc(t) for t in data["tags"]), s_tag))
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e4e8f0")))

    def _section(title: str):
        story.append(Spacer(1, 8))
        story.append(Paragraph(title, s_h2))
        story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#e4e8f0")))
        story.append(Spacer(1, 4))

    if data.get("summary"):
        _section(h["summary"])
        story.append(Paragraph(_esc(data["summary"]), s_body))

    if data.get("experience"):
        _section(h["experience"])
        for e in data["experience"]:
            # two schemas: {title, meta, points[]} (update_resume_page) or
            # {company, role, period, highlights[]} (bulk-edited JSON)
            title = e.get("title") or " · ".join(
                x for x in (e.get("company"), e.get("role")) if x)
            meta = e.get("meta") or e.get("period") or ""
            points = e.get("points") or e.get("highlights") or []
            story.append(Paragraph(_esc(title), s_h3))
            if meta:
                story.append(Paragraph(_esc(meta), s_meta))
            for p in points:
                story.append(Paragraph(_esc(p), s_li, bulletText="•"))
            story.append(Spacer(1, 5))

    if data.get("projects"):
        _section(h["projects"])
        for p in data["projects"]:
            title = p.get("title") or p.get("name") or ""
            meta = p.get("meta") or p.get("period") or ""
            points = p.get("points") or p.get("highlights") or p.get("content") or []
            demo = p.get("demo_link") or p.get("link") or ""
            repo = p.get("repo_link") or ""
            att = p.get("attachment_link") or ""
            story.append(Paragraph(_esc(title), s_h3))
            if meta:
                story.append(Paragraph(_esc(meta), s_meta))
            links = []
            if demo:
                links.append(f'<a href="{_esc(demo)}" color="#2563eb">{_esc(demo)} ↗</a>')
            if repo:
                links.append(f'<a href="{_esc(repo)}" color="#2563eb">[源代码] {_esc(repo)} ↗</a>')
            if att:
                links.append(f'<a href="{_esc(att)}" color="#2563eb">[附件] {_esc(att)} ↗</a>')
            if links:
                story.append(Paragraph(" | ".join(links), s_li))
            for pt in points:
                story.append(Paragraph(_esc(pt), s_li, bulletText="•"))
            story.append(Spacer(1, 5))

    if data.get("education"):
        _section(h.get("education", "Education"))
        for e in data["education"]:
            school = e.get("school") or e.get("title") or ""
            deg = e.get("degree") or ""
            fld = e.get("field") or ""
            meta = e.get("period") or e.get("meta") or ""
            head = school + (f" · {deg}" if deg else "")
            subline = " · ".join(x for x in (fld, meta) if x)
            story.append(Paragraph(_esc(head), s_h3))
            if subline:
                story.append(Paragraph(_esc(subline), s_meta))
            for dt in (e.get("details") or e.get("points") or []):
                story.append(Paragraph(_esc(dt), s_li, bulletText="•"))
            story.append(Spacer(1, 5))

    if data.get("skills"):
        _section(h["skills"])
        skills = data["skills"]
        if isinstance(skills, dict):
            # {组名: [条目...]} → "组名：条目、条目"
            skills = [f"{g}：{'、'.join(str(x) for x in v)}" for g, v in skills.items()]
        for sk in skills:
            story.append(Paragraph(_esc(sk), s_skill))

    def _footer(canv, doc):
        canv.saveState()
        canv.setFont(base, 7.5)
        canv.setFillColor(sub)
        from reportlab.lib.pagesizes import A4 as _A4
        canv.drawCentredString(_A4[0] / 2, 10 * mm, f"{data['name']} · {doc.page}")
        canv.restoreState()

    doc = SimpleDocTemplate(
        buf := __import__("io").BytesIO(), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
        title=f"{data['name']} - Resume" + (f" ({lang})" if lang != "zh" else ""),
        author=data["name"],
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue(), ""
