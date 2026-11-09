"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export function LoginForm() {
  const { login, register } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleMode() {
    setRegistering((value) => !value);
    setPassword("");
    setConfirm("");
    setMessage("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const identifier = username.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!identifier || !password) {
      setMessage(registering ? "Enter your username, email, and password." : "Enter your username or email and password.");
      return;
    }
    if (registering && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (registering && password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (registering && (!password.trim() || new TextEncoder().encode(password).length > 72)) {
      setMessage("Use a nonblank password of at most 72 UTF-8 bytes. Some characters use more than one byte.");
      return;
    }
    if (registering && password !== confirm) {
      setMessage("Passwords do not match. Enter the same password in both fields.");
      return;
    }
    setBusy(true);
    setMessage("Connecting to your shelter. The first connection can take up to 90 seconds.");
    let created = false;
    try {
      if (registering) {
        await register(identifier, normalizedEmail, password);
        created = true;
        setRegistering(false);
      }
      await login(identifier, password);
      setPassword("");
      setConfirm("");
      setMessage("");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      setMessage((created ? "Registration accepted. Sign in to continue. " : "") + text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-[380px]">
      <CardContent className="flex flex-col gap-6 pt-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">Your shelter, in view</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">{registering ? "Create new account." : "Welcome back."}</h1>
          <p className="mt-3 text-muted-foreground">
            {registering ? "Create a new account to apply for an animal and follow its review." : "Sign in to your Barroga workspace."}
          </p>
        </div>
        <form method="post" onSubmit={onSubmit} className="grid gap-6" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="login-user">{registering ? "Username" : "Username or Email"}</Label>
            <Input
              id="login-user"
              name="username"
              autoComplete="username"
              maxLength={255}
              required
              placeholder={registering ? "Enter your username" : "Enter your username or email"}
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          {registering ? (
            <div className="grid gap-2">
              <Label htmlFor="register-email">Email</Label>
              <Input
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={255}
                required
                placeholder="Enter your email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="login-pass">Password</Label>
            <div className="flex overflow-hidden rounded-lg border border-input bg-secondary">
              <Input
                id="login-pass"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={registering ? "new-password" : "current-password"}
                required
                placeholder="Enter your password"
                className="border-0 bg-transparent"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                className="min-w-[60px] rounded-none"
              >
                {showPassword ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          {registering ? (
            <div className="grid gap-2">
              <Label htmlFor="register-confirm">Confirm password</Label>
              <div className="flex overflow-hidden rounded-lg border border-input bg-secondary">
                <Input
                  id="register-confirm"
                  name="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="Enter your password again"
                  className="border-0 bg-transparent"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                  aria-pressed={showConfirm}
                  onClick={() => setShowConfirm((value) => !value)}
                  className="min-w-[60px] rounded-none"
                >
                  {showConfirm ? "Hide" : "Show"}
                </Button>
              </div>
            </div>
          ) : null}
          {message ? (
            <Alert variant={busy ? "default" : "destructive"}>{message}</Alert>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full justify-between">
            {busy ? (registering ? "Creating your account..." : "Signing in...") : registering ? "Create new account" : "Sign in"}
            <span aria-hidden="true">-&gt;</span>
          </Button>
        </form>
        <p className="text-sm leading-relaxed text-muted-foreground">Your session is saved securely. You stay signed in after a reload.</p>
        <div className="border-t border-border pt-6">
          <Button type="button" variant="secondary" className="w-full" onClick={toggleMode} disabled={busy}>
            {registering ? "Already registered? Sign in" : "Create new account"}
          </Button>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Shelter team member? Ask your administrator to arrange staff access.</p>
        </div>
      </CardContent>
    </Card>
  );
}
