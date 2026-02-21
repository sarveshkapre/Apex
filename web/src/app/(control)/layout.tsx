import { ControlPlaneShell } from "@/components/layout/control-plane-shell";

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return <ControlPlaneShell>{children}</ControlPlaneShell>;
}
