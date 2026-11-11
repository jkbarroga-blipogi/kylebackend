"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Heart, House, PawPrint, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { animalPhotoUrl } from "@/lib/animal-photos";
import { useAuth } from "@/lib/auth-context";

type AnimalRow = {
  animal_id: number;
  breed_id?: number;
  animal_name: string;
  sex?: string;
  color?: string | null;
  arrival_date: string;
  adoption_status: string;
  image_url?: string | null;
  breed?: { breed_id: number; species_id: number; breed_name: string } | null;
};

function dateValue(value: string | null | undefined): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function statusBadgeClass(status: string): string {
  const key = status.trim().toLowerCase();
  if (["available", "adopted", "completed", "approved"].includes(key)) return "status-positive";
  if (["pending", "review", "quarantine"].includes(key)) return "status-warning";
  if (["rejected", "cancelled", "canceled", "deceased"].includes(key)) return "status-negative";
  return "status-neutral";
}

export function DashboardContent({ onNavigate }: { onNavigate: (key: string) => void }) {
  const { session, request } = useAuth();
  const [rows, setRows] = useState<AnimalRow[] | null>(null);
  const [error, setError] = useState("");

  function load() {
    if (!session) return;
    return request("animal")
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("Unexpected animal response. Reload to try again.");
        setError("");
        setRows(data as AnimalRow[]);
      })
      .catch((loadError: unknown) => {
        setRows(null);
        setError(loadError instanceof Error ? loadError.message : "Animals could not load. Reload to try again.");
      });
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const arrivals = [...(rows ?? [])]
    .sort((a, b) => String(b.arrival_date).localeCompare(String(a.arrival_date)))
    .slice(0, 6);

  const totalCount = rows?.length ?? 0;
  const availableCount =
    rows?.filter((animal) => String(animal.adoption_status ?? "").trim().toLowerCase() === "available").length ?? 0;
  const adoptedCount =
    rows?.filter((animal) => String(animal.adoption_status ?? "").trim().toLowerCase() === "adopted").length ?? 0;

  const stats = [
    { label: "Total animals", value: rows ? totalCount : undefined, note: "Every animal in your care", icon: PawPrint },
    { label: "Available for adoption", value: rows ? availableCount : undefined, note: "Ready for a loving home", icon: Heart },
    { label: "Adopted", value: rows ? adoptedCount : undefined, note: "Placed with families", icon: House },
  ];

  return (
    <div className="grid gap-7">
      <div className="relative overflow-hidden rounded-2xl border border-[#4c4a82]/40 bg-gradient-to-br from-[#191d2b] via-[#131722] to-[#1a1836] p-6 shadow-xl sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-[#a5adff]/25 bg-[#23223d]/80 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-[#c7caff] uppercase">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Dashboard
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Overview</h1>
            <p className="mt-2 max-w-[640px] text-sm leading-relaxed text-muted-foreground">
              Welcome back, <span className="font-medium text-foreground">{session?.username}</span>. Here is what needs your attention today.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="?resource=animal"
              prefetch={false}
              onNavigate={(event) => { event.preventDefault(); onNavigate("animal"); }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#857cf1]/40 bg-[#4f46e5] px-4 text-xs font-semibold text-white shadow-md transition hover:bg-[#4338ca]"
            >
              Explore animals <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            {(session?.role === "admin" || session?.role === "master") ? (
              <Link
                href="?resource=users"
                prefetch={false}
                onNavigate={(event) => { event.preventDefault(); onNavigate("users"); }}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-secondary/80 px-4 text-xs font-medium text-foreground transition hover:bg-secondary"
              >
                Manage users
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          {error}{" "}
          <Button type="button" variant="secondary" size="sm" className="ml-2" onClick={() => void load()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      <div className="dashboard-stats !mb-0" aria-label="Shelter overview" aria-busy={rows === null && !error}>
        {stats.map(({ label, value, note, icon: Icon }) => (
          <Card key={label} className="overflow-hidden border-border/90 transition hover:border-[#6366f1]/40">
            <CardContent className="dashboard-stat">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                {rows === null && !error ? (
                  <Skeleton className="mt-3 h-10 w-16" />
                ) : (
                  <p className="stat-value">
                    {value ?? <span className="text-base text-muted-foreground">Unavailable</span>}
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">{note}</p>
              </div>
              <span className="stat-icon">
                <Icon className="size-5" aria-hidden="true" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden" aria-busy={rows === null && !error}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-6">
          <div>
            <h2 className="text-lg font-semibold">Latest arrivals</h2>
            <p className="mt-1 text-sm text-muted-foreground">The newest companions in your shelter.</p>
          </div>
          <Link
            href="?resource=animal"
            prefetch={false}
            onNavigate={(event) => { event.preventDefault(); onNavigate("animal"); }}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3.5 text-xs font-medium text-[#c7caff] no-underline transition hover:bg-secondary"
          >
            View all animals <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {rows === null && !error ? (
          <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          </div>
        ) : arrivals.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-lg font-semibold">A fresh start</h3>
            <p className="mx-auto mt-2 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
              New animal arrivals will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {arrivals.map((animal) => {
              const photo = animalPhotoUrl(animal);
              return (
                <Link
                  key={animal.animal_id}
                  href="?resource=animal"
                  prefetch={false}
                  onNavigate={(event) => { event.preventDefault(); onNavigate("animal"); }}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-secondary/35 no-underline transition hover:-translate-y-0.5 hover:border-[#6366f1]/50 hover:bg-secondary/60"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={animal.animal_name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span
                      className={`absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md ${statusBadgeClass(animal.adoption_status)}`}
                    >
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {animal.adoption_status}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="truncate text-base font-semibold text-foreground">{animal.animal_name}</strong>
                        <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                          ID {animal.animal_id}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {animal.breed?.breed_name ? `${animal.breed.breed_name} - ` : ""}
                        {animal.sex || "Companion"}
                      </p>
                    </div>
                    <p className="mt-3 border-t border-border/70 pt-2.5 text-xs text-muted-foreground">
                      Arrived {dateValue(animal.arrival_date) || "date unavailable"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
