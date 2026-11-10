"use client";

import { useCallback, useEffect, useState } from "react";
import { AdopterPortal, type AdopterPageKey } from "@/components/adopter-portal";
import { AnimalPage } from "@/components/animal-page";
import { AuthWelcome } from "@/components/auth-welcome";
import { AppShell, type NavGroup } from "@/components/app-shell";
import { DashboardContent } from "@/components/dashboard-content";
import { LoginForm } from "@/components/login-form";
import { LoginSkeleton } from "@/components/login-skeleton";
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

  if (!checked || !session) {
    return (
      <div className="auth-page">
        <AuthWelcome />
        <main className="auth-main">
          <div className="auth-mobile-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark.svg" alt="" width={36} height={36} />
            <span className="font-semibold tracking-tight">Animal <span className="block text-xs font-normal text-muted-foreground">Shelter management</span></span>
          </div>
          {checked ? <LoginForm /> : <LoginSkeleton />}
          <p className="auth-footer flex items-center gap-2">
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
