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
- Duplicate merge preview/execute/revert workflow with reversible window
- Signal ingestion + reconciliation candidate matching + canonical merge
- Manual field override controls with reason + optional expiry stored in provenance
- Graph object actions for link/unlink, child object creation, and workflow start from object context
- Global search now supports facet and filter-aware result retrieval
- Guided lost/stolen device reporting with approval-gated lock/wipe action planning
- Device custody acknowledgements for receipt and return shipment
- Device lifecycle orchestration planner/executor (request, fulfill, deploy, monitor, service, return, retire)
- Work items (Request/Incident/Change/Task/Approval/Exception)
- Approval model and high-risk automation gating
- Approval timeout lifecycle with expiry and escalation to fallback approver
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
  - contract renewal governance (`/v1/contracts/renewals/overview`, `/v1/contracts/renewals/runs`)
  - report definitions and run artifacts (`/v1/reports/definitions`, `/v1/reports/runs`, `/v1/reports/runs/:id/export`)
  - JML mover planning and execution (`/v1/jml/mover/preview`, `/v1/jml/mover/execute`, `/v1/jml/mover/runs`)
  - duplicate merge operations (`/v1/object-merges/preview`, `/v1/object-merges/execute`, `/v1/object-merges/:id/revert`, `/v1/object-merges/runs`)
  - manual provenance overrides (`/v1/objects/:id/manual-override`)
  - graph object actions (`/v1/relationships/:id/unlink`, `/v1/objects/:id/children`, `/v1/objects/:id/workflows/start`)
  - guided lost/stolen report flow (`/v1/devices/:id/lost-stolen/report`)
  - device acknowledgement actions (`/v1/devices/:id/acknowledgements`)
  - connector CRUD + run history (`/v1/admin/connectors`, `/v1/admin/connectors/:id/run`)
  - notification rules (`/v1/admin/notifications`)
  - config versioning (`/v1/admin/config-versions`, publish/rollback state transitions)
  - SLA breach computation (`/v1/sla/breaches`)
  - saved views (`/v1/views`)
  - external ticket overlay linking (`/v1/overlay/external-ticket-links`)
  - CSV preview/apply import (`/v1/import/csv/preview`, `/v1/import/csv/apply`)
  - workflow definition lifecycle + simulation (`/v1/workflows/definitions`, `/v1/workflows/definitions/:id/state`, `/v1/workflows/definitions/:id/simulate`)
  - approvals inbox + delegation (`/v1/approvals/inbox`, `/v1/approvals/:id/delegate`)
  - approval timeout controls (`/v1/approvals/:id/expiry`, `/v1/approvals/escalations/run`)
  - exception queue operations (`/v1/exceptions`, `/v1/exceptions/:id/action`)
  - cloud tag governance coverage + enforcement (`/v1/cloud/tag-governance/coverage`, `/v1/cloud/tag-governance/enforce`)
  - SaaS reclaim policies + runs + retries (`/v1/saas/reclaim/policies`, `/v1/saas/reclaim/runs`, `/v1/saas/reclaim/runs/:id/retry`)
  - RBAC governance controls (`/v1/admin/rbac/field-restrictions`, `/v1/admin/rbac/sod-rules`, `/v1/admin/rbac/approval-matrix`, `/v1/admin/rbac/authorize`)
- AI assistant APIs:
  - policy draft assistant (`/v1/ai/policy-draft`)
  - workflow draft assistant (`/v1/ai/workflow-draft`)
  - anomaly insights (`/v1/ai/anomaly-insights`)

## Frontend surfaces (`web`)

- `/portal` Home, My Assets, My Access, My Requests, Help/KB, Chat/Command
- `/operator` Overview, Queue Center, Asset Graph, Workflows, Policies, Integrations, Reports, Admin Studio
- Shared command palette with keyboard shortcut (`Cmd/Ctrl + K`)
- Global command palette now executes live backend search with type facets and contextual navigation
- Role-aware nav shell and modern minimalist UI built with Next.js + Tailwind + shadcn
- Admin Studio interactive controls for creating schemas/policies/notification rules
- Admin Studio RBAC governance controls (field restrictions, SoD rules, approval matrix, authorization check)
- Operator Queue SLA breach visibility + external ticket linking workflow
- Command surface with AI request drafting, policy/workflow draft generation, and insights
- Workflow Studio with draft/publish/rollback/simulate
- Queue Center controls for approval decisions/delegation and exception retry/resolve/escalate
- Queue Center timeout escalation controls for pending approvals
- Queue Center bulk operations for assign/priority/tag/comment/workflow-step/export actions
- Queue Center external ticket comment sync for overlay-mode collaboration
- Admin CSV import wizard and config publish/rollback actions
- Portal catalog request dialog with dynamic form preview + policy-driven approval submission
- Portal asset/access action buttons now create linked requests/incidents against selected objects
- Portal assets includes guided lost/stolen dialog with security action planning and approval expectations
- Portal assets includes acknowledgement actions for receipt and return shipment custody events
- Operator Cloud Tag Governance module with dry-run/live remediation controls
- Operator SaaS Governance module for reclaim policy authoring, run history, and retry controls
- Operator Contract Renewals module for upcoming renewal pipeline and reminder runs
- Report Studio with saved definitions, manual runs, schedule metadata, and export artifacts
- Reports evidence export panel with downloadable JSON package per work item
- Admin catalog builder for item creation, workflow mapping, dynamic fields, and activation toggles
- Policy exception lifecycle controls (waive/renew/resolve/reopen) in Policies & Compliance
- Workflow surface includes JML Mover planner with entitlement diff preview and execute path
- Workflow surface includes JML Leaver planner/executor with legal hold, VIP, regional compliance, and unrecovered asset containment handling
- Workflow surface includes JML Joiner planner/executor for identity/device/app onboarding plans with approval-aware risk modeling
- Workflow surface includes Device Lifecycle planner/executor for staged transitions with approval-aware risk gates and execution history
- Asset Graph includes duplicate merge workspace with impact preview and reversible merge runs
- Asset Graph includes provenance override workspace for controlled field-level manual overrides
- Asset Graph includes object action workspace for relationship management and object-context workflow starts

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
- `POST /v1/objects/:id/manual-override`
- `GET /v1/object-merges/runs`, `POST /v1/object-merges/preview`, `POST /v1/object-merges/execute`, `POST /v1/object-merges/:id/revert`
- `POST /v1/relationships`, `GET /v1/relationships`, `POST /v1/relationships/:id/unlink`
- `POST /v1/objects/:id/children`, `POST /v1/objects/:id/workflows/start`
- `POST /v1/devices/:id/lost-stolen/report`
- `POST /v1/devices/:id/acknowledgements`
- `GET /v1/device-lifecycle/runs`, `POST /v1/device-lifecycle/preview`, `POST /v1/device-lifecycle/execute`
- `GET /v1/timeline/:entityId`
- `POST /v1/signals/preview`, `POST /v1/signals/ingest`
- `GET /v1/quality`
- `GET /v1/catalog/items`, `POST /v1/catalog/items`, `PATCH /v1/catalog/items/:id`
- `POST /v1/catalog/items/:id/preview`, `POST /v1/catalog/submit`
- `GET /v1/cloud/tag-governance/coverage`, `POST /v1/cloud/tag-governance/enforce`
- `GET/POST/PATCH /v1/saas/reclaim/policies`, `GET/POST /v1/saas/reclaim/runs`, `POST /v1/saas/reclaim/runs/:id/retry`
- `GET /v1/contracts/renewals/overview`, `GET/POST /v1/contracts/renewals/runs`
- `GET/POST/PATCH /v1/reports/definitions`, `POST /v1/reports/definitions/:id/run`, `GET /v1/reports/runs`, `GET /v1/reports/runs/:id/export`
- `GET /v1/jml/mover/runs`, `POST /v1/jml/mover/preview`, `POST /v1/jml/mover/execute`
- `GET /v1/jml/leaver/runs`, `POST /v1/jml/leaver/preview`, `POST /v1/jml/leaver/execute`
- `GET /v1/jml/joiner/runs`, `POST /v1/jml/joiner/preview`, `POST /v1/jml/joiner/execute`
- `POST /v1/work-items`, `GET /v1/work-items`, `PATCH /v1/work-items/:id`
- `POST /v1/work-items/bulk`
- `GET /v1/approvals`, `POST /v1/approvals/:id/decision`
- `POST /v1/approvals/:id/expiry`, `POST /v1/approvals/escalations/run`
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
