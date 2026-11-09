import { $, message } from "./ui.js";
import { getResource } from "./resources.js";
import { readRows } from "./records.js";

function setRegistration(registering) {
  $("login-form").dataset.mode = registering ? "register" : "login";
  $("login-title").textContent = registering ? "Create new account." : "Welcome back.";
  $("login-intro").textContent = registering ? "Create a new account to apply for an animal and follow its review." : "Sign in to your Barroga workspace.";
  $("register-email-field").hidden = !registering;
  $("register-email").disabled = !registering;
  $("register-email").value = "";
  $("register-field").hidden = !registering;
  $("register-confirm").disabled = !registering;
  $("register-confirm").value = "";
  $("login-pass").autocomplete = registering ? "new-password" : "current-password";
  $("btn-login").textContent = registering ? "Create new account" : "Sign in";
  $("btn-register").textContent = registering ? "Already registered? Sign in" : "Create new account";
  message("login-msg", "");
}

export function showLogin(text = "") {
  setRegistration(false);
  $("view-login").hidden = false;
  $("view-app").hidden = true;
  document.querySelector(".skip-link").href = "#main";
  $("login-pass").value = "";
  $("login-pass").type = "password";
  $("toggle-password").textContent = "Show";
  $("toggle-password").setAttribute("aria-label", "Show password");
  $("toggle-password").setAttribute("aria-pressed", "false");
  message("login-msg", text, text ? "error" : "");
  $("login-user").focus();
}

function removeLegacySession() {
  try {
    for (const key of ["accessToken", "refreshToken", "username", "role", "apiBase"]) localStorage.removeItem(key);
    return true;
  } catch (error) {
    // Storage may be blocked. The current client never reads or writes sessions there.
    return false;
  }
}

export function wireAuth(client, { onLogin, beforeLogout, onLogout }) {
  removeLegacySession();
  $("btn-register").onclick = () => {
    setRegistration($("login-form").dataset.mode !== "register");
    $("login-pass").value = "";
    $("login-user").focus();
  };

  $("login-form").onsubmit = async (event) => {
    event.preventDefault();
    if ($("btn-login").disabled) return;
    const username = $("login-user").value.trim();
    const email = $("register-email").value.trim().toLowerCase();
    const password = $("login-pass").value;
    const registering = $("login-form").dataset.mode === "register";
    if (!username || !password) { message("login-msg", "Enter your username or email and password.", "error"); return; }
    if (registering && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message("login-msg", "Enter a valid email address.", "error");
      $("register-email").focus();
      return;
    }
    if (registering && password.length < 8) {
      message("login-msg", "Use a password with at least 8 characters.", "error");
      $("login-pass").focus();
      return;
    }
    if (registering && (!password.trim() || new TextEncoder().encode(password).length > 72)) {
      message("login-msg", "Use a nonblank password of at most 72 UTF-8 bytes. Some characters use more than one byte.", "error");
      $("login-pass").focus();
      return;
    }
    if (registering && password !== $("register-confirm").value) {
      message("login-msg", "Passwords do not match. Enter the same password in both fields.", "error");
      $("register-confirm").focus();
      return;
    }
    $("btn-login").disabled = true;
    $("btn-register").disabled = true;
    $("btn-login").textContent = registering ? "Creating your account..." : "Signing in...";
    message("login-msg", "Connecting to your shelter. The first connection can take up to 90 seconds.");
    let created = false;
    try {
      if (registering) {
        const result = await client.request("auth/register", { method: "POST", auth: false, body: { username, email, password } });
        created = true;
        setRegistration(false);
        const account = readRows(getResource("users"), [result])[0];
        if (account.username !== username || account.role !== "user") throw new Error("The registration response could not be confirmed. Try signing in with your new account.");
      }
      const session = await client.login(username, password);
      $("login-pass").value = "";
      $("register-confirm").value = "";
      message("login-msg", "");
      await onLogin(session);
    } catch (error) {
      if (registering && error.uncertain) setRegistration(false);
      message("login-msg", (created ? "Registration accepted. Sign in to continue. " : "") + error.message + (registering && error.uncertain ? " Try signing in before creating another account." : ""), "error");
    } finally {
      $("btn-login").disabled = false;
      $("btn-register").disabled = false;
      $("btn-login").textContent = $("login-form").dataset.mode === "register" ? "Create new account" : "Sign in";
    }
  };
  $("toggle-password").onclick = () => {
    const show = $("login-pass").type === "password";
    $("login-pass").type = show ? "text" : "password";
    $("toggle-password").textContent = show ? "Hide" : "Show";
    $("toggle-password").setAttribute("aria-label", show ? "Hide password" : "Show password");
    $("toggle-password").setAttribute("aria-pressed", String(show));
  };
  $("btn-logout").onclick = async () => {
    if (!beforeLogout()) return;
    $("btn-logout").disabled = true;
    let notice = "";
    try { await client.logout(); }
    catch (error) { notice = "Signed out of this tab. The server could not confirm sign-out."; }
    finally {
      onLogout();
      showLogin(notice);
      $("btn-logout").disabled = false;
    }
  };
  $("login-form").dataset.ready = "true";
}
