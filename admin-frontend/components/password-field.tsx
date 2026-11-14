"use client";

import { useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
  describedBy?: string;
  invalid?: boolean;
};

export function PasswordField({ id, label, value, onChange, autoComplete, required, disabled, minLength, describedBy, invalid }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-shell${invalid ? " input-shell-invalid" : ""}`}>
        <LockKeyhole className="field-icon" aria-hidden="true" />
        <input
          id={id}
          name={id}
          className="input input-with-icon"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          minLength={minLength}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
        <button type="button" className="icon-button password-toggle" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} aria-controls={id} disabled={disabled} onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
