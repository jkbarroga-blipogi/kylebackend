"use client";

import { useCallback, useEffect, useState } from "react";
import { AdopterPortal, type AdopterPageKey } from "@/components/adopter-portal";
import { AnimalPage } from "@/components/animal-page";
import { AppShell, type NavGroup } from "@/components/app-shell";
import { DashboardContent } from "@/components/dashboard-content";
import { LoginForm } from "@/components/login-form";
import { ResourcePage } from "@/components/resource-page";
import { useAuth } from "@/lib/auth-context";
import { canAccess, provisioned, resources } from "@/lib/resources";

const adopterPages: { key: AdopterPageKey; label: string }[] = [
  { key: "available-animals", label: "Available animals" },
  { key: "all-animals", label: "All animals" },
  { key: "my-applications", label: "My applications" },
  { key: "my-details", label: "My details" },
];

function navGroups(role: string): NavGroup[] {
  if (role === "user") {
    return [{ label: "Your adoption journey", items: adopterPages }];
  }
  const groups = new Map<string, { key: string; label: string }[]>();
  groups.set("Workspace", [{ key: "overview", label: "Overview" }]);
  for (const resource of resources) {
    if (resource.key === "species" || resource.key === "breed") continue;
    if (!canAccess(role, resource.key)) continue;
    if (role === "staff" && resource.key === "staff") continue;
    if (!groups.has(resource.group)) groups.set(resource.group, []);
    groups.get(resource.group)?.push({ key: resource.key, label: resource.label });
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

export default function Home() {
  const { session, checked, logout } = useAuth();
  const [currentKey, setCurrentKey] = useState("overview");

  useEffect(() => {
    if (!session) return;
    const requested = new URLSearchParams(window.location.search).get("resource") || "";
    if (session.role === "user") {
      setCurrentKey(adopterPages.some((page) => page.key === requested) ? requested : "available-animals");
    } else {
      setCurrentKey(requested === "overview" || canAccess(session.role, requested) ? requested || "overview" : "overview");
    }
  }, [session]);

  const navigate = useCallback(
    (key: string) => {
      if (!session) return;
      const adopter = session.role === "user";
      let next = key;
      if (adopter) {
        if (!adopterPages.some((page) => page.key === next)) next = "available-animals";
      } else if (next !== "overview" && !canAccess(session.role, next)) {
        next = "overview";
      }
      setCurrentKey(next);
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("resource", next);
      url.hash = "";
      if (url.href !== window.location.href) window.history.pushState(null, "", url);
    },
    [session],
  );

  useEffect(() => {
    const onPopState = () => {
      if (!session) return;
      const key = new URLSearchParams(window.location.search).get("resource") || "";
      navigate(key || (session.role === "user" ? "available-animals" : "overview"));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [session, navigate]);

  if (!checked) {
    return (
      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)]" role="status" aria-label="Loading">
        <span className="sr-only">Loading your workspace...</span>
        <aside className="hidden flex-col gap-4 border-r border-border bg-card p-6 lg:flex" aria-hidden="true">
          <div className="flex items-center gap-3">
            <div className="size-10 animate-pulse rounded-lg bg-secondary" />
            <div className="grid flex-1 gap-2">
              <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-32 animate-pulse rounded bg-secondary" />
            </div>
          </div>
          <div className="h-24 animate-pulse rounded-xl bg-secondary" />
          <div className="h-11 animate-pulse rounded-lg bg-secondary" />
          <div className="h-11 animate-pulse rounded-lg bg-secondary" />
          <div className="h-11 animate-pulse rounded-lg bg-secondary" />
          <div className="h-11 animate-pulse rounded-lg bg-secondary" />
        </aside>
        <main className="grid content-start gap-4 p-8" aria-hidden="true">
          <div className="h-3 w-40 animate-pulse rounded bg-secondary" />
          <div className="h-9 w-56 animate-pulse rounded bg-secondary" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-secondary" />
          <div className="mt-4 h-28 w-full animate-pulse rounded-xl bg-secondary" />
          <div className="h-64 w-full animate-pulse rounded-xl bg-secondary" />
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.06fr_1fr]">
        <section aria-label="About Barroga" className="hidden flex-col border-r border-border bg-card p-12 lg:flex">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark.svg" alt="" width={40} height={40} />
            <span className="text-xl font-semibold tracking-tight">
              Animal
              <span className="mt-1 block text-[11px] font-normal tracking-normal text-muted-foreground">Shelter workspace</span>
            </span>
          </div>
          <div className="my-auto max-w-[560px] py-16">
            <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.13em] text-[#a5adff] uppercase">
              <span className="h-0.5 w-6 bg-[#a5adff]" aria-hidden="true" /> Care, connected.
            </p>
            <h2 className="mt-6 text-6xl leading-[1.08] font-medium tracking-tight">
              A little care.
              <br />A better <span className="text-[#a5adff]">tomorrow.</span>
            </h2>
            <p className="mt-6 max-w-[420px] leading-[1.8] text-muted-foreground">
              One place for the animals you care for, the people who help, and every new beginning.
            </p>
            <div className="mt-12 border-t border-border" aria-label="Shelter care journey">
              {[
                ["01", "A safe arrival", "Give every animal a place to start."],
                ["02", "Care that stays connected", "Keep records and your team in step."],
                ["03", "A place to belong", "Help the next chapter begin."],
              ].map(([number, title, description]) => (
                <div key={number} className="flex items-center gap-5 border-b border-border py-5">
                  <span className="text-sm text-[#a5adff] tabular-nums">{number}</span>
                  <span>
                    <strong className="block font-medium">{title}</strong>
                    <small className="mt-1 block text-sm text-muted-foreground">{description}</small>
                  </span>
                  <span className="ml-auto text-2xl font-light text-muted-foreground" aria-hidden="true">+</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Made for the everyday work of making a difference.</p>
        </section>
        <main className="flex flex-col items-center justify-center px-8 py-16">
          <LoginForm />
          <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-[#a5adff]" aria-hidden="true" /> Barroga shelter management
          </p>
        </main>
      </div>
    );
  }

  const role = session.role;
  const isAdopter = role === "user";
  const isProvisioned = provisioned(role);

  let content: React.ReactNode;
  if (!isProvisioned) {
    content = (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <h1 className="text-2xl font-semibold">Your workspace</h1>
        <p className="mx-auto mt-3 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          Your account is signed in. Ask your administrator to provision a shelter role.
        </p>
      </div>
    );
  } else if (isAdopter) {
    content = <AdopterPortal pageKey={currentKey as AdopterPageKey} onNavigate={navigate} />;
  } else if (currentKey === "overview") {
    content = <DashboardContent />;
  } else if (currentKey === "animal") {
    content = <AnimalPage />;
  } else {
    content = <ResourcePage key={currentKey} resourceKey={currentKey} />;
  }

  return (
    <AppShell
      username={session.username}
      role={role}
      currentKey={currentKey}
      groups={navGroups(role)}
      onNavigate={navigate}
      onLogout={() => void logout()}
    >
      {content}
    </AppShell>
  );
}
