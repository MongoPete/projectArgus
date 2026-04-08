# Branch `mongomerge` — Peter + Eugene integration notes

This branch merges **concepts and safe code patterns** from Eugene Kang’s Flask/React Flow PoC (local reference: `EKFiles/mdba 2/`, **not committed** — it may contain secrets) into the **FastAPI + Vite MDBA demo**.

## Meeting summary → what landed in code

| Theme | Eugene’s PoC | This branch (MDBA demo) |
| ----- | ------------ | ------------------------ |
| Tool / DAG workflow UI | React Flow + per-node prompts, prior-step memory | Already in **Ask → Flow builder** (`/assistant/flow`) with mock runner |
| **MongoDB Agent Skills** as LLM context | Fetch `mongodb/agent-skills` from GitHub, keyword-match, inject into system prompt | **`backend/app/services/agent_skills.py`** + **`GET/POST /api/skills`**; OpenAI chat appends matched skills when `OPENAI_API_KEY` is set |
| **Atlas Admin API** catalog / live calls | OAuth service account + `atlas_api()` helper | **`GET /api/atlas/status`** (optional) if `ATLAS_CLIENT_ID` / `ATLAS_CLIENT_SECRET` are set |
| Argus / change streams as bus | Architectural direction | **Documented only** in README *Limits of this POC*; no consumer added here |
| Per-node execution (MongoDB / MDBA / Atlas) | Real LLM + `exec` of generated code | **Not ported** — high risk for a shared demo; flow runner remains mock unless you add a gated executor later |

## API additions

- `GET /api/skills` — list skill slugs / names / descriptions (cached at startup).
- `GET /api/skills/{slug}` — full skill payload including `SKILL.md` body.
- `POST /api/skills/reload` — re-fetch from GitHub.
- `GET /api/atlas/status` — `{ configured, ok?, data? }` — lists projects when credentials are valid.

## Environment

See `backend/.env.example`. Never commit Atlas or OpenAI keys.

## Future (not in this merge)

- Optional **live** flow-node execution behind a feature flag (Atlas + read-only PyMongo), mirroring Eugene’s `/api/mdba_flow/.../execute`.
- Change-stream **trigger worker** aligned with Argus narrative.

## Credits

MDBA direction and PoCs: **Mark Scott, Eugene Kang, Sara Beddouch, Peter Do** (see root `README.md`).
