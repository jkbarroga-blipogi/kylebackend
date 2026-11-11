"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { animalPhotoUrl } from "@/lib/animal-photos";
import { dateValue, fieldValue, recordName, type Row } from "@/lib/records";
import { canWrite, getResource, type Resource } from "@/lib/resources";

type ResourceTableProps = {
  resource: Resource;
  rows: Row[];
  references?: Record<string, Row[]>;
  role: string;
  onOpen: (resource: Resource, row: Row, mode: "view" | "edit") => void;
  onDelete: (resource: Resource, row: Row) => void;
  onRoleChange?: (row: Row, nextRole: string) => Promise<void>;
  roleBusyId?: number | null;
};

const USER_ROLE_OPTIONS = ["user", "staff", "volunteer", "admin", "master"] as const;

function Badge({ value }: { value: unknown }) {
  const status = String(value ?? "Not set");
  const key = status.trim().toLowerCase();
  const color = ["available", "adopted", "completed", "approved"].includes(key)
    ? "status-positive"
    : ["pending", "review", "quarantine"].includes(key)
      ? "status-warning"
      : ["rejected", "cancelled", "canceled", "deceased"].includes(key)
        ? "status-negative"
        : key === "admin" || key === "master"
          ? "status-positive"
          : key === "staff" || key === "volunteer"
            ? "status-warning"
            : "status-neutral";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs leading-relaxed ${color}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

export function ResourceTable({
  resource,
  rows,
  references = {},
  role,
  onOpen,
  onDelete,
  onRoleChange,
  roleBusyId = null,
}: ResourceTableProps) {
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const writable = canWrite(role, resource.key);
  const supportsCards = resource.key === "animal";
  const activeView = supportsCards ? viewMode : "table";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }, [rows, query]);

  const labelFor = (name: string) =>
    resource.fields.find((field) => field.name === name)?.label ?? name.replace(/_/g, " ");

  function displayValue(name: string, row: Row): string {
    const field = resource.fields.find((entry) => entry.name === name);
    if (field?.ref) {
      const refResource = getResource(field.ref);
      const related = references[field.ref]?.find(
        (item) => String(item[refResource?.idKey ?? "id"]) === String(row[name]),
      );
      if (related && refResource) return recordName(refResource, related);
    }
    return fieldValue(resource, row, name, references);
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 border-b border-border p-5 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div className="grid w-full min-w-0 gap-2 sm:flex-1 md:max-w-[340px]">
          <Label htmlFor="search" className="sr-only">Search records</Label>
          <Input
            id="search"
            type="search"
            placeholder="Search records..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {supportsCards ? (
            <div className="inline-flex rounded-lg border border-border bg-secondary/70 p-1" role="group" aria-label="View mode">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                aria-pressed={activeView === "cards"}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                  activeView === "cards"
                    ? "bg-[#4f46e5] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="size-3.5" aria-hidden="true" />
                Photo cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                aria-pressed={activeView === "table"}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                  activeView === "table"
                    ? "bg-[#4f46e5] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="size-3.5" aria-hidden="true" />
                Table
              </button>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {rows.length} {rows.length === 1 ? "record" : "records"}
            {query ? ` - Showing ${filtered.length} of ${rows.length}` : ""}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center">
          <h2 className="text-lg font-semibold">
            {query ? "No matching records" : `No ${resource.label.toLowerCase()} yet`}
          </h2>
          <p className="mx-auto mt-2 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
            {query
              ? "Clear your search or try another term."
              : writable
                ? `Add a ${resource.singular} to get started.`
                : "No records are available to display."}
          </p>
          {query ? (
            <Button type="button" variant="secondary" className="mt-4" onClick={() => setQuery("")}>
              Clear search
            </Button>
          ) : null}
        </div>
      ) : activeView === "cards" ? (
        <div className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => {
            const id = row[resource.idKey] as number;
            const identity = `${recordName(resource, row)} ${id}`;
            const photo = animalPhotoUrl(row, references);
            const breedLabel = displayValue("breed_id", row);
            return (
              <div
                key={id}
                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-secondary/30 transition hover:border-[#6366f1]/45 hover:bg-secondary/50"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-border bg-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt={String(row.animal_name ?? "Animal")}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute top-3 right-3">
                    <Badge value={row.adoption_status} />
                  </div>
                  <span className="absolute bottom-3 left-3 rounded-md border border-white/15 bg-black/65 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md tabular-nums">
                    ID {id}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    {String(row.animal_name ?? `Animal ${id}`)}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-[#a5adff]">{breedLabel}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/80 pt-4 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Sex</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{String(row.sex || "Not set")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Color</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{String(row.color || "Not set")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Birth date</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{dateValue(row.birth_date) || "Not set"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Arrival</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{dateValue(row.arrival_date) || "Not set"}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-border/80 pt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      aria-label={`View ${identity}`}
                      onClick={() => onOpen(resource, row, "view")}
                    >
                      View
                    </Button>
                    {writable ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1"
                          aria-label={`Edit ${identity}`}
                          onClick={() => onOpen(resource, row, "edit")}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          aria-label={`Delete ${identity}`}
                          onClick={() => onDelete(resource, row)}
                        >
                          Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="relative overflow-x-auto"
          role="region"
          aria-label={`${resource.label} table, scroll horizontally for more columns`}
          tabIndex={0}
        >
          <table className="w-full min-w-[650px] border-collapse text-left text-sm">
            <caption className="sr-only">
              {resource.label}: {filtered.length} records
            </caption>
            <thead>
              <tr>
                {resource.columns.map((name) => (
                  <th
                    key={name}
                    scope="col"
                    className="border-b border-border bg-secondary/60 px-5 py-3.5 font-medium text-muted-foreground"
                  >
                    {labelFor(name)}
                  </th>
                ))}
                <th scope="col" className="border-b border-border bg-secondary/60 px-5 py-3.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const id = row[resource.idKey] as number;
                const identity = `${recordName(resource, row)} ${id}`;
                return (
                  <tr key={id} className="hover:bg-secondary/50">
                    {resource.columns.map((name, index) => {
                      const value = displayValue(name, row);
                      return (
                        <td
                          key={name}
                          className="max-w-[280px] border-b border-border align-middle break-words px-5 py-4"
                        >
                          {resource.key === "users" && name === "role" && writable && onRoleChange ? (
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`role-select-${id}`} className="sr-only">
                                Role for {identity}
                              </Label>
                              <select
                                id={`role-select-${id}`}
                                value={String(row.role ?? "user")}
                                disabled={roleBusyId === id}
                                onChange={(event) => void onRoleChange(row, event.target.value)}
                                className="min-h-9 rounded-full border border-[#6366f1]/40 bg-secondary px-3 py-1 text-xs font-semibold text-foreground transition hover:border-[#a5adff] focus:outline-none disabled:opacity-60"
                              >
                                {[
                                  ...new Set([
                                    ...USER_ROLE_OPTIONS,
                                    ...(row.role ? [String(row.role)] : []),
                                  ]),
                                ].map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : name.includes("status") || name === "role" ? (
                            <Badge value={row[name]} />
                          ) : index === 0 ? (
                            <span className="flex items-center gap-3">
                              {resource.key === "animal" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={animalPhotoUrl(row, references)}
                                  alt=""
                                  className="size-12 shrink-0 rounded-lg border border-border object-cover"
                                />
                              ) : null}
                              <span>
                                <strong className="block font-medium">{value}</strong>
                                <small className="mt-1 block text-xs text-muted-foreground tabular-nums">
                                  {id}
                                </small>
                              </span>
                            </span>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-border px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`View ${identity}`}
                          onClick={() => onOpen(resource, row, "view")}
                        >
                          View
                        </Button>
                        {writable ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${identity}`}
                              onClick={() => onOpen(resource, row, "edit")}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              aria-label={`Delete ${identity}`}
                              onClick={() => onDelete(resource, row)}
                            >
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
