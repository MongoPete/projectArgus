"""
Load MongoDB Agent Skills from the public GitHub repo (mongodb/agent-skills).
Ported from Eugene Kang's Flask PoC — no credentials required for read-only GitHub API.
"""

from __future__ import annotations

import re
from threading import Lock
from typing import Any, Optional

import httpx

GITHUB_HEADERS = {"Accept": "application/vnd.github.v3+json", "User-Agent": "mdba-demo-api"}

# Simple keyword routing (same idea as EK PoC) — maps skill folder slug → trigger phrases
KEYWORD_MAP: dict[str, list[str]] = {
    "mongodb-schema-design": ["schema", "design", "model", "embed", "document structure", "collection design"],
    "mongodb-query-optimizer": ["query", "optimizer", "index", "explain", "slow", "performance", "optimize"],
    "mongodb-natural-language-querying": [
        "natural language",
        "question",
        "nlq",
        "translate",
        "english to query",
    ],
    "mongodb-search-and-ai": ["search", "vector", "atlas search", "full-text", "semantic", "embedding"],
    "mongodb-connection": ["connection", "connect", "driver", "connection string", "uri", "srv"],
    "atlas-stream-processing": ["stream", "change stream", "real-time", "cdc", "event driven"],
    "mongodb-mcp-setup": ["mcp", "model context protocol"],
}

_cache_lock = Lock()
_skills_cache: list[dict[str, Any]] = []


def _parse_skill_md(markdown: str) -> tuple[str, str]:
    name = ""
    description = ""
    for line in markdown.split("\n"):
        heading = re.match(r"^#\s+(.+)", line)
        if heading and not name:
            name = heading.group(1).strip()
            continue
        if name and not description and line.strip():
            description = line.strip()
            break
    return name, description


def load_skills(repo: str, branch: str) -> int:
    """Fetch skills from GitHub; replace cache. Returns count loaded."""
    global _skills_cache
    loaded: list[dict[str, Any]] = []
    list_url = f"https://api.github.com/repos/{repo}/contents/skills?ref={branch}"
    with httpx.Client(timeout=30.0) as client:
        res = client.get(list_url, headers=GITHUB_HEADERS)
        if not res.is_success:
            with _cache_lock:
                _skills_cache = []
            return 0
        entries = res.json()
        if not isinstance(entries, list):
            with _cache_lock:
                _skills_cache = []
            return 0
        dirs = [e for e in entries if e.get("type") == "dir"]
        for d in dirs:
            slug = d["name"]
            raw_url = f"https://raw.githubusercontent.com/{repo}/{branch}/skills/{slug}/SKILL.md"
            md_res = client.get(raw_url, timeout=30.0)
            if md_res.is_success:
                content = md_res.text
                name, description = _parse_skill_md(content)
                loaded.append(
                    {
                        "slug": slug,
                        "name": name or slug,
                        "description": description or "",
                        "content": content,
                    }
                )
            else:
                loaded.append({"slug": slug, "name": slug, "description": "", "content": ""})
    with _cache_lock:
        _skills_cache = loaded
    return len(loaded)


def list_skills_meta() -> list[dict[str, str]]:
    with _cache_lock:
        return [{"slug": s["slug"], "name": s["name"], "description": s["description"]} for s in _skills_cache]


def get_skill(slug: str) -> Optional[dict[str, Any]]:
    with _cache_lock:
        return next((s for s in _skills_cache if s["slug"] == slug), None)


def match_skills_for_task(task_description: str) -> list[dict[str, Any]]:
    desc_lower = task_description.lower()
    matched: list[dict[str, Any]] = []
    for slug, keywords in KEYWORD_MAP.items():
        if any(kw in desc_lower for kw in keywords):
            skill = get_skill(slug)
            if skill and skill.get("content"):
                matched.append(skill)
    return matched


def skills_summary() -> str:
    with _cache_lock:
        if not _skills_cache:
            return "(no MongoDB agent skills loaded yet — call POST /api/skills/reload or wait for startup)"
        return "\n".join(f"- {s['slug']}: {s['name']} — {s['description']}" for s in _skills_cache)


def build_skills_injection_for_prompt(user_message: str, max_skills: int = 4, max_chars_per_skill: int = 3500) -> str:
    """Append matched skill bodies for LLM system context (token-aware truncation)."""
    matched = match_skills_for_task(user_message)[:max_skills]
    if not matched:
        return ""
    parts: list[str] = []
    for s in matched:
        body = (s.get("content") or "")[:max_chars_per_skill]
        parts.append(f"--- SKILL: {s['name']} ({s['slug']}) ---\n{body}")
    return (
        "\n\n=== RELEVANT MONGODB AGENT SKILLS ===\n"
        "Use the following official skill documentation when reasoning about MongoDB:\n\n"
        + "\n\n".join(parts)
        + "\n=== END SKILLS ===\n"
    )


def skill_count() -> int:
    with _cache_lock:
        return len(_skills_cache)
