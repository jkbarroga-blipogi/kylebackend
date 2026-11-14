"use client";

// Admin dashboard.
// Every button below maps to one function in lib/users.ts, which maps to
// one backend endpoint. That chain is the whole connection map.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, HeartHandshake, Plus, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useAuth } from "@/lib/auth";
import { actionErrorMessage } from "@/lib/messages";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
  updateUserRole,
  type UpdateUserInput,
  type UserRow,
} from "@/lib/users";
import { CreateModal, EditModal, ReadModal } from "./modals";
import { UsersTable } from "./users-table";

export default function DashboardPage() {
  const { session, checked, authed, logout } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [readId, setReadId] = useState<number | null>(null);
  const [readRow, setReadRow] = useState<UserRow | null>(null);
  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const readRequest = useRef(0);
  const signedIn = Boolean(session);

  // Guard: no session after the initial check sends you back to the login screen.
  useEffect(() => {
    if (checked && !session) router.replace("/");
  }, [checked, session, router]);

  // Read / Refresh -> listUsers -> GET /users
  const refresh = useCallback(async () => {
    if (!signedIn) return;
    setRefreshing(true);
    setError("");
    try {
      const data = await listUsers(authed);
      setRows(data);
    } catch (cause) {
      setRows(null);
      setError(actionErrorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  }, [signedIn, authed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Read (row) -> getUser -> GET /users/:id
  async function openRead(row: UserRow) {
    const requestId = ++readRequest.current;
    setReadId(row.id);
    setReadRow(null);
    try {
      const data = await getUser(authed, row.id);
      if (requestId === readRequest.current) setReadRow(data);
    } catch (cause) {
      if (requestId === readRequest.current) {
        setReadId(null);
        setError(actionErrorMessage(cause));
      }
    }
  }

  // Create User -> createUser -> POST /auth/register
  async function handleCreate(input: { username: string; email: string; password: string }) {
    await createUser({
      username: input.username.trim(),
      email: input.email.trim() === "" ? undefined : input.email.trim(),
      password: input.password,
    });
    setCreateOpen(false);
    await refresh();
  }

  // Update -> updateUser -> PUT /users/:id, and when the role changed also
  // updateUserRole -> PUT /users/:id/role
  async function handleSave(
    row: UserRow,
    values: { username: string; email: string; password: string; role: string },
  ) {
    const input: UpdateUserInput = {};
    const username = values.username.trim();
    if (username !== row.username) input.username = username;
    const email = values.email.trim();
    if (email !== (row.email ?? "")) input.email = email === "" ? null : email;
    if (values.password.length > 0) input.password = values.password;

    if (Object.keys(input).length > 0) await updateUser(authed, row.id, input);
    if (values.role !== row.role) await updateUserRole(authed, row.id, values.role);

    setEditRow(null);
    await refresh();
  }

  // Delete -> native browser confirm, then deleteUser -> DELETE /users/:id
  async function remove(row: UserRow) {
    if (busyId !== null) return;
    if (!window.confirm(`Are you sure you want to delete user #${row.id}?`)) return;
    setBusyId(row.id);
    setError("");
    try {
      await deleteUser(authed, row.id);
      await refresh();
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  if (!checked || !session) {
    return <main className="session-loading" role="status"><ShieldCheck aria-hidden="true" /><span>Opening your workspace…</span></main>;
  }

  const stats = [
    { label: "Total accounts", value: rows?.length, note: "Your shelter community", icon: UsersRound },
    { label: "Admins", value: rows?.filter((row) => ["admin", "master"].includes(row.role)).length, note: "Managing the workspace", icon: ShieldCheck },
    { label: "Care team", value: rows?.filter((row) => ["staff", "volunteer"].includes(row.role)).length, note: "Staff and volunteers", icon: HeartHandshake },
  ];

  return (
    <WorkspaceShell count={rows?.length ?? null} onSignOut={handleLogout}>
      <header className="page-heading">
        <p className="eyebrow">Administration</p>
        <h1>User management</h1>
        
      </header>
      <div className="summary-grid" aria-label="Account summary">
        {stats.map(({ label, value, note, icon: Icon }) => (
          <div key={label} className="summary-card">
            <div className="summary-copy"><p>{label}</p>{value === undefined && !error ? <span className="skeleton summary-skeleton" aria-label="Loading count" /> : <strong>{value ?? "-"}</strong>}<span>{note}</span></div>
            <span className="summary-icon"><Icon aria-hidden="true" /></span>
          </div>
        ))}
      </div>
      <section id="users" className="users-panel" aria-labelledby="users-title" aria-busy={refreshing}>
        <div className="panel-header">
          <div className="panel-title"><span className="panel-icon"><UsersRound aria-hidden="true" /></span><div><h2 id="users-title">Users</h2><p>Manage accounts, details, and access.</p></div></div>
          <div className="panel-actions">
            <button type="button" className="btn" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={refreshing ? "spin" : undefined} aria-hidden="true" /> {refreshing ? "Refreshing…" : "Read / Refresh"}
            </button>
            <button type="button" className="btn btn-primary" data-create-user onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" /> Create User
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="alert alert-danger panel-alert">
            <CircleAlert aria-hidden="true" /><span>{error}</span>
          </p>
        ) : null}

        <UsersTable rows={rows} error={Boolean(error)} busyId={busyId} onRead={(row) => void openRead(row)} onEdit={setEditRow} onDelete={(row) => void remove(row)} />
        <div className="panel-footer"><span role="status">{rows ? `${rows.length} ${rows.length === 1 ? "account" : "accounts"}` : "Account directory"}</span><span>Role-based access</span></div>
      </section>

      {readId !== null ? (
        <ReadModal row={readRow} onClose={() => { readRequest.current++; setReadId(null); setReadRow(null); }} />
      ) : null}
      {createOpen ? (
        <CreateModal onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      ) : null}
      {editRow !== null ? (
        <EditModal row={editRow} onClose={() => setEditRow(null)} onSave={(values) => handleSave(editRow, values)} />
      ) : null}
    </WorkspaceShell>
  );
}
