"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { Badge, ClipboardList, HeartPulse, Home, LayoutDashboard, PawPrint, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export type NavItem = { key: string; label: string };
export type NavGroup = { label: string; items: NavItem[] };

const icons: Record<string, ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>> = {
  overview: LayoutDashboard,
  animal: PawPrint,
  "available-animals": PawPrint,
  "medical-record": HeartPulse,
  adopter: Users,
  "adoption-application": ClipboardList,
  adoption: Home,
  staff: Badge,
  users: Shield,
  "my-applications": ClipboardList,
  "my-details": Users,
};

type AppShellProps = {
  username: string;
  role: string;
  currentKey: string;
  groups: NavGroup[];
  onNavigate: (key: string) => void;
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({ username, role, currentKey, groups, onNavigate, onLogout, children }: AppShellProps) {
  const displayRole = role === "user" ? "Adopter" : role;
  const currentLabel = groups.flatMap((group) => group.items).find((item) => item.key === currentKey)?.label ?? "Workspace";
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
      setConfirming(false);
    }
  }
  return (
    <div className="workspace-shell">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">Skip to content</a>
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.svg" alt="" width={36} height={36} />
          <span className="text-lg font-semibold tracking-tight">
            Animal
            <span className="mt-0.5 block text-[10px] font-normal tracking-normal text-muted-foreground">Shelter management</span>
          </span>
        </div>
        <nav aria-label="Workspace navigation" className="workspace-nav">
          {groups.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-group-label">{group.label}</p>
              <div className="nav-items">
                {group.items.map((item) => {
                  const Icon = icons[item.key] ?? LayoutDashboard;
                  const active = currentKey === item.key;
                  return (
                    <button key={item.key} type="button" aria-current={active ? "page" : undefined} onClick={() => onNavigate(item.key)} className={active ? "nav-link nav-link-active" : "nav-link"}>
                      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <p className="sidebar-note">A little care.<br /><span className="font-medium text-foreground">a better tomorrow.</span></p>
      </aside>
      <div className="min-w-0">
        <header className="workspace-topbar">
          <p className="workspace-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{currentLabel}</strong></p>
          <div className="workspace-identity">
            <span className="workspace-avatar" aria-hidden="true">{username.charAt(0).toUpperCase()}</span>
            <div className="workspace-user sr-only sm:not-sr-only">
              <p className="truncate text-xs font-medium">{username}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground capitalize">{displayRole}</p>
            </div>
            <Button type="button" variant="ghost" className="px-2 text-xs" disabled={loggingOut} onClick={() => setConfirming(true)}>
              {loggingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1} className="workspace-main">{children}</main>
      </div>
      {confirming ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="logout-title">
          <div className="w-full max-w-[480px] rounded-xl border border-border bg-card p-8">
            <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">Sign out</p>
            <h2 id="logout-title" className="mt-3 text-xl font-semibold">Sign out of Barroga?</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your session will end. You will need to sign in again to continue.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" className="flex-1" autoFocus disabled={loggingOut} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" disabled={loggingOut} onClick={() => void signOut()}>
                {loggingOut ? "Signing out..." : "Sign out"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
