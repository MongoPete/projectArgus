from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env next to backend/ (not the process cwd) so uvicorn works from any directory.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "mdba_demo"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    openai_api_key: Optional[str] = None

    # MongoDB Agent Skills (public GitHub; no token required for reads within rate limits)
    agent_skills_repo: str = "mongodb/agent-skills"
    agent_skills_branch: str = "main"

    # Optional Atlas Admin API (service account OAuth — never commit real values)
    atlas_client_id: Optional[str] = None
    atlas_client_secret: Optional[str] = None


settings = Settings()
