"""Avatar pipeline: filename aliases Chainlit's /avatars route expects, and the
candidate photo visible on agent replies."""
import os

import pytest

cv2 = pytest.importorskip("cv2", reason="opencv not installed on host")
# avatar.py makes its data directory at import time; point it somewhere writable
os.environ["AVATAR_DIR"] = "/tmp/jas-test-avatar"
os.makedirs("/tmp/jas-test-avatar", exist_ok=True)
from common import avatar  # noqa: E402


def _run_make(monkeypatch, tmp_path, static_dir, jpg_bytes):
    monkeypatch.setattr(avatar, "AVATAR_PATH", tmp_path / "avatar.jpg")
    monkeypatch.setattr(avatar, "STATIC_AVATAR", static_dir / "avatar.jpg")
    monkeypatch.setattr(avatar, "CHAT_AVATAR_DIR", str(tmp_path / "avatars"))
    os.makedirs(tmp_path / "avatars", exist_ok=True)
    static_dir.mkdir(parents=True, exist_ok=True)
    return avatar.make_avatar(jpg_bytes)


def test_make_avatar_writes_all_chainlit_aliases(monkeypatch, tmp_path, sample_avatar_jpg_bytes):
    """Regression: chainlit strips dots in the requested avatar filename, so the
    avatar route looks up 'assistant_jpg.*' — if we only write 'assistant.jpg'
    the chat shows a grey placeholder. All aliases must exist."""
    static_dir = tmp_path / "static"
    try:
        result = _run_make(monkeypatch, tmp_path, static_dir, sample_avatar_jpg_bytes)
    except cv2.error:
        pytest.skip("sample image too minimal for opencv decode in this env")
    avatars = tmp_path / "avatars"
    names = {p.name for p in avatars.iterdir()}
    assert "assistant.jpg" in names
    assert "assistant_jpg.jpg" in names, "dot-stripped alias missing (chat avatar broken)"
    assert (static_dir / "avatar.jpg").exists(), "static resume-page avatar not synced"
    assert result["size"] == 512, "avatar must be 512x512 square crop"


def test_avatar_output_is_valid_jpeg(monkeypatch, tmp_path, sample_avatar_jpg_bytes):
    static_dir = tmp_path / "static"
    try:
        _run_make(monkeypatch, tmp_path, static_dir, sample_avatar_jpg_bytes)
    except cv2.error:
        pytest.skip("sample image too minimal for opencv decode in this env")
    raw = (tmp_path / "avatars" / "assistant.jpg").read_bytes()
    assert raw[:2] == b"\xff\xd8", "not a JPEG"
    assert len(raw) < 500_000, "avatar too large for fast page loads"
