"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { PasswordField } from "@/components/password-field";
import { useAuth } from "@/lib/auth";
import { loginErrorMessage } from "@/lib/messages";

export default function LoginPage() {
  const { session, checked, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (checked && session) router.replace("/dashboard");
  }, [checked, session, router]);

  useEffect(() => {
    if (error === "Wrong username or password.") document.getElementById("password")?.focus();
  }, [error]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !checked) return;
    setBusy(true);
    setError("");
    try {
      // POST /auth/login through the existing session provider.
      await login(username, password);
      router.replace("/dashboard");
    } catch (cause) {
      setError(loginErrorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-wrap">
        <Brand />
        <form onSubmit={onSubmit} className="login-card" aria-busy={busy}>
          <div className="login-symbol"><ShieldCheck aria-hidden="true" /></div>
          <p className="eyebrow">Admin workspace</p>
          <h1>Welcome back</h1>
          <p className="login-description">Sign in to care for the people behind your shelter.</p>
          <div className="login-fields">
            <div className="field">
              <label htmlFor="username">Username or email</label>
              <div className="input-shell">
                <UserRound className="field-icon" aria-hidden="true" />
                <input id="username" name="username" className="input input-with-icon" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={busy || !checked} aria-describedby={error ? "login-error" : undefined} aria-invalid={Boolean(error) || undefined} />
              </div>
            </div>
            <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" required disabled={busy || !checked} describedBy={error ? "login-error" : undefined} invalid={Boolean(error)} />
          </div>
          {error ? <p id="login-error" role="alert" className="alert alert-danger"><CircleAlert aria-hidden="true" /><span>{error}</span></p> : null}
          <button type="submit" className="btn btn-primary login-submit" disabled={busy || !checked}>
            <span>{busy ? "Signing in…" : "Sign in"}</span>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          </button>
          <p className="login-access-note"><ShieldCheck aria-hidden="true" />For authorized shelter administrators.</p>
        </form>
        <p className="login-footer">A little care. A better tomorrow.</p>
      </div>
    </main>
  );
}
