"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { operatorNav, portalNav } from "@/components/layout/nav-config";

const flattenItems = [...portalNav, ...operatorNav].filter(
  (item, index, array) => array.findIndex((candidate) => candidate.href === item.href) === index
);

export function GlobalCommand() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full justify-between rounded-xl border-zinc-300/80 bg-white/70 text-zinc-700 shadow-sm sm:max-w-sm"
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center gap-2 text-sm">
          <Search className="h-4 w-4" />
          Search, ask, or run a plan
        </span>
        <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-[11px]">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Try 'offboard sam today and recover assets'" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {flattenItems.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => {
                  router.push(item.href);
                  setOpen(false);
                }}
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Common actions">
            <CommandItem
              onSelect={() => {
                router.push("/portal/requests");
                setOpen(false);
              }}
            >
              Create a new service request
            </CommandItem>
            <CommandItem
              onSelect={() => {
                router.push("/operator/queues");
                setOpen(false);
              }}
            >
              Open exceptions queue
            </CommandItem>
            <CommandItem
              onSelect={() => {
                router.push("/operator/integrations");
                setOpen(false);
              }}
            >
              Check connector health
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
