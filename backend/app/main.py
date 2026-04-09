import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import get_db
from app.routers import (
    atlas_admin,
    chat,
    dashboard,
    findings,
    flows,
    runs,
    settings as settings_router,
    skills,
    workflows,
)
from app.seed import demo_findings, demo_runs, demo_workflows
from app.services import agent_skills


async def seed_if_empty(db=None):
    """Insert demo data into empty collections. Importable for use after reconnect."""
    if db is None:
        db = get_db()
    if await db.workflows.count_documents({}) == 0:
        for w in demo_workflows():
            doc = dict(w)
            doc["_id"] = doc.pop("id")
            await db.workflows.insert_one(doc)
    if await db.findings.count_documents({}) == 0:
        for f in demo_findings():
            doc = dict(f)
            doc["_id"] = doc.pop("id")
            await db.findings.insert_one(doc)
    if await db.runs.count_documents({}) == 0:
        for r in demo_runs():
            doc = dict(r)
            doc["_id"] = doc.pop("id")
            await db.runs.insert_one(doc)


async def reset_demo_data(db=None):
    """Drop and re-seed all demo collections."""
    if db is None:
        db = get_db()
    for col in ("workflows", "findings", "runs", "flows"):
        await db[col].drop()
    await seed_if_empty(db)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await asyncio.to_thread(agent_skills.load_skills, settings.agent_skills_repo, settings.agent_skills_branch)
    except Exception:
        pass
    await seed_if_empty()
    yield


app = FastAPI(title="MDBA Demo API", lifespan=lifespan)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(skills.router)
app.include_router(atlas_admin.router)
app.include_router(flows.router)
app.include_router(dashboard.router)
app.include_router(workflows.router)
app.include_router(findings.router)
app.include_router(runs.router)
app.include_router(settings_router.router)


@app.get("/")
async def root():
    return {"service": "mdba-demo-api", "docs": "/docs"}
