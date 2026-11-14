import { Eye, Pencil, Trash2, UsersRound } from "lucide-react";
import { formatDate } from "@/lib/display";
import type { UserRow } from "@/lib/users";

type UsersTableProps = {
  rows: UserRow[] | null;
  error: boolean;
  busyId: number | null;
  onRead: (row: UserRow) => void;
  onEdit: (row: UserRow) => void;
  onDelete: (row: UserRow) => void;
};

export function RoleBadge({ role }: { role: string }) {
  const tone = ["admin", "master"].includes(role) ? "privileged" : ["staff", "volunteer"].includes(role) ? "team" : "member";
  return <span className={`role-badge role-${tone}`}>{role}</span>;
}

function UserIdentity({ row }: { row: UserRow }) {
  return <div className="user-identity"><span className="user-avatar" aria-hidden="true">{row.username.charAt(0).toUpperCase()}</span><span>{row.username}</span></div>;
}

function UserActions({ row, busyId, onRead, onEdit, onDelete }: Pick<UsersTableProps, "busyId" | "onRead" | "onEdit" | "onDelete"> & { row: UserRow }) {
  return (
    <div className="row-actions">
      <button type="button" className="btn btn-small" aria-label={`Read user ${row.username}`} disabled={busyId === row.id} onClick={() => onRead(row)}><Eye aria-hidden="true" />Read</button>
      <button type="button" className="btn btn-small" aria-label={`Update user ${row.username}`} disabled={busyId === row.id} onClick={() => onEdit(row)}><Pencil aria-hidden="true" />Update</button>
      <button type="button" className="btn btn-small btn-danger" aria-label={`Delete user ${row.username}`} disabled={busyId !== null} onClick={() => onDelete(row)}><Trash2 aria-hidden="true" />{busyId === row.id ? "Deleting…" : "Delete"}</button>
    </div>
  );
}

export function UsersTable({ rows, error, ...actions }: UsersTableProps) {
  if (rows === null && !error) {
    return (
      <div className="users-loading" role="status">
        <span className="sr-only">Loading users…</span>
        <div aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton-row"><span className="skeleton skeleton-avatar" /><span className="skeleton skeleton-name" /><span className="skeleton skeleton-detail" /><span className="skeleton skeleton-action" /></div>)}</div>
      </div>
    );
  }
  if (!rows?.length) {
    return (
      <div className="empty-state">
        <UsersRound aria-hidden="true" />
        <h3>{error ? "Users could not load" : "No users yet"}</h3>
        <p>{error ? "Use Read / Refresh to try again." : "Create an account to add someone to your shelter community."}</p>
      </div>
    );
  }
  return (
    <>
      <div className="desktop-users" role="region" aria-label="User accounts table" tabIndex={0}>
        <table className="users-table">
          <caption className="sr-only">User accounts and available actions</caption>
          <thead><tr><th scope="col">ID</th><th scope="col">Username</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Created</th><th scope="col" className="actions-heading">Actions</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id}>
              <td className="record-id">{row.id}</td><td><UserIdentity row={row} /></td><td className="email-cell">{row.email || "Not provided"}</td><td><RoleBadge role={row.role} /></td><td className="date-cell">{formatDate(row.created_at)}</td><td><UserActions row={row} {...actions} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <ul className="mobile-users" aria-label="User accounts">{rows.map((row) => (
        <li className="mobile-user-card" key={row.id}>
          <div className="mobile-user-header"><UserIdentity row={row} /><RoleBadge role={row.role} /></div>
          <dl className="mobile-user-details"><div><dt>Email</dt><dd>{row.email || "Not provided"}</dd></div><div><dt>Created</dt><dd>{formatDate(row.created_at)}</dd></div><div><dt>Account ID</dt><dd>{row.id}</dd></div></dl>
          <UserActions row={row} {...actions} />
        </li>
      ))}</ul>
    </>
  );
}
