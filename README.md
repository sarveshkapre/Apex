# Apex (P0 Foundation)

This repository contains a runnable P0 backend foundation for an AI-native IT control plane based on your PRD.

## What is implemented

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

## Run

```bash
npm install
npm run dev
```

API base URL: `http://localhost:4000/v1`

## Test

```bash
npm test
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
