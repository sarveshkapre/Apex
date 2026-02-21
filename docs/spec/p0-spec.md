# Apex P0 Structured Spec (Implementation Mapping)

## 1. Scope

P0 implementation target in this repository:

- Asset Graph canonical object/relationship store
- Timeline/provenance/audit trails
- Reconciliation + conflict visibility
- Workflow + approval + exception engine
- Playbooks: JML, Device Lifecycle, SaaS Access
- AI plan/query layer with safety constraints

## 2. Requirement IDs

- `REQ-OBJ-001`: Core object CRUD for first-class object types
- `REQ-REL-001`: Relationship create/list for typed edges
- `REQ-TL-001`: Immutable timeline events for all major state changes
- `REQ-REC-001`: Signal ingestion and candidate matching
- `REQ-REC-002`: Canonical merge with per-field provenance
- `REQ-QUAL-001`: Freshness/completeness/consistency/coverage dashboard
- `REQ-WI-001`: Unified work item model with lifecycle fields
- `REQ-APR-001`: Approval records as first-class entities
- `REQ-WF-001`: Workflow run engine with step progression
- `REQ-WF-002`: High-risk steps gated by approval/permission
- `REQ-WF-003`: Automation logs and exception generation on failures
- `REQ-PLY-001`: Seeded P0 playbooks/workflow definitions
- `REQ-AI-001`: NL-like graph query endpoint with executed filter output
- `REQ-AI-002`: Plan preview endpoint with step risk classification
- `REQ-EVD-001`: Evidence package export for workflow/work item context
- `REQ-RBAC-001`: RBAC checks for object/workflow/approval/audit actions

## 3. API Surface

Implemented under `/v1`:

- Objects, relationships, timeline
- Signals preview/ingest
- Data quality
- Work items + approvals
- Workflow definitions/runs
- Playbooks catalog
- Evidence export
- AI query + plan preview

## 4. Safety Model

- High-risk automation cannot auto-run for roles lacking `automation:high-risk`
- Approval objects are generated when risk or workflow step requires it
- Approval decisions are logged in immutable timeline
- Exceptions are raised automatically for failed automation steps

## 5. Known Gaps to Full PRD

- No persistent database yet
- No frontend surfaces yet (Portal/Console/Command UI)
- Connectors are represented by signal ingest API, not full connector runtime
- Policy authoring/evaluation is not yet a standalone engine
- AI is deterministic rule-driven preview/query, not LLM-integrated yet
