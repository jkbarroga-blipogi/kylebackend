"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { dateValue, normalized, type Row } from "@/lib/records";

export type AdopterPageKey = "available-animals" | "my-applications" | "my-details";

const titles: Record<AdopterPageKey, { eyebrow: string; title: string; description: string }> = {
  "available-animals": {
    eyebrow: "Your adoption journey",
    title: "Available animals",
    description: "Find an animal you would like to welcome home.",
  },
  "my-applications": {
    eyebrow: "Your adoption journey",
    title: "My applications",
    description: "Follow your applications and the shelter team's review.",
  },
  "my-details": {
    eyebrow: "Your adoption journey",
    title: "My details",
    description: "Keep your contact details ready for your next application.",
  },
};

function Badge({ value }: { value: unknown }) {
  const status = String(value ?? "Not set");
  const key = status.trim().toLowerCase();
  const color = ["available", "adopted", "completed", "approved"].includes(key)
    ? "text-[#75dcb4] border-[#285846] bg-[#162a24]"
    : ["pending", "review"].includes(key)
      ? "text-[#f4cf83] border-[#655333] bg-[#2c261b]"
      : ["rejected", "cancelled", "canceled"].includes(key)
        ? "text-[#ff9eae] border-[#76404e] bg-[#321e27]"
        : "text-foreground border-[#424d61] bg-secondary";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${color}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

function PageHeading({ pageKey }: { pageKey: AdopterPageKey }) {
  const copy = titles[pageKey];
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">{copy.eyebrow}</p>
      <h1 tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-3 max-w-[640px] text-sm text-muted-foreground">{copy.description}</p>
    </div>
  );
}

function AvailableAnimals({ onNavigate }: { onNavigate: (key: string) => void }) {
  const { request } = useAuth();
  const [animals, setAnimals] = useState<Row[]>([]);
  const [applications, setApplications] = useState<Row[]>([]);
  const [profile, setProfile] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    try {
      const [animalData, applicationData, profileData] = await Promise.all([
        request("adopter/animals"),
        request("adopter/applications"),
        request("adopter/profile"),
      ]);
      if (!Array.isArray(animalData) || !Array.isArray(applicationData)) throw new Error("Unexpected adopter response. Reload to try again.");
      setAnimals(animalData as Row[]);
      setApplications(applicationData as Row[]);
      setProfile(profileData && typeof profileData === "object" ? (profileData as Row) : null);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Available animals could not load. Reload to try again.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = animals.filter((animal) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [animal.animal_name, animal.breed_name, animal.species_name, animal.color, animal.sex].some((value) =>
      String(value ?? "").toLowerCase().includes(needle),
    );
  });
  const selected = animals.find((animal) => animal.animal_id === selectedId) ?? null;
  const openApplication = (animalId: number) =>
    applications.find(
      (entry) => entry.animal_id === animalId && !["rejected", "cancelled", "canceled"].includes(normalized(entry.application_status)),
    );

  async function submitApplication() {
    if (!selected || busy || uncertain) return;
    setBusy(true);
    setMessage("Submitting your application...");
    try {
      const result = (await request("adopter/applications", { method: "POST", body: { animal_id: selected.animal_id } })) as Row;
      setUncertain(true);
      setSelectedId(null);
      setMessage(`Application ${result.application_id} submitted for ${result.animal_name}. Reload My applications for current status.`);
      onNavigate("my-applications");
    } catch (submitError) {
      const apiError = submitError instanceof ApiError ? submitError : new ApiError(submitError instanceof Error ? submitError.message : "Submission failed.");
      setUncertain(apiError.uncertain);
      setMessage(apiError.message + (apiError.uncertain ? " Check My applications before submitting again." : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeading pageKey="available-animals" />
      {error ? (
        <Alert variant="destructive">
          {error}{" "}
          <Button type="button" variant="secondary" size="sm" className="ml-2" onClick={() => void load()}>Retry</Button>
        </Alert>
      ) : null}
      {message ? <Alert>{message}</Alert> : null}
      {!loaded && !error ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground" role="status">Loading available animals...</CardContent></Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid min-w-0 flex-1 gap-2 md:max-w-[340px]">
              <Label htmlFor="animal-search" className="sr-only">Search available animals</Label>
              <Input id="animal-search" type="search" placeholder="Name, breed, or species..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <p className="text-sm text-muted-foreground">{visible.length} of {animals.length} animals</p>
          </div>
          {selected ? (
            <Card className="border-[#55517b]">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">Your selected animal</p>
                    <h2 className="mt-2 text-xl font-semibold">Apply for {String(selected.animal_name)}</h2>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
                </div>
                {profile ? (
                  <>
                    <p className="mt-4 text-sm text-muted-foreground">Your application uses the contact details below.</p>
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div><dt className="text-sm text-muted-foreground">Name</dt><dd className="text-sm">{String(profile.first_name)} {String(profile.last_name)}</dd></div>
                      <div><dt className="text-sm text-muted-foreground">Phone</dt><dd className="text-sm">{String(profile.phone)}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Address</dt><dd className="text-sm">{String(profile.address)}</dd></div>
                    </dl>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                      Your application starts as Pending. The shelter team assigns a reviewer. Submitting an application does not reserve the animal.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button type="button" variant="secondary" onClick={() => onNavigate("my-details")}>Edit my details</Button>
                      <Button type="button" disabled={busy || uncertain} onClick={() => void submitApplication()}>
                        {busy ? "Submitting..." : "Submit application"}
                      </Button>
                    </div>
                    <a href="?resource=my-applications" className="mt-4 inline-flex min-h-11 items-center text-sm">Check my applications</a>
                  </>
                ) : (
                  <>
                    <p className="mt-4 text-sm text-muted-foreground">Save your contact details before submitting an application for {String(selected.animal_name)}.</p>
                    <Button type="button" className="mt-4" onClick={() => onNavigate("my-details")}>Add contact details</Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((animal) => {
              const submitted = openApplication(animal.animal_id as number);
              return (
                <Card key={animal.animal_id as number}>
                  <CardContent className="flex flex-col pt-6">
                    <div className="mb-6 flex items-center justify-between gap-4">
                      <span className="grid size-14 place-items-center rounded-xl border border-border bg-secondary text-[#a5adff]">P</span>
                      <Badge value="Available" />
                    </div>
                    <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                      {String(animal.species_name)} / {String(animal.animal_id)}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">{String(animal.animal_name)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{String(animal.breed_name)}</p>
                    <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5">
                      <div><dt className="mb-1 text-xs text-muted-foreground">Sex</dt><dd className="text-sm">{String(animal.sex)}</dd></div>
                      <div><dt className="mb-1 text-xs text-muted-foreground">Color</dt><dd className="text-sm">{String(animal.color || "Not recorded")}</dd></div>
                      <div><dt className="mb-1 text-xs text-muted-foreground">Birth date</dt><dd className="text-sm">{dateValue(animal.birth_date as string) || "Not recorded"}</dd></div>
                      <div><dt className="mb-1 text-xs text-muted-foreground">Arrival</dt><dd className="text-sm">{dateValue(animal.arrival_date as string)}</dd></div>
                    </dl>
                    <div className="mt-auto pt-6">
                      {submitted ? (
                        <Button type="button" variant="secondary" className="w-full" onClick={() => onNavigate("my-applications")}>
                          Application {String(submitted.application_status).toLowerCase()}
                        </Button>
                      ) : (
                        <Button type="button" className="w-full" aria-label={`Apply to adopt ${String(animal.animal_name)} ${animal.animal_id}`} onClick={() => setSelectedId(animal.animal_id as number)}>
                          Apply to adopt
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {loaded && visible.length === 0 ? (
            <Card><CardContent className="pt-6 text-center">
              <h2 className="text-lg font-semibold">{query ? "No matching animals" : "No available animals right now"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{query ? "Try another name, breed, or species." : "Check back for newly available animals."}</p>
            </CardContent></Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function MyDetails() {
  const { request } = useAuth();
  const [values, setValues] = useState({ first_name: "", last_name: "", phone: "", address: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    request("adopter/profile")
      .then((data) => {
        if (cancelled || !data || typeof data !== "object") return;
        const profile = data as Row;
        setValues({
          first_name: String(profile.first_name ?? ""),
          last_name: String(profile.last_name ?? ""),
          phone: String(profile.phone ?? ""),
          address: String(profile.address ?? ""),
          email: String(profile.email ?? ""),
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const nextErrors: Record<string, string> = {};
    const trimmed = {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      phone: values.phone.trim(),
      address: values.address.trim(),
      email: values.email.trim(),
    };
    if (!trimmed.first_name) nextErrors.first_name = "First name is required.";
    if (trimmed.first_name.length > 50) nextErrors.first_name = "Use 50 characters or fewer.";
    if (!trimmed.last_name) nextErrors.last_name = "Last name is required.";
    if (trimmed.last_name.length > 50) nextErrors.last_name = "Use 50 characters or fewer.";
    if (!trimmed.phone) nextErrors.phone = "Phone is required.";
    if (trimmed.phone.length > 20) nextErrors.phone = "Use 20 characters or fewer.";
    if (!trimmed.address) nextErrors.address = "Address is required.";
    if (trimmed.address.length > 255) nextErrors.address = "Use 255 characters or fewer.";
    if (trimmed.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) nextErrors.email = "Enter a valid email address.";
    if (trimmed.email.length > 100) nextErrors.email = "Use 100 characters or fewer.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setBusy(true);
    setMessage("Saving your details...");
    try {
      await request("adopter/profile", { method: "PUT", body: { ...trimmed, email: trimmed.email || null } });
      setMessage("Your details are saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Details could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeading pageKey="my-details" />
      {!loaded ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground" role="status">Loading your details...</CardContent></Card>
      ) : (
        <Card className="max-w-[800px]">
          <CardContent className="pt-6">
            {message ? <Alert className="mb-5">{message}</Alert> : null}
            <form method="post" onSubmit={(event) => void onSubmit(event)} noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                {(
                  [
                    ["first_name", "First name", "text", "given-name"],
                    ["last_name", "Last name", "text", "family-name"],
                    ["phone", "Phone", "tel", "tel"],
                    ["email", "Email", "email", "email"],
                  ] as const
                ).map(([name, label, type, autocomplete]) => (
                  <div key={name} className="grid gap-2">
                    <Label htmlFor={`f-${name}`}>{label} <span className="font-normal text-muted-foreground">{name === "email" ? "(optional)" : "(required)"}</span></Label>
                    <Input
                      id={`f-${name}`}
                      type={type}
                      autoComplete={autocomplete}
                      value={values[name]}
                      onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                      aria-invalid={errors[name] ? true : undefined}
                      aria-describedby={`error-${name}`}
                    />
                    {errors[name] ? <span id={`error-${name}`} className="text-sm text-destructive">{errors[name]}</span> : null}
                  </div>
                ))}
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="f-address">Address <span className="font-normal text-muted-foreground">(required)</span></Label>
                  <textarea
                    id="f-address"
                    rows={3}
                    value={values.address}
                    onChange={(event) => setValues((current) => ({ ...current, address: event.target.value }))}
                    aria-invalid={errors.address ? true : undefined}
                    aria-describedby="error-address"
                    className="w-full min-w-0 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-65"
                  />
                  {errors.address ? <span id="error-address" className="text-sm text-destructive">{errors.address}</span> : null}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
                <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save details"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MyApplications() {
  const { request } = useAuth();
  const [applications, setApplications] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const data = await request("adopter/applications");
      if (!Array.isArray(data)) throw new Error("Unexpected applications response. Reload to try again.");
      setApplications(data as Row[]);
    } catch (loadError) {
      setApplications(null);
      setError(loadError instanceof Error ? loadError.message : "Applications could not load. Reload to try again.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6">
      <PageHeading pageKey="my-applications" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{applications ? `${applications.length} ${applications.length === 1 ? "application" : "applications"}` : ""}</p>
        <Button type="button" variant="secondary" onClick={() => void load()}>Reload status</Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          {error}{" "}
          <Button type="button" variant="secondary" size="sm" className="ml-2" onClick={() => void load()}>Retry</Button>
        </Alert>
      ) : null}
      {applications === null && !error ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground" role="status">Loading your applications...</CardContent></Card>
      ) : applications && applications.length === 0 ? (
        <Card><CardContent className="pt-6 text-center">
          <h2 className="text-lg font-semibold">No applications yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Choose an available animal to start your first application.</p>
        </CardContent></Card>
      ) : applications ? (
        <div className="grid gap-4">
          {applications.map((application) => (
            <Card key={application.application_id as number}>
              <CardContent className="flex flex-wrap items-center justify-between gap-6 pt-6">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-[#a5adff]">P</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">Application {String(application.application_id)}</p>
                    <h2 className="mt-1 text-xl font-semibold">{String(application.animal_name)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Submitted {dateValue(application.application_date as string)}</p>
                  </div>
                </div>
                <div>
                  <Badge value={application.application_status} />
                  <p className="mt-2 text-sm text-muted-foreground">{application.reviewer_assigned ? "Reviewer assigned" : "Awaiting reviewer"}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdopterPortal({ pageKey, onNavigate }: { pageKey: AdopterPageKey; onNavigate: (key: string) => void }) {
  if (pageKey === "my-details") return <MyDetails />;
  if (pageKey === "my-applications") return <MyApplications />;
  return <AvailableAnimals onNavigate={onNavigate} />;
}
