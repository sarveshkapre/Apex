import { ApexStore } from "../store/store";

const requiredByType: Record<string, string[]> = {
  Person: ["legal_name", "email", "status", "worker_id"],
  Identity: ["provider", "username", "status"],
  Device: ["serial_number", "asset_tag", "compliance_state", "last_checkin"],
  SaaSAccount: ["app", "status", "last_active"],
  CloudResource: ["provider", "resource_id", "owner"]
};

const staleThresholdHours = 24 * 7;

const hoursSince = (iso: string): number => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  return Math.max(0, (now - then) / 36e5);
};

export const computeQualityDashboard = (store: ApexStore) => {
  const objects = [...store.objects.values()];
  const staleDevices: string[] = [];
  const unknownOwners: string[] = [];
  const unmatchedIdentities: string[] = [];
  const duplicateSerials: string[] = [];
  const orphanCloudResources: string[] = [];

  const serialCount = new Map<string, number>();

  let completenessAccumulator = 0;
  let consistencyAccumulator = 0;
  let freshnessAccumulator = 0;

  for (const object of objects) {
    const required = requiredByType[object.type] ?? [];
    const present = required.filter((field) => object.fields[field] !== undefined && object.fields[field] !== null);
    const completeness = required.length ? present.length / required.length : 1;
    completenessAccumulator += completeness;

    const provenanceConflictCount = Object.values(object.provenance).filter((entries) => {
      const values = entries.map((e) => JSON.stringify(object.fields[e.field]));
      return new Set(values).size > 1;
    }).length;

    const consistency = Math.max(0, 1 - provenanceConflictCount / Math.max(1, Object.keys(object.provenance).length));
    consistencyAccumulator += consistency;

    const freshnessField = (object.fields.last_seen ?? object.fields.last_checkin ?? object.updatedAt) as string;
    const freshness = Math.max(0, 1 - hoursSince(freshnessField) / staleThresholdHours);
    freshnessAccumulator += freshness;

    if (object.type === "Device") {
      const serial = String(object.fields.serial_number ?? "").toLowerCase();
      if (serial.length > 0) {
        serialCount.set(serial, (serialCount.get(serial) ?? 0) + 1);
      }
      if (hoursSince(String(object.fields.last_checkin ?? object.updatedAt)) > staleThresholdHours) {
        staleDevices.push(object.id);
      }
      if (!object.fields.assigned_to_person_id) {
        unknownOwners.push(object.id);
      }
    }

    if (object.type === "Identity") {
      const hasPersonLink = [...store.relationships.values()].some(
        (rel) => rel.type === "has_identity" && rel.toObjectId === object.id
      );
      if (!hasPersonLink) {
        unmatchedIdentities.push(object.id);
      }
    }

    if (object.type === "CloudResource") {
      const hasContainerLink = [...store.relationships.values()].some(
        (rel) => rel.type === "contains" && rel.toObjectId === object.id
      );
      if (!hasContainerLink) {
        orphanCloudResources.push(object.id);
      }
    }
  }

  for (const [serial, count] of serialCount.entries()) {
    if (count > 1) {
      duplicateSerials.push(serial);
    }
  }

  const total = Math.max(1, objects.length);
  const coverage = 1 - (unknownOwners.length + unmatchedIdentities.length + orphanCloudResources.length) / Math.max(1, total);

  return {
    summary: {
      totalObjects: objects.length,
      freshness: Number((freshnessAccumulator / total).toFixed(2)),
      completeness: Number((completenessAccumulator / total).toFixed(2)),
      consistency: Number((consistencyAccumulator / total).toFixed(2)),
      coverage: Number(Math.max(0, coverage).toFixed(2))
    },
    drilldowns: {
      staleDevices,
      unknownOwners,
      unmatchedIdentities,
      duplicateSerials,
      orphanCloudResources
    }
  };
};
