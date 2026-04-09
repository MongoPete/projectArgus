# MDBA demo scaffold

Web showcase for **MongoDB Database Agents (MDBA)**: configurable workloads, LangGraph orchestration, findings inbox, and run audit trail — backed by **MongoDB**.

**Credits:** Mark Scott, Eugene Kang, Sara Beddouch, and Peter Do.

## Stack

| Layer        | Technology                                      |
| ------------ | ----------------------------------------------- |
| UI           | Vite, React 18, TypeScript, Tailwind CSS        |
| API          | FastAPI, Motor (async MongoDB)                  |
| Orchestration| LangGraph (`ingest` → `analyze` → `synthesize` → `deliver`) |
| Data         | MongoDB Atlas or local — database `mdba_demo` |

## Prerequisites

- **Python 3.9+** (3.10+ recommended)
- **Node.js 18+**
- **MongoDB Atlas** cluster (or local MongoDB). No Docker required.

### Atlas checklist

1. **Database user** with read/write on the target database (e.g. `mdba_demo`).
2. **Network Access** — allow your current IP (or `0.0.0.0/0` for quick demos only).

Connection settings live in **`backend/.env`** (gitignored). Copy from `backend/.env.example` if you need a fresh template.

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`mongodb+srv` URIs need **`dnspython`** (already listed in `requirements.txt`).

- API: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- OpenAPI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

On first start, seed **workflows** and a sample **finding** are inserted if collections are empty.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The dev server proxies `/api` to the backend.

**Entry point:** `/` is a **two-path start page** (outcomes & workflows vs ask & tool flows). Metrics live at `/dashboard`.

## Limits of this POC

Use this section when demoing or pitching so claims stay accurate.

| Area | In this repo |
| ---- | ------------ |
| **Atlas Admin API** | Optional **live** OAuth smoke test: `GET /api/atlas/status` when `ATLAS_CLIENT_ID` / `ATLAS_CLIENT_SECRET` are set. LangGraph runs and the **flow-builder runner** stay **mock** unless you extend them. |
| **Triggers** | `manual`, `schedule`, and `change_stream` exist on workflow **models** and in chat heuristics. There is **no background scheduler** and **no change-stream consumer** — use **Run now** for executions. |
| **Tool flow runner** | **Simulated** log and ordering; palette nodes (Slack, Email, Atlas API, etc.) are **UI + mock**, not outbound integrations. |
| **MongoDB Agent Skills** | Fetched from **`mongodb/agent-skills`** (GitHub) at startup; **OpenAI** chat injects **matched** skills into the system prompt. `GET /api/skills`, `POST /api/skills/reload`. |
| **Stack note** | Demo orchestration uses **LangGraph**; a separate “MongoDB-native event bus” architecture (e.g. change streams as edges) is **not** what this scaffold runs today. |

**Merge notes (Eugene PoC → this app):** see [`docs/MONGOMERGE.md`](docs/MONGOMERGE.md). Local drop `EKFiles/` is gitignored (often contains secrets).

## What to demo

1. **Ask** (`/assistant`) — **Agents** tab: NLP advisor to draft **workflows**. **Tools** tab (`/assistant/flow`): full-height **DAG workshop** (Eugene-style dark UI: 300px tool nodes, indigo edges, dot grid, collapsible palette, resizable terminal). The right **terminal** is a real shell: type `help`, `list`, `edges`, `clear`, `run`, `abort`. **`run`** (and the header Run button) stream **NDJSON** from `POST /api/flows/run/stream` so log lines appear as the mock runner emits them (`state` JSON per step + headings / code / JSON). Save/load flows in MongoDB (`/api/flows`). With `OPENAI_API_KEY`, Agents use **gpt-4o-mini** + structured output; otherwise **heuristic** demos.
2. **Build** (`/builder`) — **Simple** low-code path first: pick what to watch (costs, speed, backups, …), how often, optional name → **Create workflow**. **Custom workflow** opens the full editor (palette, flow map with optional minimap, step inspector). Inspired by calm “consumer-grade” admin UIs (e.g. Glean-style simplicity).
3. **Dashboard** (`/dashboard`) — counts, TCO hints, link into workloads.
4. **Workflows** — seed workloads; **Run now** executes the LangGraph pipeline and writes **findings**.
5. **Findings** — expand rows, acknowledge / approve (HITL) / dismiss.
6. **Runs** — full **trace** of graph nodes.
7. **Quick add** (`/workflows/new`) — minimal list-based composer.

The **analyze** step uses deterministic mock outputs per agent type (`spend`, `slow_query`, `backup`, …). Swap in Atlas Admin API + cluster tools behind LangChain tools when you are ready for live data.

## Project layout

```
MDBA/
├── MDBA_Opportunity_Assessment.md
├── docs/
│   └── MONGOMERGE.md           # Peter + Eugene integration map
├── docker-compose.yml          # optional: local MongoDB only (not required)
├── backend/
│   ├── .env                    # your Atlas URI (gitignored)
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── seed.py
│   │   ├── orchestrator/graph.py
│   │   └── routers/
│   └── requirements.txt
└── frontend/
    └── src/
        ├── api.ts
        ├── pages/
        └── components/Layout.tsx
```

## Configuration

| Variable        | Description                    |
| --------------- | ------------------------------ |
| `MONGODB_URI`   | Connection string (`mongodb+srv://…` or `mongodb://…`) |
| `MONGODB_DB`    | Database name (default `mdba_demo`) |
| `CORS_ORIGINS`  | Comma-separated allowed origins |
| `OPENAI_API_KEY`| Optional — richer chat via `gpt-4o-mini` + structured workflow JSON |
| `ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET` | Optional — Atlas service account for `GET /api/atlas/status` |
| `AGENT_SKILLS_REPO`, `AGENT_SKILLS_BRANCH` | Optional — default `mongodb/agent-skills` / `main` |

Settings load from **`backend/.env`** relative to the backend package (works even if your shell cwd is not `backend/`). See `backend/.env.example`.

**Security:** Never commit real credentials. If a connection string was shared in chat or a ticket, rotate the Atlas user password.
