"use client";

// The three styled modals: Read, Create, Update.
// The modals hold local input state and call back into app/dashboard/page.tsx,
// which owns every API call. No endpoint is touched from this file.

import { useState, type FormEvent } from "react";
import { CircleAlert, LoaderCircle, Plus, Save, ShieldCheck, UserRound } from "lucide-react";
import { Modal } from "@/components/modal";
import { PasswordField } from "@/components/password-field";
import { formatDate } from "@/lib/display";
import { actionErrorMessage } from "@/lib/messages";
import { USER_ROLES, type UserRow } from "@/lib/users";
import { RoleBadge } from "./users-table";

export function ReadModal({ row, onClose }: { row: UserRow | null; onClose: () => void }) {
  return (
    <Modal title="User details" onClose={onClose}>
      {row === null ? (
        <div className="detail-loading" role="status"><LoaderCircle className="spin" aria-hidden="true" />Loading account…</div>
      ) : (
        <>
          <div className="account-preview"><span className="user-avatar" aria-hidden="true"><UserRound /></span><div><strong>{row.username}</strong><span>Account details</span></div><RoleBadge role={row.role} /></div>
          <dl className="detail-list">
            <div><dt>Account ID</dt><dd>{row.id}</dd></div>
            <div><dt>Username</dt><dd>{row.username}</dd></div>
            <div><dt>Email</dt><dd>{row.email || "Not provided"}</dd></div>
            <div><dt>Role</dt><dd><RoleBadge role={row.role} /></dd></div>
            <div><dt>Created</dt><dd>{formatDate(row.created_at)}</dd></div>
          </dl>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

export function CreateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { username: string; email: string; password: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({ username, email, password });
    } catch (cause) {
      setError(actionErrorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <Modal title="Create user" onClose={onClose} busy={busy}>
      <p className="modal-description">Add someone to your shelter. New accounts start with the user role.</p>
      {error ? (
        <p role="alert" className="alert alert-danger">
          <CircleAlert aria-hidden="true" /><span>{error}</span>
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="modal-form">
        <div className="field">
          <label htmlFor="create-username">Username</label>
          <input
            id="create-username"
            name="username"
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={50}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            disabled={busy}
            pattern={".*\\S.*"}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="create-email">Email (optional)</label>
          <input
            id="create-email"
            name="email"
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={255}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <PasswordField id="create-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} required disabled={busy} describedBy="create-password-hint" />
        <p id="create-password-hint" className="field-hint">Use at least 8 characters.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {busy ? "Creating…" : "Create User"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EditModal({
  row,
  onClose,
  onSave,
}: {
  row: UserRow;
  onClose: () => void;
  onSave: (values: { username: string; email: string; password: string; role: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState(row.username);
  const [email, setEmail] = useState(row.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(row.role);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave({ username, email, password, role });
    } catch (cause) {
      setError(actionErrorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Update user #${row.id}`} onClose={onClose} busy={busy}>
      <p className="modal-description">
        Update account details and the access this person needs.
      </p>
      {error ? (
        <p role="alert" className="alert alert-danger">
          <CircleAlert aria-hidden="true" /><span>{error}</span>
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="modal-form">
        <div className="field">
          <label htmlFor="edit-username">Username</label>
          <input
            id="edit-username"
            name="username"
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={50}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            disabled={busy}
            pattern={".*\\S.*"}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="edit-email">Email</label>
          <input
            id="edit-email"
            name="email"
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={255}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <PasswordField id="edit-password" label="New password (optional)" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} disabled={busy} describedBy="edit-password-hint" />
        <p id="edit-password-hint" className="field-hint">Leave blank to keep the current password.</p>
        <div className="field">
          <label htmlFor="edit-role">Role</label>
          <select
            id="edit-role"
            name="role"
            className="input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            disabled={busy}
            aria-describedby="role-hint"
          >
            {USER_ROLES.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <p id="role-hint" className="field-hint"><ShieldCheck aria-hidden="true" />Role changes follow your backend&apos;s permissions.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
