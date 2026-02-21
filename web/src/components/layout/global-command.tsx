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
import { searchGlobal } from "@/lib/apex";
import { GlobalSearchResult } from "@/lib/types";

const flattenItems = [...portalNav, ...operatorNav].filter(
  (item, index, array) => array.findIndex((candidate) => candidate.href === item.href) === index
);

const routeForResult = (result: GlobalSearchResult): string => {
  if (result.entity === "object") {
    return `/operator/graph?focus=${encodeURIComponent(result.id)}`;
  }
  if (result.entity === "work-item") {
    return `/operator/queues?focus=${encodeURIComponent(result.id)}`;
  }
  if (result.entity === "workflow") {
    return `/operator/workflows?focus=${encodeURIComponent(result.id)}`;
  }
  return `/portal/help?article=${encodeURIComponent(result.id)}`;
};

export function GlobalCommand() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<GlobalSearchResult[]>([]);
  const [facetTypes, setFacetTypes] = React.useState<Array<{ value: string; count: number }>>([]);
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

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setFacetTypes([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const data = await searchGlobal({
          q,
          objectType: typeFilter
        });
        if (!active) {
          return;
        }
        setSearchResults(data.results.slice(0, 12));
        setFacetTypes(data.facets.types.filter((facet) => facet.value !== "unknown").slice(0, 6));
      } catch {
        if (!active) {
          return;
        }
        setSearchResults([]);
        setFacetTypes([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [open, query, typeFilter]);

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
        <CommandInput
          placeholder="Try 'offboard sam today and recover assets'"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {query.trim().length < 2 ? "Type at least 2 characters to search." : "No results found."}
          </CommandEmpty>

          {query.trim().length >= 2 ? (
            <CommandGroup heading={loading ? "Searching..." : `Search results${typeFilter ? ` (${typeFilter})` : ""}`}>
              {searchResults.map((result) => (
                <CommandItem
                  key={`${result.entity}-${result.id}`}
                  onSelect={() => {
                    router.push(routeForResult(result));
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{result.title}</span>
                  <span className="ml-auto text-xs text-zinc-500">{result.type}</span>
                </CommandItem>
              ))}
              <CommandItem
                onSelect={() => {
                  router.push(`/portal/command?q=${encodeURIComponent(query.trim())}`);
                  setOpen(false);
                }}
              >
                Ask Copilot about &quot;{query.trim()}&quot;
              </CommandItem>
            </CommandGroup>
          ) : null}

          {facetTypes.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Type facets">
                {facetTypes.map((facet) => (
                  <CommandItem
                    key={facet.value}
                    onSelect={() => {
                      setTypeFilter((current) => (current === facet.value ? undefined : facet.value));
                    }}
                  >
                    {facet.value} ({facet.count}){typeFilter === facet.value ? " • active" : ""}
                  </CommandItem>
                ))}
                {typeFilter ? (
                  <CommandItem onSelect={() => setTypeFilter(undefined)}>Clear type filter</CommandItem>
                ) : null}
              </CommandGroup>
            </>
          ) : null}

          <CommandSeparator />
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
