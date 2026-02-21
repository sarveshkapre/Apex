# Apex (AI-native IT Control Plane)

This repository now ships a full-stack implementation baseline for Apex:

- Backend control-plane API (`/v1`) with asset graph, workflows, approvals, reconciliation, quality, evidence, and AI-safe planning endpoints
- Next.js frontend (`/web`) with required product surfaces:
  - End-User Portal
  - Operator Console
  - Global Command / Copilot UI

## Implemented capabilities

- Asset Graph core object + relationship APIs
- Immutable timeline events for object/workflow/approval changes
- Signal ingestion + reconciliation candidate matching + canonical merge
- Work items (Request/Incident/Change/Task/Approval/Exception)
- Approval model and high-risk automation gating
- Workflow engine with execution logs and exception item creation
- Built-in playbook workflow definitions:
  - JML Joiner
  - JML Leaver
  - Device Lifecycle Return
  - SaaS Access Request
- Data Quality dashboard API (freshness/completeness/consistency/coverage)
- Evidence package export per work item
- AI endpoints for:
  - graph query (`/v1/ai/query`)
  - plan preview (`/v1/ai/plan-preview`)
  - request draft (`/v1/ai/request-draft`)
  - reconciliation suggestions (`/v1/ai/reconciliation-suggestions`)
- Additional UX-facing APIs:
  - integration health (`/v1/integrations/health`)
  - knowledge base (`/v1/kb/articles`)
  - dashboards (`/v1/dashboards/:name`)
  - catalog items (`/v1/catalog/items`)
  - global search (`/v1/search`)

## Frontend surfaces (`web`)

- `/portal` Home, My Assets, My Access, My Requests, Help/KB, Chat/Command
- `/operator` Overview, Queue Center, Asset Graph, Workflows, Policies, Integrations, Reports, Admin Studio
- Shared command palette with keyboard shortcut (`Cmd/Ctrl + K`)
- Role-aware nav shell and modern minimalist UI built with Next.js + Tailwind + shadcn

## Run

```bash
npm install
npm run dev:all
```

- Backend API: `http://localhost:4000/v1`
- Frontend app: `http://localhost:3000`

You can also run services independently:

```bash
npm run dev:api
npm run dev:web
```

## Test

```bash
npm test
npm run build
npm --prefix web run lint
npm --prefix web run build
```

## Core API endpoints

- `GET /v1/health`
- `POST /v1/objects`, `GET /v1/objects`, `PATCH /v1/objects/:id`
- `POST /v1/relationships`, `GET /v1/relationships`
- `GET /v1/timeline/:entityId`
- `POST /v1/signals/preview`, `POST /v1/signals/ingest`
- `GET /v1/quality`
- `POST /v1/work-items`, `GET /v1/work-items`, `PATCH /v1/work-items/:id`
- `GET /v1/approvals`, `POST /v1/approvals/:id/decision`
- `GET /v1/workflows/definitions`
- `POST /v1/workflows/runs`, `POST /v1/workflows/runs/:id/advance`
- `GET /v1/evidence/:workItemId`
- `POST /v1/ai/query`, `POST /v1/ai/plan-preview`

## Actor/role simulation

Set headers on requests:

- `x-actor-id`
- `x-actor-role` (`end-user`, `it-agent`, `asset-manager`, `it-admin`, `security-analyst`, `finance`, `app-owner`, `auditor`)

## Notes

This is intentionally an implementation baseline with in-memory persistence and deterministic behavior, designed for rapid iteration toward full product parity.
