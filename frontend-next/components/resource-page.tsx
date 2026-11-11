"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceEditor } from "@/components/resource-editor";
import { ResourceTable } from "@/components/resource-table";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { deleteOutcome, readRows, type Row } from "@/lib/records";
import { canWrite, getResource } from "@/lib/resources";

type EditorState = { row: Row | null; mode: "view" | "edit" } | null;

export function ResourcePage({ resourceKey }: { resourceKey: string }) {
  const { session, request } = useAuth();
  const resource = getResource(resourceKey);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [followup, setFollowup] = useState<{ applicationId: number; adoptionId: number } | null>(null);
  const [followupBusy, setFollowupBusy] = useState(false);
  const [followupMessage, setFollowupMessage] = useState("");
  const [roleBusyId, setRoleBusyId] = useState<number | null>(null);

  const [references, setReferences] = useState<Record<string, Row[]>>({});

  const load = useCallback((): Promise<boolean> => {
    if (!resource || !session) return Promise.resolve(false);
    return request(resource.path)
      .then(async (data) => {
        setLoadError("");
        setRows(readRows(resource, data));
        const refKeys = new Set(
          resource.fields.map((field) => field.ref).filter((value): value is string => Boolean(value)),
        );
        if (refKeys.size > 0) {
          const entries = await Promise.allSettled(
            [...refKeys].map(async (key) => {
              const refResource = getResource(key);
              if (!refResource) throw new Error(`Missing reference ${key}`);
              return [key, readRows(refResource, await request(refResource.path))] as const;
            }),
          );
          setReferences(
            Object.fromEntries(
              entries.filter((entry) => entry.status === "fulfilled").map((entry) => (entry as PromiseFulfilledResult<readonly [string, Row[]]>).value),
            ),
          );
        }
        return true;
      })
      .catch((error: unknown) => {
        setRows(null);
        setLoadError(error instanceof Error ? error.message : "Records could not load. Retry to continue.");
        return false;
      });
  }, [resource, session, request]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!resource) return null;
  const writable = session ? canWrite(session.role, resource.key) : false;

  async function confirmDelete() {
    if (!resource || !deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const result = await request(`${resource.path}/${deleteTarget[resource.idKey]}`, { method: "DELETE" });
      const outcome = deleteOutcome(resource, result, deleteTarget[resource.idKey] as number);
      setDeleteTarget(null);
      setEditor(null);
      setPageMessage(outcome === "missing" ? "This record was already absent. Records reloaded." : "Record deleted.");
      const loaded = await load();
      if (!loaded && session) setPageMessage("Deletion confirmed. Reload to see current records.");
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setDeleteError(error instanceof Error ? error.message : "Deletion failed. Try again.");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function changeUserRole(targetRow: Row, nextRole: string) {
    if (!resource || resource.key !== "users" || roleBusyId !== null) return;
    const id = targetRow[resource.idKey] as number;
    setRoleBusyId(id);
    setPageMessage("");
    try {
      await request(`users/${id}`, {
        method: "PUT",
        body: { role: nextRole },
      });
      setPageMessage(`Updated role for ${String(targetRow.username ?? `user ${id}`)} to ${nextRole}.`);
      await load();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setPageMessage(error instanceof Error ? error.message : "Role update failed. Try again.");
      }
    } finally {
      setRoleBusyId(null);
    }
  }

  async function finalizeApplication() {
    if (!followup || followupBusy) return;
    setFollowupBusy(true);
    setFollowupMessage("Updating the application...");
    try {
      await request(`shelter/adoption-application/${followup.applicationId}`, {
        method: "PUT",
        body: { application_status: "Adopted" },
      });
      setPageMessage(`Adoption ${followup.adoptionId} and application ${followup.applicationId} are recorded. Other open applications for this animal are rejected.`);
      setFollowup(null);
      setFollowupMessage("");
      await load();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setFollowupMessage(`Adoption saved. Application status still needs updating. ${error instanceof Error ? error.message : "Try again."}`);
      }
    } finally {
      setFollowupBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">{resource.group}</p>
          <h1 tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight">{resource.label}</h1>
          <p className="mt-3 max-w-[640px] text-sm text-muted-foreground">{resource.description}</p>
        </div>
        {writable ? (
          <Button type="button" onClick={() => setEditor({ row: null, mode: "edit" })}>
            Add {resource.singular}
          </Button>
        ) : null}
      </div>
      {pageMessage ? <Alert>{pageMessage}</Alert> : null}
      {followup ? (
        <Card className="border-border">
          <CardContent className="flex flex-wrap items-center justify-between gap-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold">Adoption saved. One step to finish.</h2>
              <p className="mt-2 max-w-[650px] text-sm text-muted-foreground">
                Mark the linked application Adopted to reject other open applications for this animal.
              </p>
              {followupMessage ? <p className="mt-3 text-sm" role="status">{followupMessage}</p> : null}
            </div>
            <Button type="button" disabled={followupBusy} onClick={() => void finalizeApplication()}>
              Mark application adopted
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <div className={editor ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_368px]" : "grid gap-6"}>
        <div className="min-w-0">
          {loadError ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <h2 className="text-lg font-semibold">Records could not load</h2>
                <p className="mx-auto mt-2 max-w-[460px] text-sm leading-relaxed text-muted-foreground">{loadError}</p>
                <Button type="button" variant="secondary" className="mt-4" onClick={() => void load()}>
                  Retry loading
                </Button>
              </CardContent>
            </Card>
          ) : rows === null ? (
            <Card role="status" aria-label="Loading records">
              <div className="grid gap-3 border-b border-border p-5" aria-hidden="true">
                <Skeleton className="h-11 w-full" />
              </div>
              <div className="grid gap-3 p-5" aria-hidden="true">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-2/3" />
              </div>
              <span className="sr-only">Loading records...</span>
            </Card>
          ) : (
            <ResourceTable
              resource={resource}
              rows={rows}
              references={references}
              role={session?.role ?? ""}
              onOpen={(_openedResource, row, mode) => setEditor({ row, mode })}
              onDelete={(_openedResource, row) => { setDeleteError(""); setDeleteTarget(row); }}
              onRoleChange={resource.key === "users" ? changeUserRole : undefined}
              roleBusyId={roleBusyId}
            />
          )}
        </div>
        {editor ? (
          <div className="min-w-0 xl:sticky xl:top-6">
            <ResourceEditor
              key={`${resource.key}:${editor.mode}:${editor.row?.[resource.idKey] ?? "new"}`}
              resource={resource}
              row={editor.row}
              mode={editor.mode}
              onClose={() => setEditor(null)}
              onReload={load}
              onDelete={(_openedResource, row) => { setDeleteError(""); setDeleteTarget(row); }}
              onSaved={async (savedResource, savedRow, created) => {
                setEditor(null);
                let needsFollowup = false;
                if (savedResource.key === "adoption" && created) {
                  const applicationId = savedRow.application_id as number;
                  const adoptionId = savedRow.adoption_id as number;
                  try {
                    await request(`shelter/adoption-application/${applicationId}`, {
                      method: "PUT",
                      body: { application_status: "Adopted" },
                    });
                    setPageMessage(`Adoption ${adoptionId} saved. Application ${applicationId} is now Adopted. Animal is now Adopted.`);
                    setFollowup(null);
                    setFollowupMessage("");
                  } catch (error) {
                    const apiError = error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : "Update failed.");
                    if (apiError.status !== 401) {
                      needsFollowup = true;
                      setFollowup({ applicationId, adoptionId });
                      setFollowupMessage(`Adoption saved. Application status still needs updating. ${apiError.message}`);
                      setPageMessage(`Adoption ${adoptionId} saved. Animal is now Adopted.`);
                    }
                  }
                } else {
                  setPageMessage("Changes saved.");
                }
                const loaded = await load();
                if (!loaded && session && !needsFollowup) setPageMessage("Changes saved. Reload to see current records.");
              }}
            />
          </div>
        ) : null}
      </div>
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <Card className="w-full max-w-[480px]">
            <CardContent className="pt-6">
              <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">Delete record</p>
              <h2 id="delete-title" className="mt-3 text-xl font-semibold">Delete this record?</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {deleteTarget[resource.idKey] ? `${String(deleteTarget[resource.idKey])} will be deleted. This cannot be undone.` : "This record will be deleted. This cannot be undone."}{" "}
                {["adoption", "adoption-application"].includes(resource.key)
                  ? "Related animal availability can change. Review its records afterward."
                  : "Referenced records may prevent deletion."}
              </p>
              {deleteError ? <Alert variant="destructive" className="mt-4">{deleteError}</Alert> : null}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button type="button" variant="secondary" className="flex-1" autoFocus disabled={deleting} onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" className="flex-1" disabled={deleting} onClick={() => void confirmDelete()}>
                  {deleting ? "Deleting..." : "Delete record"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
