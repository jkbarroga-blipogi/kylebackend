"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { buildPayload, dateValue, eligibleAnimals, isFinal, normalized, readRows, recordName, type Row } from "@/lib/records";
import { getResource, type Field, type Resource } from "@/lib/resources";

type EditorProps = {
  resource: Resource;
  row: Row | null;
  mode: "view" | "edit";
  onClose: () => void;
  onSaved: (resource: Resource, row: Row, created: boolean) => Promise<void>;
  onDelete: (resource: Resource, row: Row) => void;
  onReload: () => Promise<boolean>;
};

async function compressPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Photo must be 5 MB or smaller.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo could not be processed. Try another photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function referenceLabel(resource: Resource, row: Row): string {
  if (resource.key === "adoption-application") {
    return `Application ${row.application_id}: animal ${row.animal_id}, adopter ${row.adopter_id}, ${dateValue(row.application_date as string)}, ${row.application_status}`;
  }
  return `${recordName(resource, row)} ${row[resource.idKey]}`;
}

export function ResourceEditor({ resource, row, mode, onClose, onSaved, onDelete, onReload }: EditorProps) {
  const { request } = useAuth();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of resource.fields) {
      if (field.type === "password") initial[field.name] = "";
      else if (field.type === "date") initial[field.name] = dateValue(row?.[field.name] as string | null | undefined);
      else initial[field.name] = row ? String(row[field.name] ?? "") : field.defaultValue ?? "";
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, Row[]>>({});
  const [refMessage, setRefMessage] = useState(() =>
    resource.fields.some((field) => field.ref) || ["adoption", "adoption-application"].includes(resource.key)
      ? "Loading relationship choices..."
      : "",
  );
  const [formMessage, setFormMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    titleRef.current?.focus();
  }, [resource, row]);

  useEffect(() => {
    const refKeys = new Set(
      resource.fields.map((field) => field.ref).filter((value): value is string => Boolean(value)),
    );
    if (["adoption", "adoption-application"].includes(resource.key)) {
      for (const key of ["animal", "adoption", "adoption-application"]) refKeys.add(key);
    }
    if (refKeys.size === 0) return;
    let cancelled = false;
    Promise.all(
      [...refKeys].map(async (key) => {
        const refResource = getResource(key);
        if (!refResource) throw new Error(`Missing reference ${key}`);
        return [key, readRows(refResource, await request(refResource.path))] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setReferences(Object.fromEntries(entries));
        setRefMessage("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRefMessage(`Cannot load relationship choices. ${error instanceof Error ? error.message : "Reload to try again."}`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.key]);

  function choicesFor(field: Field): Row[] {
    if (!field.ref) return [];
    let choices = references[field.ref] ?? [];
    const adoptionFlow = ["adoption", "adoption-application"].includes(resource.key);
    if (!adoptionFlow) return choices;
    if (field.name === "animal_id") {
      const current = row ? String(row.animal_id) : "";
      choices = eligibleAnimals(references.animal ?? [], references.adoption ?? [], references["adoption-application"] ?? [], current);
    }
    if (resource.key === "adoption" && field.name === "application_id") {
      const current = row ? String(row.application_id) : "";
      const eligibleIds = new Set(
        eligibleAnimals(references.animal ?? [], references.adoption ?? [], references["adoption-application"] ?? [], "").map(
          (animal) => String(animal.animal_id),
        ),
      );
      choices = choices.filter(
        (application) =>
          String(application.application_id) === current ||
          (eligibleIds.has(String(application.animal_id)) &&
            !isFinal(application.application_status) &&
            !["rejected", "cancelled", "canceled"].includes(normalized(application.application_status)) &&
            !(references.adoption ?? []).some((adoption) => adoption.application_id === application.application_id)),
      );
    }
    return choices;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uncertain) return;
    const { body, errors: nextErrors } = buildPayload(resource, values, row);
    for (const field of resource.fields.filter((entry) => entry.ref)) {
      const select = document.getElementById(`f-${field.name}`) as HTMLSelectElement | null;
      if (select?.selectedOptions[0]?.dataset.missing) nextErrors[field.name] = `${field.label} is unavailable. Choose an existing record.`;
    }
    if (resource.key === "adoption") {
      const application = (references["adoption-application"] ?? []).find(
        (item) => String(item.application_id) === String(body.application_id),
      );
      if (!application || application.animal_id !== body.animal_id || application.adopter_id !== body.adopter_id) {
        nextErrors.application_id = "Choose an application with a matching animal and adopter.";
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (
      resource.key === "adoption-application" &&
      isFinal(body.application_status) &&
      !window.confirm("This marks the animal adopted and rejects other open applications. It does not create an adoption record. Continue?")
    ) {
      return;
    }
    setBusy(true);
    setFormMessage("Saving your changes...");
    let accepted = false;
    try {
      const path = row ? `${resource.path}/${row[resource.idKey]}` : resource.createPath ?? resource.path;
      const result = await request(path, { method: row ? "PUT" : "POST", body });
      accepted = true;
      const saved = readRows(resource, [result])[0];
      setDirty(false);
      await onSaved(resource, saved, !row);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : "Save failed. Reload to try again.");
      if (apiError.status === 401) return;
      setFormMessage(apiError.message);
      if (apiError.uncertain || accepted) setUncertain(true);
    } finally {
      setBusy(false);
    }
  }

  async function checkUncertain() {
    const loaded = await onReload();
    if (loaded) {
      setUncertain(false);
      setFormMessage("Records reloaded. Check whether your change already exists before submitting again.");
    }
  }

  function close() {
    if (busy) return;
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    onClose();
  }

  if (mode === "view" && row) {
    const names = [
      ...new Set([
        resource.idKey,
        ...resource.fields.filter((field) => field.type !== "password").map((field) => field.name),
        ...resource.columns,
      ]),
    ];
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">{resource.singular} {String(row[resource.idKey])}</p>
              <h2 ref={titleRef} tabIndex={-1} className="mt-2 text-xl font-semibold">{recordName(resource, row)}</h2>
            </div>
            <Button type="button" variant="ghost" aria-label="Close record panel" onClick={close}>Close</Button>
          </div>
          <dl className="grid gap-4">
            {names.map((name) => (
              <div key={name}>
                <dt className="mb-1 text-sm text-muted-foreground">
                  {resource.fields.find((field) => field.name === name)?.label ?? name.replace(/_/g, " ")}
                </dt>
                <dd className="text-sm break-words whitespace-pre-wrap">{String(row[name] ?? "Not set")}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
            <Button type="button" onClick={() => onClose()}>Back to records</Button>
            <Button type="button" variant="secondary" onClick={() => onDelete(resource, row)}>Delete</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">{row ? `Record ${row[resource.idKey]}` : "New record"}</p>
            <h2 ref={titleRef} tabIndex={-1} className="mt-2 text-xl font-semibold">{row ? `Edit ${resource.singular}` : `Add ${resource.singular}`}</h2>
          </div>
          <Button type="button" variant="ghost" aria-label="Close record panel" onClick={close}>Close</Button>
        </div>
        {resource.key === "adoption" ? (
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            Choose a nonfinal application. Its animal and adopter are filled in for you. Save the adoption before marking the application adopted.
          </p>
        ) : null}
        {resource.key === "users" && !row ? (
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            New accounts start with the user (adopter) role. Edit a user record to change their role.
          </p>
        ) : null}
        {refMessage ? (
          <Alert variant={refMessage.startsWith("Cannot") ? "destructive" : "default"} className="mb-5">
            {refMessage}{" "}
            {refMessage.startsWith("Cannot") ? (
              <Button type="button" variant="secondary" size="sm" className="ml-2" onClick={() => window.location.reload()}>
                Retry choices
              </Button>
            ) : null}
          </Alert>
        ) : null}
        {formMessage ? (
          <Alert variant={uncertain || busy ? "default" : "destructive"} className="mb-5">
            {formMessage}{" "}
            {uncertain ? (
              <Button type="button" variant="secondary" size="sm" className="ml-2" onClick={() => void checkUncertain()}>
                Reload records to check
              </Button>
            ) : null}
          </Alert>
        ) : null}
        {Object.keys(errors).length > 0 ? (
          <Alert variant="destructive" className="mb-5">
            <strong>Check these fields:</strong>
            <ul className="list-disc pl-5">
              {Object.entries(errors).map(([name, error]) => (
                <li key={name}><a href={`#f-${name}`}>{error}</a></li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <form method="post" onSubmit={(event) => void onSubmit(event)} noValidate>
          <fieldset disabled={busy} className="grid gap-5">
            <legend className="sr-only">{resource.label} fields</legend>
            {resource.fields.filter((field) => !field.editOnly || Boolean(row)).map((field) => {
              const isRequired = field.required || (field.createRequired && !row) || Boolean(field.editOnly && row);
              const inputId = `f-${field.name}`;
              const value = values[field.name] ?? "";
              const error = errors[field.name];
              const shared = {
                id: inputId,
                name: field.name,
                required: isRequired,
                "aria-invalid": error ? (true as const) : undefined,
                "aria-describedby": `hint-${field.name} error-${field.name}`,
                maxLength: field.maxLength,
                minLength: field.minLength,
                value,
                onChange: (event: { target: { value: string } }) => {
                  setDirty(true);
                  const nextValue = event.target.value;
                  setValues((current) => {
                    const next = { ...current, [field.name]: nextValue };
                    if (resource.key === "adoption" && field.name === "application_id") {
                      const application = (references["adoption-application"] ?? []).find(
                        (item) => String(item.application_id) === nextValue,
                      );
                      if (application) {
                        next.animal_id = String(application.animal_id);
                        next.adopter_id = String(application.adopter_id);
                      }
                    }
                    return next;
                  });
                },
              };
              if (field.name === "image_url") {
                return (
                  <div key={field.name} className="grid gap-2">
                    <Label htmlFor={inputId}>
                      {field.label} <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    {value ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={value} alt={`${resource.singular} photo`} className="h-40 w-full rounded-lg border border-border object-cover" />
                    ) : null}
                    <Input
                      id={inputId}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy || photoBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setPhotoBusy(true);
                        setPhotoError("");
                        compressPhoto(file)
                          .then((dataUrl) => {
                            setDirty(true);
                            setValues((current) => ({ ...current, image_url: dataUrl }));
                          })
                          .catch((error: unknown) => {
                            setPhotoError(error instanceof Error ? error.message : "Photo could not be processed. Try another photo.");
                          })
                          .finally(() => setPhotoBusy(false));
                      }}
                    />
                    <small id={`hint-${field.name}`} className="text-sm leading-relaxed text-muted-foreground">
                      {photoBusy ? "Processing photo..." : field.hint}
                    </small>
                    {photoError ? <span className="text-sm text-destructive">{photoError}</span> : null}
                    {value ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy || photoBusy}
                        onClick={() => {
                          setDirty(true);
                          setValues((current) => ({ ...current, image_url: "" }));
                        }}
                      >
                        Remove photo
                      </Button>
                    ) : null}
                  </div>
                );
              }
              return (
                <div key={field.name} className="grid gap-2">
                  <Label htmlFor={inputId}>
                    {field.label} <span className="font-normal text-muted-foreground">{isRequired ? "(required)" : "(optional)"}</span>
                  </Label>
                  {field.ref ? (
                    <select
                      {...shared}
                      disabled={busy || !references[field.ref] || (resource.key === "adoption" && (field.name === "animal_id" || field.name === "adopter_id"))}
                      className="flex min-h-11 w-full min-w-0 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground disabled:cursor-not-allowed disabled:opacity-65"
                    >
                      <option value="">{references[field.ref] ? `Choose ${field.label.toLowerCase()}` : "Loading choices..."}</option>
                      {choicesFor(field).map((choice) => {
                        const refResource = getResource(field.ref as string);
                        const choiceId = refResource ? String(choice[refResource.idKey]) : "";
                        return (
                          <option key={choiceId} value={choiceId}>
                            {referenceLabel(refResource ?? resource, choice)}
                          </option>
                        );
                      })}
                      {value && !choicesFor(field).some((choice) => String(choice[(getResource(field.ref as string)?.idKey ?? "id")]) === value) ? (
                        <option value={value} data-missing="true">{value} (unavailable)</option>
                      ) : null}
                    </select>
                  ) : field.type === "select" ? (
                    <select
                      {...shared}
                      className="flex min-h-11 w-full min-w-0 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground disabled:cursor-not-allowed disabled:opacity-65"
                    >
                      <option value="">Choose {field.label.toLowerCase()}</option>
                      {[...new Set([...(field.options ?? []), ...(value ? [value] : [])])].map((choice) => (
                        <option key={choice} value={choice}>{choice}</option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea {...shared} rows={3} className="w-full min-w-0 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-65" />
                  ) : (
                    <Input
                      {...shared}
                      type={field.type}
                      autoComplete={field.name === "username" ? "username" : field.name === "email" ? "email" : field.type === "password" ? "new-password" : undefined}
                      autoCapitalize={field.name === "username" || field.name === "email" ? "none" : undefined}
                      spellCheck={field.name === "username" || field.name === "email" ? false : undefined}
                    />
                  )}
                  {field.hint ? <small id={`hint-${field.name}`} className="text-sm leading-relaxed text-muted-foreground">{field.hint}</small> : null}
                  {error ? <span id={`error-${field.name}`} className="text-sm text-destructive">{error}</span> : null}
                </div>
              );
            })}
          </fieldset>
          <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
            <Button type="button" variant="secondary" className="flex-1" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={busy || uncertain}>{busy ? "Saving..." : "Save changes"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
