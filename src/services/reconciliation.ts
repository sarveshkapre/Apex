import { ApexStore } from "../store/store";
import { nowIso } from "../utils/time";
import {
  CanonicalFieldProvenance,
  GraphObject,
  ObjectType,
  ReconciliationCandidate,
  SourceSignal
} from "../domain/types";

const normalize = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const pick = (record: Record<string, unknown>, keys: string[]): string[] => {
  return keys.map((key) => normalize(record[key])).filter((v) => v.length > 0);
};

const compareOverlap = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const rightSet = new Set(right);
  const matches = left.filter((item) => rightSet.has(item)).length;
  return matches / Math.max(left.length, right.length);
};

const ruleFor = (type: ObjectType): { high: string[]; fallback: string[] } => {
  switch (type) {
    case "Person":
      return {
        high: ["worker_id", "email", "emails"],
        fallback: ["legal_name", "start_date", "manager"]
      };
    case "Identity":
      return { high: ["provider", "username", "email"], fallback: ["status"] };
    case "Device":
      return {
        high: ["serial_number", "asset_tag"],
        fallback: ["hostname", "enrollment_id"]
      };
    case "SaaSAccount":
      return { high: ["app", "email", "identity_id"], fallback: ["status"] };
    case "CloudResource":
      return {
        high: ["provider", "provider_resource_id", "resource_id"],
        fallback: ["name", "region"]
      };
    default:
      return { high: ["id"], fallback: ["name"] };
  }
};

export const findCandidates = (store: ApexStore, signal: SourceSignal): ReconciliationCandidate[] => {
  const rules = ruleFor(signal.objectType);
  const signalHigh = pick(signal.snapshot, rules.high);
  const signalFallback = pick(signal.snapshot, rules.fallback);

  const candidates: ReconciliationCandidate[] = [];

  for (const object of store.objects.values()) {
    if (object.type !== signal.objectType) {
      continue;
    }

    const objectHigh = pick(object.fields, rules.high);
    const objectFallback = pick(object.fields, rules.fallback);
    const highScore = compareOverlap(signalHigh, objectHigh);
    const fallbackScore = compareOverlap(signalFallback, objectFallback);
    const score = Math.min(1, highScore * 0.8 + fallbackScore * 0.2);

    if (score < 0.4) {
      continue;
    }

    const conflictingFields = Object.entries(signal.snapshot)
      .filter(([field, value]) => {
        if (!(field in object.fields)) {
          return false;
        }
        return normalize(object.fields[field]) !== normalize(value);
      })
      .map(([field]) => field);

    candidates.push({
      objectId: object.id,
      confidence: Number(score.toFixed(2)),
      matchReason: `Matched ${signal.objectType} using reconciliation keys`,
      conflictingFields
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
};

const deriveProvenance = (
  sourceId: string,
  signalId: string,
  observedAt: string,
  confidence: number,
  fields: Record<string, unknown>
): Record<string, CanonicalFieldProvenance[]> => {
  const result: Record<string, CanonicalFieldProvenance[]> = {};

  for (const field of Object.keys(fields)) {
    result[field] = [
      {
        field,
        sourceId,
        signalId,
        observedAt,
        confidence
      }
    ];
  }

  return result;
};

export const ingestSignal = (
  store: ApexStore,
  signal: SourceSignal,
  actor: string
): { object: GraphObject; candidates: ReconciliationCandidate[]; created: boolean } => {
  store.signals.set(signal.id, signal);
  const candidates = findCandidates(store, signal);
  const top = candidates[0];

  if (!top || top.confidence < 0.75) {
    const object: GraphObject = {
      id: store.createId(),
      tenantId: signal.tenantId,
      workspaceId: signal.workspaceId,
      type: signal.objectType,
      fields: { ...signal.snapshot },
      provenance: deriveProvenance(
        signal.sourceId,
        signal.id,
        signal.observedAt,
        signal.confidence,
        signal.snapshot
      ),
      quality: {
        freshness: 1,
        completeness: 0.6,
        consistency: 1,
        coverage: 0.5
      },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    store.objects.set(object.id, object);
    store.pushTimeline({
      tenantId: object.tenantId,
      workspaceId: object.workspaceId,
      entityType: "object",
      entityId: object.id,
      eventType: "object.created",
      actor,
      source: signal.sourceId,
      createdAt: nowIso(),
      payload: { signalId: signal.id, objectType: object.type }
    });

    return { object, candidates, created: true };
  }

  const matched = store.objects.get(top.objectId);
  if (!matched) {
    throw new Error("Candidate object missing from store");
  }

  for (const [field, value] of Object.entries(signal.snapshot)) {
    const previous = matched.fields[field];
    matched.fields[field] = value;

    matched.provenance[field] = [
      ...(matched.provenance[field] ?? []),
      {
        field,
        sourceId: signal.sourceId,
        signalId: signal.id,
        observedAt: signal.observedAt,
        confidence: signal.confidence
      }
    ];

    if (normalize(previous) !== normalize(value)) {
      store.pushTimeline({
        tenantId: matched.tenantId,
        workspaceId: matched.workspaceId,
        entityType: "object",
        entityId: matched.id,
        eventType: "object.updated",
        actor,
        source: signal.sourceId,
        reason: "reconciliation",
        createdAt: nowIso(),
        payload: { field, previous, next: value }
      });
    }
  }

  matched.updatedAt = nowIso();
  store.objects.set(matched.id, matched);

  return { object: matched, candidates, created: false };
};
