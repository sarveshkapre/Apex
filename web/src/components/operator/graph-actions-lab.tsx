"use client";

import * as React from "react";
import { Link2, Play, Plus, Unlink2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  createChildObject,
  createRelationship,
  listObjects,
  listRelationships,
  startObjectWorkflow,
  unlinkRelationship
} from "@/lib/apex";
import { GraphObject, GraphRelationship, RelationshipType, WorkflowDefinition } from "@/lib/types";

const relationshipTypes: RelationshipType[] = [
  "assigned_to",
  "owned_by",
  "located_in",
  "member_of",
  "has_identity",
  "has_account",
  "consumes",
  "installed_on",
  "contains",
  "depends_on",
  "linked_to",
  "evidence_for"
];

const childObjectTypes = [
  "Accessory",
  "Device",
  "SoftwareInstallation",
  "CustomObject"
];

export function GraphActionsLab({
  initialObjects,
  initialRelationships,
  workflows
}: {
  initialObjects: GraphObject[];
  initialRelationships: GraphRelationship[];
  workflows: WorkflowDefinition[];
}) {
  const [objects, setObjects] = React.useState(initialObjects);
  const [relationships, setRelationships] = React.useState(initialRelationships);

  const [fromObjectId, setFromObjectId] = React.useState(initialObjects[0]?.id ?? "");
  const [toObjectId, setToObjectId] = React.useState(initialObjects[1]?.id ?? "");
  const [relationshipType, setRelationshipType] = React.useState<RelationshipType>("linked_to");

  const [parentObjectId, setParentObjectId] = React.useState(initialObjects[0]?.id ?? "");
  const [childType, setChildType] = React.useState("Accessory");
  const [childRelationshipType, setChildRelationshipType] = React.useState<RelationshipType>("contains");
  const [childName, setChildName] = React.useState("Dock");
  const [childSerial, setChildSerial] = React.useState("ACC-001");

  const [workflowObjectId, setWorkflowObjectId] = React.useState(initialObjects[0]?.id ?? "");
  const [workflowId, setWorkflowId] = React.useState(workflows[0]?.id ?? "");
  const [workflowNote, setWorkflowNote] = React.useState("Started from graph object context.");

  const [status, setStatus] = React.useState("");

  const byId = React.useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects]
  );

  const refreshRelationships = async () => {
    const latest = await listRelationships();
    setRelationships(latest);
  };

  const refreshObjects = async () => {
    const latest = await listObjects();
    setObjects(latest);
  };

  const linkRelationship = async () => {
    if (!fromObjectId || !toObjectId) {
      setStatus("Select both objects for linking.");
      return;
    }
    try {
      await createRelationship({
        fromObjectId,
        toObjectId,
        type: relationshipType
      });
      await refreshRelationships();
      setStatus("Relationship linked.");
    } catch {
      setStatus("Unable to link relationship.");
    }
  };

  const unlink = async (relationshipId: string) => {
    try {
      await unlinkRelationship(relationshipId, "Unlinked from graph explorer");
      await refreshRelationships();
      setStatus("Relationship unlinked.");
    } catch {
      setStatus("Unable to unlink relationship.");
    }
  };

  const createChild = async () => {
    if (!parentObjectId) {
      setStatus("Select a parent object first.");
      return;
    }
    try {
      await createChildObject({
        parentObjectId,
        childType,
        relationshipType: childRelationshipType,
        fields: {
          name: childName,
          serial_number: childSerial,
          type: childType
        }
      });
      await Promise.all([refreshObjects(), refreshRelationships()]);
      setStatus("Child object created and linked.");
    } catch {
      setStatus("Unable to create child object.");
    }
  };

  const startWorkflow = async () => {
    if (!workflowObjectId || !workflowId) {
      setStatus("Select object and workflow.");
      return;
    }
    try {
      const result = await startObjectWorkflow({
        objectId: workflowObjectId,
        definitionId: workflowId,
        inputs: {
          note: workflowNote,
          startedFrom: "graph-explorer"
        }
      });
      setStatus(`Workflow started: ${result.run.status}.`);
    } catch {
      setStatus("Unable to start workflow from object context.");
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-sm font-medium text-zinc-900">Graph actions</p>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
        <p className="mb-2 text-xs font-medium text-zinc-800">Link objects</p>
        <div className="grid gap-2 md:grid-cols-4">
          <Select value={fromObjectId} onValueChange={setFromObjectId}>
            <SelectTrigger><SelectValue placeholder="From object" /></SelectTrigger>
            <SelectContent>
              {objects.map((object) => (
                <SelectItem key={`from-${object.id}`} value={object.id}>
                  {object.type} • {object.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={toObjectId} onValueChange={setToObjectId}>
            <SelectTrigger><SelectValue placeholder="To object" /></SelectTrigger>
            <SelectContent>
              {objects.map((object) => (
                <SelectItem key={`to-${object.id}`} value={object.id}>
                  {object.type} • {object.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={relationshipType} onValueChange={(value) => setRelationshipType(value as RelationshipType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {relationshipTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-lg" onClick={linkRelationship}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />Link
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
        <p className="mb-2 text-xs font-medium text-zinc-800">Create child object</p>
        <div className="grid gap-2 md:grid-cols-4">
          <Select value={parentObjectId} onValueChange={setParentObjectId}>
            <SelectTrigger><SelectValue placeholder="Parent object" /></SelectTrigger>
            <SelectContent>
              {objects.map((object) => (
                <SelectItem key={`parent-${object.id}`} value={object.id}>
                  {object.type} • {object.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={childType} onValueChange={setChildType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {childObjectTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={childRelationshipType} onValueChange={(value) => setChildRelationshipType(value as RelationshipType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {relationshipTypes.map((type) => (
                <SelectItem key={`child-rel-${type}`} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-lg" onClick={createChild}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Create child
          </Button>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <Input value={childName} onChange={(event) => setChildName(event.target.value)} placeholder="Child name" />
          <Input value={childSerial} onChange={(event) => setChildSerial(event.target.value)} placeholder="Child serial" />
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
        <p className="mb-2 text-xs font-medium text-zinc-800">Start workflow from object</p>
        <div className="grid gap-2 md:grid-cols-3">
          <Select value={workflowObjectId} onValueChange={setWorkflowObjectId}>
            <SelectTrigger><SelectValue placeholder="Object" /></SelectTrigger>
            <SelectContent>
              {objects.map((object) => (
                <SelectItem key={`wf-object-${object.id}`} value={object.id}>
                  {object.type} • {object.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={workflowId} onValueChange={setWorkflowId}>
            <SelectTrigger><SelectValue placeholder="Workflow" /></SelectTrigger>
            <SelectContent>
              {workflows.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>{workflow.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-lg" onClick={startWorkflow}>
            <Play className="mr-1.5 h-3.5 w-3.5" />Start workflow
          </Button>
        </div>
        <Input className="mt-2" value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} placeholder="Execution note" />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
        <p className="mb-2 text-xs font-medium text-zinc-800">Relationships ({relationships.length})</p>
        <div className="space-y-1 text-xs text-zinc-600">
          {relationships.slice(0, 10).map((relationship) => {
            const from = byId.get(relationship.fromObjectId);
            const to = byId.get(relationship.toObjectId);
            return (
              <div key={relationship.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1">
                <p>
                  {relationship.type}: {from?.type ?? "Object"} {relationship.fromObjectId.slice(0, 8)} {" -> "} {to?.type ?? "Object"} {relationship.toObjectId.slice(0, 8)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-md"
                  disabled={relationship.type === "evidence_for"}
                  onClick={() => unlink(relationship.id)}
                >
                  <Unlink2 className="mr-1 h-3 w-3" />Unlink
                </Button>
              </div>
            );
          })}
          {relationships.length === 0 ? <p>No relationships yet.</p> : null}
        </div>
      </div>

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
