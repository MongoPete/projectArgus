from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import get_db
from app.routers import chat, dashboard, findings, flows, runs, settings as settings_router, workflows
from app.seed import demo_findings, demo_workflows


@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.include_router(flows.router)
app.include_router(dashboard.router)
app.include_router(workflows.router)
app.include_router(findings.router)
app.include_router(runs.router)
app.include_router(settings_router.router)


@app.get("/")
async def root():
    return {"service": "mdba-demo-api", "docs": "/docs"}
