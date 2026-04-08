from fastapi import APIRouter, HTTPException

from app.config import settings
from app.services import agent_skills

router = APIRouter(prefix="/api/skills", tags=["agent-skills"])


@router.get("")
async def list_skills():
    """List cached MongoDB agent skills (metadata only)."""
    return agent_skills.list_skills_meta()


@router.get("/{slug}")
async def skill_detail(slug: str):
    skill = agent_skills.get_skill(slug)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.post("/reload")
async def reload_skills():
    """Re-fetch skills from GitHub (mongodb/agent-skills by default)."""
    n = agent_skills.load_skills(settings.agent_skills_repo, settings.agent_skills_branch)
    return {"success": True, "count": n, "repo": settings.agent_skills_repo, "branch": settings.agent_skills_branch}
