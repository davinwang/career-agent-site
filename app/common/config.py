"""Central config from environment (set by docker-compose / .env)."""
import os

DATA_DIR = os.environ.get("DATA_DIR", "/data")

# LLM (OpenAI-compatible)
LLM_API_KEY = os.environ["LLM_API_KEY"]
LLM_BASE_URL = os.environ["LLM_BASE_URL"]  # e.g. https://open.bigmodel.cn/api/paas/v4
LLM_MODEL = os.environ["LLM_MODEL"]

# Side selection
SIDE = os.environ.get("SIDE", "public")  # public | admin

# Admin auth
ADMIN_USER = os.environ.get("ADMIN_USER", "owner")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

# Paths under DATA_DIR
DOCS_DIR = os.path.join(DATA_DIR, "docs")
MEMORY_DIR = os.path.join(DATA_DIR, "memory")
UPLOAD_DIR = os.path.join(DOCS_DIR, "uploads")
INDEX_PATH = os.path.join(DOCS_DIR, "index.json")
FACTS_PATH = os.path.join(MEMORY_DIR, "facts.json")
