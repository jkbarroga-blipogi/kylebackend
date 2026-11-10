import { PawPrint } from "lucide-react";

export function LoginFormHeading({ registering = false }: { registering?: boolean }) {
  return (
    <div className="auth-form-heading">
      <span className="auth-form-symbol"><PawPrint size={22} aria-hidden="true" /></span>
      <p className="auth-kicker">Your shelter, in view</p>
      <h1 id="auth-title">{registering ? "Create new account." : "Welcome back."}</h1>
      <p className="auth-form-description">
        {registering ? "Create an account to start your adoption journey." : "A little care goes a long way. Sign in to your shelter workspace."}
      </p>
    </div>
  );
}
