"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Heart, LoaderCircle, LogOut, ShieldCheck, UsersRound } from "lucide-react";
import { Brand } from "./brand";
import { Modal } from "./modal";
import { actionErrorMessage } from "@/lib/messages";

export function WorkspaceShell({ children, count, onSignOut }: { children: ReactNode; count: number | null; onSignOut: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try { await onSignOut(); }
    catch (cause) { setError(actionErrorMessage(cause)); }
    finally { setSigningOut(false); }
  }

  return (
    <div className="workspace-shell">
      <a href="#workspace-content" className="skip-link">Skip to content</a>
      <aside className="workspace-sidebar">
        <Brand />
        <nav aria-label="Administration">
          <p className="eyebrow nav-caption">Workspace</p>
          <a href="#users" className="nav-link" aria-current="page">
            <UsersRound aria-hidden="true" /><span>Users</span>
            {count !== null ? <span className="nav-count">{count}</span> : null}
          </a>
        </nav>
        <div className="sidebar-note">
          <Heart aria-hidden="true" />
          <p>A little care.<br /><strong>A better tomorrow.</strong></p>
          <span>Barroga animal shelter</span>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <p className="workspace-breadcrumb"><span>Workspace</span><ChevronRight aria-hidden="true" /><strong>Users</strong></p>
          <div className="workspace-identity">
            <span className="workspace-mode"><ShieldCheck aria-hidden="true" />Admin console</span>
            <button type="button" aria-label="Sign out" className="btn" onClick={() => setConfirming(true)}><LogOut aria-hidden="true" /><span>Sign out</span></button>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1} className="workspace-main">{children}</main>
        <footer className="workspace-footer">Barroga shelter management<span>People, care, and a better tomorrow.</span></footer>
      </div>
      {confirming ? (
        <Modal title="Sign out of your workspace?" busy={signingOut} onClose={() => { setConfirming(false); setError(""); }}>
          <div className="signout-symbol"><LogOut aria-hidden="true" /></div>
          <p className="modal-description">You will need to sign in again to manage your shelter&apos;s accounts.</p>
          {error ? <p role="alert" className="alert alert-danger">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn" data-cancel autoFocus disabled={signingOut} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" data-confirm disabled={signingOut} onClick={() => void signOut()}>
              {signingOut ? <LoaderCircle className="spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
