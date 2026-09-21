"""Shared fixtures. Run against the app source directly (no containers needed).

    cd ~/projects/job-agent-site && python3 -m pytest tests/ -v
"""
import base64
import json
import os
import sys
from pathlib import Path

import pytest

PROJECT = Path(__file__).resolve().parent.parent
APP = PROJECT / "app"
STATIC = APP / "public-static"

sys.path.insert(0, str(APP))

# Minimal env so common.config imports cleanly without real secrets
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("LLM_BASE_URL", "http://localhost:9")
os.environ.setdefault("LLM_MODEL", "test-model")
os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("MCP_JWT_SECRET", "test-secret")


@pytest.fixture()
def resume_static():
    return STATIC


@pytest.fixture()
def resume_data_zh():
    return json.loads((STATIC / "resume-data.json").read_text())


@pytest.fixture()
def resume_data_en():
    return json.loads((STATIC / "resume-data.en.json").read_text())


@pytest.fixture()
def sample_avatar_jpg_bytes():
    """A tiny valid-ish JPEG header (not a real face; face detect will skip)."""
    return bytes.fromhex(
        "ffd8ffe000104a46494600010100000100010000ffdb004300"
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        "ffffffffffffffffffffffffffffffffffffffffffffffffffc000110800010001030122"
        "00021101031101ffc4001f00000105010101010101000000000000000001020304050607"
        "08090a0bffc400b5100002010303020403050404040000017d0102030004110512213141"
        "0613516107227114328191a1082342b1c11552d1f02433627282090a161718191a252627"
        "28292a3435363738393a434445464748494a535455565758595a636465666768696a7374"
        "75767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5"
        "b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3"
        "f4f5f6f7f8f9faffda0008010100003f00fbfa"
    ) + b"\x00" * 512


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()
