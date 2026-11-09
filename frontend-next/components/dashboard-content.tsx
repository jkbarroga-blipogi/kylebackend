"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";

type AnimalRow = {
  animal_id: number;
  animal_name: string;
  arrival_date: string;
  adoption_status: string;
  image_url?: string | null;
};

function dateValue(value: string | null | undefined): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

export function DashboardContent() {
  const { session, request } = useAuth();
  const [rows, setRows] = useState<AnimalRow[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    if (!session) return;
    setError("");
    try {
      const data = (await request("animal")) as AnimalRow[];
      if (!Array.isArray(data)) throw new Error("Unexpected animal response. Reload to try again.");
      setRows(data);
    } catch (loadError) {
      setRows(null);
      setError(loadError instanceof Error ? loadError.message : "Animals could not load. Reload to try again.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const arrivals = [...(rows ?? [])]
    .sort((a, b) => String(b.arrival_date).localeCompare(String(a.arrival_date)))
    .slice(0, 5);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-3 max-w-[640px] text-sm text-muted-foreground">
            Welcome back, {session?.username}. Here is what needs your attention today.
          </p>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive" className="mb-6">
          {error}{" "}
          <Button type="button" variant="secondary" size="sm" className="ml-2" onClick={() => void load()}>
            Retry
          </Button>
        </Alert>
      ) : null}
      <div className="grid gap-4" role="status" aria-label="Loading dashboard">
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <p className="text-sm text-muted-foreground">Total animals</p>
            {rows === null && !error ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <p className="text-4xl font-medium tracking-tight tabular-nums">{rows === null ? "Unavailable" : rows.length}</p>
            )}
            <p className="text-xs text-muted-foreground">{rows === null && !error ? "Loading..." : rows === null ? "Could not load. Retry to continue." : "Updated just now"}</p>
          </CardContent>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-border p-6">
            <div>
              <h2 className="text-lg font-semibold">Latest arrivals</h2>
              <p className="mt-1 text-sm text-muted-foreground">The newest faces in your shelter.</p>
            </div>
            <a href="?resource=animal" className="inline-flex min-h-8 items-center text-sm no-underline">View all</a>
          </div>
          {rows === null && !error ? (
            <div className="grid gap-3 p-6" aria-hidden="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : arrivals.length === 0 ? (
            <div className="p-12 text-center">
              <h3 className="text-lg font-semibold">A fresh start</h3>
              <p className="mx-auto mt-2 max-w-[460px] text-sm leading-relaxed text-muted-foreground">New animal arrivals will appear here.</p>
            </div>
          ) : (
            <ul className="list-none px-6 py-2">
              {arrivals.map((animal) => (
                <li key={animal.animal_id} className="flex items-center gap-3 border-b border-border py-5 last:border-b-0">
                  {animal.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={animal.image_url} alt="" className="size-10 shrink-0 rounded-lg border border-border object-cover" />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-[#a5adff]">P</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <strong className="block font-medium">{animal.animal_name}</strong>
                    <small className="mt-0.5 block text-muted-foreground">
                      {animal.animal_id} - Arrived {dateValue(animal.arrival_date) || "date unavailable"}
                    </small>
                  </span>
                  <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs">{animal.adoption_status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
