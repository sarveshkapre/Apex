import type { ComponentType } from "react";
import {
  AppWindow,
  Boxes,
  CircleHelp,
  Cloud,
  Command,
  FileClock,
  Gauge,
  Home,
  Network,
  NotebookPen,
  Package,
  ShieldCheck,
  Settings2,
  Workflow,
  Wrench
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

export const portalNav: NavItem[] = [
  {
    href: "/portal",
    label: "Home",
    description: "Personal device and request overview",
    icon: Home
  },
  {
    href: "/portal/assets",
    label: "My Assets",
    description: "Devices, accessories, and returns",
    icon: Package
  },
  {
    href: "/portal/access",
    label: "My Access",
    description: "SaaS access and entitlement actions",
    icon: AppWindow
  },
  {
    href: "/portal/requests",
    label: "My Requests",
    description: "Track status timelines and SLAs",
    icon: FileClock
  },
  {
    href: "/portal/help",
    label: "Help / KB",
    description: "Contextual support and escalation",
    icon: CircleHelp
  },
  {
    href: "/portal/command",
    label: "Chat / Command",
    description: "Natural language query and request draft",
    icon: Command
  }
];

export const operatorNav: NavItem[] = [
  {
    href: "/operator",
    label: "Overview",
    description: "Operational posture and active risks",
    icon: Gauge
  },
  {
    href: "/operator/queues",
    label: "Queue Center",
    description: "Unified requests, incidents, exceptions",
    icon: NotebookPen
  },
  {
    href: "/operator/graph",
    label: "Asset Graph",
    description: "Object explorer and relationship map",
    icon: Network
  },
  {
    href: "/operator/workflows",
    label: "Workflows",
    description: "Playbook execution and run history",
    icon: Workflow
  },
  {
    href: "/operator/policies",
    label: "Policies",
    description: "Compliance posture and exception control",
    icon: ShieldCheck
  },
  {
    href: "/operator/cloud",
    label: "Cloud",
    description: "Tag governance and remediation",
    icon: Cloud
  },
  {
    href: "/operator/saas",
    label: "SaaS",
    description: "License reclaim and entitlement governance",
    icon: AppWindow
  },
  {
    href: "/operator/renewals",
    label: "Renewals",
    description: "Contract renewal pipeline and reminders",
    icon: FileClock
  },
  {
    href: "/operator/integrations",
    label: "Integrations",
    description: "Connector health and sync control",
    icon: Boxes
  },
  {
    href: "/operator/reports",
    label: "Reports",
    description: "Dashboards, exports, evidence",
    icon: Wrench
  },
  {
    href: "/operator/admin",
    label: "Admin Studio",
    description: "Schema, RBAC, catalog, policies",
    icon: Settings2
  }
];
