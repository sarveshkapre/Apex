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
- Admin/operations APIs:
  - custom schemas (`/v1/admin/schemas`)
  - policy CRUD + evaluation (`/v1/admin/policies`, `/v1/admin/policies/:id/evaluate`)
  - policy exceptions lifecycle (`/v1/admin/policies/exceptions`, `/v1/admin/policies/exceptions/:id/action`, `/v1/admin/policies/:id/exceptions`)
  - connector CRUD + run history (`/v1/admin/connectors`, `/v1/admin/connectors/:id/run`)
  - notification rules (`/v1/admin/notifications`)
  - config versioning (`/v1/admin/config-versions`, publish/rollback state transitions)
  - SLA breach computation (`/v1/sla/breaches`)
  - saved views (`/v1/views`)
  - external ticket overlay linking (`/v1/overlay/external-ticket-links`)
  - CSV preview/apply import (`/v1/import/csv/preview`, `/v1/import/csv/apply`)
  - workflow definition lifecycle + simulation (`/v1/workflows/definitions`, `/v1/workflows/definitions/:id/state`, `/v1/workflows/definitions/:id/simulate`)
  - approvals inbox + delegation (`/v1/approvals/inbox`, `/v1/approvals/:id/delegate`)
  - exception queue operations (`/v1/exceptions`, `/v1/exceptions/:id/action`)
  - cloud tag governance coverage + enforcement (`/v1/cloud/tag-governance/coverage`, `/v1/cloud/tag-governance/enforce`)
  - RBAC governance controls (`/v1/admin/rbac/field-restrictions`, `/v1/admin/rbac/sod-rules`, `/v1/admin/rbac/approval-matrix`, `/v1/admin/rbac/authorize`)
- AI assistant APIs:
  - policy draft assistant (`/v1/ai/policy-draft`)
  - workflow draft assistant (`/v1/ai/workflow-draft`)
  - anomaly insights (`/v1/ai/anomaly-insights`)

## Frontend surfaces (`web`)

- `/portal` Home, My Assets, My Access, My Requests, Help/KB, Chat/Command
- `/operator` Overview, Queue Center, Asset Graph, Workflows, Policies, Integrations, Reports, Admin Studio
- Shared command palette with keyboard shortcut (`Cmd/Ctrl + K`)
- Role-aware nav shell and modern minimalist UI built with Next.js + Tailwind + shadcn
- Admin Studio interactive controls for creating schemas/policies/notification rules
- Admin Studio RBAC governance controls (field restrictions, SoD rules, approval matrix, authorization check)
- Operator Queue SLA breach visibility + external ticket linking workflow
- Command surface with AI request drafting, policy/workflow draft generation, and insights
- Workflow Studio with draft/publish/rollback/simulate
- Queue Center controls for approval decisions/delegation and exception retry/resolve/escalate
- Queue Center external ticket comment sync for overlay-mode collaboration
- Admin CSV import wizard and config publish/rollback actions
- Portal catalog request dialog with dynamic form preview + policy-driven approval submission
- Portal asset/access action buttons now create linked requests/incidents against selected objects
- Operator Cloud Tag Governance module with dry-run/live remediation controls
- Reports evidence export panel with downloadable JSON package per work item
- Admin catalog builder for item creation, workflow mapping, dynamic fields, and activation toggles
- Policy exception lifecycle controls (waive/renew/resolve/reopen) in Policies & Compliance

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
- `GET /v1/catalog/items`, `POST /v1/catalog/items`, `PATCH /v1/catalog/items/:id`
- `POST /v1/catalog/items/:id/preview`, `POST /v1/catalog/submit`
- `GET /v1/cloud/tag-governance/coverage`, `POST /v1/cloud/tag-governance/enforce`
- `POST /v1/work-items`, `GET /v1/work-items`, `PATCH /v1/work-items/:id`
- `GET /v1/approvals`, `POST /v1/approvals/:id/decision`
- `GET /v1/workflows/definitions`
- `POST /v1/workflows/runs`, `POST /v1/workflows/runs/:id/advance`
- `GET /v1/evidence/:workItemId`
- `GET /v1/overlay/external-ticket-links/:id/comments`, `POST /v1/overlay/external-ticket-links/:id/comments`
- `POST /v1/ai/query`, `POST /v1/ai/plan-preview`
- `GET/POST /v1/admin/rbac/field-restrictions`
- `GET/POST /v1/admin/rbac/sod-rules`
- `GET/POST /v1/admin/rbac/approval-matrix`
- `POST /v1/admin/rbac/authorize`
- `GET /v1/admin/policies/exceptions`, `POST /v1/admin/policies/exceptions/:id/action`

## Actor/role simulation

Set headers on requests:

- `x-actor-id`
- `x-actor-role` (`end-user`, `it-agent`, `asset-manager`, `it-admin`, `security-analyst`, `finance`, `app-owner`, `auditor`)

## Notes

This is intentionally an implementation baseline with in-memory persistence and deterministic behavior, designed for rapid iteration toward full product parity.
