"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, Menu } from "lucide-react";
import { GlobalCommand } from "@/components/layout/global-command";
import { NavItem, operatorNav, portalNav } from "@/components/layout/nav-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Surface = "portal" | "operator";

const navForSurface = (surface: Surface): NavItem[] => (surface === "portal" ? portalNav : operatorNav);

const SurfaceNav = ({ surface, onNavigate }: { surface: Surface; onNavigate?: () => void }) => {
  const pathname = usePathname();
  const items = navForSurface(surface);

  return (
    <nav className="grid gap-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group rounded-xl border px-3 py-2 transition",
              active
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-transparent bg-white/40 text-zinc-700 hover:border-zinc-300 hover:bg-white"
            )}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <item.icon className="h-4 w-4" />
              {item.label}
            </div>
            <p
              className={cn(
                "mt-1 text-xs leading-snug",
                active ? "text-zinc-200" : "text-zinc-500 group-hover:text-zinc-700"
              )}
            >
              {item.description}
            </p>
          </Link>
        );
      })}
    </nav>
  );
};

export function ControlPlaneShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeSurface: Surface = pathname.startsWith("/operator") ? "operator" : "portal";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#d2ede3_0%,_transparent_35%),radial-gradient(circle_at_85%_15%,_#f6e3cc_0%,_transparent_35%),linear-gradient(180deg,_#f7f8f5_0%,_#eff2ea_100%)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-r border-zinc-300/60 bg-white/45 p-4 backdrop-blur-lg lg:block">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Apex</p>
              <h1 className="font-mono text-lg font-semibold text-zinc-900">IT Control Plane</h1>
            </div>
            <Badge className="rounded-full bg-emerald-700 px-2 py-0.5 text-white">Live</Badge>
          </div>
          <div className="mb-4 grid grid-cols-2 rounded-xl border border-zinc-300/70 bg-white p-1 text-xs">
            <Link
              href="/portal"
              className={cn(
                "rounded-lg px-2 py-1.5 text-center font-medium",
                activeSurface === "portal" ? "bg-zinc-900 text-white" : "text-zinc-600"
              )}
            >
              Portal
            </Link>
            <Link
              href="/operator"
              className={cn(
                "rounded-lg px-2 py-1.5 text-center font-medium",
                activeSurface === "operator" ? "bg-zinc-900 text-white" : "text-zinc-600"
              )}
            >
              Operator
            </Link>
          </div>
          <SurfaceNav surface={activeSurface} />
        </aside>

        <main className="px-4 pb-6 pt-4 sm:px-6 lg:px-8">
          <header className="mb-6 flex items-center gap-3 rounded-2xl border border-zinc-300/70 bg-white/70 p-3 shadow-sm backdrop-blur">
            <Sheet>
              <SheetTrigger asChild>
                <Button size="icon" variant="outline" className="rounded-xl lg:hidden">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px] border-zinc-300/80 bg-[#f7f9f4]">
                <div className="mb-4 flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Apex</p>
                    <p className="font-medium">IT Control Plane</p>
                  </div>
                </div>
                <SurfaceNav surface={activeSurface} />
              </SheetContent>
            </Sheet>
            <GlobalCommand />
            <Button size="icon" variant="outline" className="ml-auto rounded-xl">
              <Bell className="h-4 w-4" />
            </Button>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
