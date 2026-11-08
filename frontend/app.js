/* =========================================================
   Shelter Admin — app.js
   Ang "utak" ng frontend: login, Bearer token, CRUD requests.
   Wala itong frameworks — purong fetch() lang para kitang-kita
   kung ano ang hinihingi at tinugon ng API mo.
   ========================================================= */

"use strict";

/* ---------- 1. SETUP: naka-save na state (localStorage) ---------- */

// Migration: iba na ngayon ang default API URL (Render deployment) —
// kung naka-save pa dati ang http://localhost:3000, pwede mo pa ring gamitin ang site.
if (localStorage.getItem("apiBase") === "http://localhost:3000") {
  localStorage.setItem("apiBase", "https://kylebackend.onrender.com");
}

const state = {
  base: localStorage.getItem("apiBase") || "https://kylebackend.onrender.com",
  accessToken: localStorage.getItem("accessToken") || null,
  refreshToken: localStorage.getItem("refreshToken") || null,
  username: localStorage.getItem("username") || null,
  role: localStorage.getItem("role") || null,
};

function saveState() {
  localStorage.setItem("apiBase", state.base);
  localStorage.setItem("accessToken", state.accessToken ?? "");
  localStorage.setItem("refreshToken", state.refreshToken ?? "");
  localStorage.setItem("username", state.username ?? "");
  localStorage.setItem("role", state.role ?? "");
}

function clearAuth() {
  state.accessToken = null;
  state.refreshToken = null;
  state.username = null;
  state.role = null;
  saveState();
}

/* I-decode ang JWT payload (hindi secure na pagbabasa lang — para
   makuha ang userId/sub na kailangan sa POST /auth/logout) */
function jwtPayload(token) {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/* ---------- 2. RESOURCE CONFIG — tugma sa backend controllers ---------- */

const RESOURCES = [
  {
    key: "species", icon: "🧬", label: "Species", group: "Animals (TypeORM)",
    path: "species", idKey: "species_id",
    fields: [
      { name: "species_name", label: "Species name", type: "text", required: true },
    ],
  },
  {
    key: "breed", icon: "🐾", label: "Breed", group: "Animals (TypeORM)",
    path: "breed", idKey: "breed_id",
    fields: [
      { name: "species_id", label: "Species", type: "number", required: true, ref: { key: "species", labelKeys: ["species_name"] } },
      { name: "breed_name", label: "Breed name", type: "text", required: true },
    ],
  },
  {
    key: "animal", icon: "🐕", label: "Animal", group: "Animals (TypeORM)",
    path: "animal", idKey: "animal_id",
    fields: [
      { name: "breed_id", label: "Breed", type: "number", required: true, ref: { key: "breed", labelKeys: ["breed_name"] } },
      { name: "animal_name", label: "Animal name", type: "text", required: true },
      { name: "sex", label: "Sex", type: "select", required: true, options: ["Male", "Female"] },
      { name: "birth_date", label: "Birth date", type: "date" },
      { name: "color", label: "Color", type: "text" },
      { name: "arrival_date", label: "Arrival date", type: "date", required: true },
      { name: "adoption_status", label: "Adoption status", type: "text", required: true, defaultValue: "Available" },
    ],
  },
  {
    key: "adopter", icon: "🤝", label: "Adopter", group: "Shelter tables (generic CRUD)",
    path: "shelter/adopter", idKey: "adopter_id",
    fields: [
      { name: "first_name", label: "First name", type: "text", required: true },
      { name: "last_name", label: "Last name", type: "text", required: true },
      { name: "phone", label: "Phone", type: "text", required: true },
      { name: "address", label: "Address", type: "text", required: true },
      { name: "email", label: "Email", type: "text" },
    ],
  },
  {
    key: "staff", icon: "👷", label: "Staff", group: "Shelter tables (generic CRUD)",
    path: "shelter/staff", idKey: "staff_id",
    fields: [
      { name: "first_name", label: "First name", type: "text", required: true },
      { name: "last_name", label: "Last name", type: "text", required: true },
      { name: "position", label: "Position", type: "text", required: true },
      { name: "phone", label: "Phone", type: "text" },
      { name: "email", label: "Email", type: "text" },
    ],
  },
  {
    key: "adoption-application", icon: "📋", label: "Adoption Application", group: "Shelter tables (generic CRUD)",
    path: "shelter/adoption-application", idKey: "application_id",
    fields: [
      { name: "animal_id", label: "Animal", type: "number", required: true, ref: { key: "animal", labelKeys: ["animal_name"] }, hint: "Only animals that are not yet adopted are listed" },
      { name: "adopter_id", label: "Adopter", type: "number", required: true, ref: { key: "adopter", labelKeys: ["first_name", "last_name"] } },
      { name: "staff_id", label: "Staff", type: "number", required: true, ref: { key: "staff", labelKeys: ["first_name", "last_name"] } },
      { name: "application_date", label: "Application date", type: "date", required: true },
      { name: "application_status", label: "Application status", type: "text", hint: "Use 'adopted' to finalize the adoption — other open applications will be rejected" },
    ],
  },
  {
    key: "medical-record", icon: "💉", label: "Medical Record", group: "Shelter tables (generic CRUD)",
    path: "shelter/medical-record", idKey: "medical_record_id",
    fields: [
      { name: "animal_id", label: "Animal", type: "number", required: true, ref: { key: "animal", labelKeys: ["animal_name"] } },
      { name: "staff_id", label: "Staff", type: "number", required: true, ref: { key: "staff", labelKeys: ["first_name", "last_name"] } },
      { name: "record_date", label: "Record date", type: "date", required: true },
      { name: "diagnosis", label: "Diagnosis", type: "text" },
      { name: "treatment", label: "Treatment", type: "text" },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "adoption", icon: "🏡", label: "Adoption", group: "Shelter tables (generic CRUD)",
    path: "shelter/adoption", idKey: "adoption_id",
    fields: [
      { name: "application_id", label: "Application", type: "number", required: true, ref: { key: "adoption-application", labelKeys: ["application_date", "application_status"] } },
      { name: "animal_id", label: "Animal", type: "number", required: true, ref: { key: "animal", labelKeys: ["animal_name"] }, hint: "Only animals that are not yet adopted are listed" },
      { name: "adopter_id", label: "Adopter", type: "number", required: true, ref: { key: "adopter", labelKeys: ["first_name", "last_name"] } },
      { name: "staff_id", label: "Staff", type: "number", required: true, ref: { key: "staff", labelKeys: ["first_name", "last_name"] } },
      { name: "adoption_date", label: "Adoption date", type: "date", required: true },
    ],
  },
  {
    key: "category", icon: "🏷️", label: "Category", group: "System",
    path: "category", idKey: "id",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "text" },
    ],
  },
  {
    key: "users", icon: "👤", label: "Users", group: "System",
    path: "users", idKey: "id",
    fields: [
      { name: "username", label: "Username", type: "text", required: true },
      { name: "password", label: "Password (new)", type: "password", hint: "Leave blank to keep the current password" },
      { name: "role", label: "Role", type: "text", hint: "user / admin — optional" },
    ],
  },
];

let currentKey = "animal"; // simulan sa Animal
let currentRows = [];
let editingId = null;      // kapag may value: edit mode; null = add mode

/* ---------- 3. API HELPER — dito nangyayari lahat ng fetch ---------- */

async function api(path, { method = "GET", body, auth = true, retried = false } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (auth && state.accessToken) headers.set("Authorization", "Bearer " + state.accessToken);

  const res = await fetch(new URL(path, ensureTrailingSlash(state.base)), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Kapag nag-expire ang access token (401): subukan ang /auth/refresh
  // tapos i-retry ang orihinal na request — isang beses lang.
  if (res.status === 401 && auth && !retried && state.refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api(path, { method, body, auth, retried: true });
    }
    // hindi na pwede — i-log out at pa-pasukin ulit
    clearAuth();
    showApp(false);
    toast("Session expired — please log in again", "err");
    throw new Error("unauthorized");
  }

  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = typeof data === "string" ? data
      : (data?.message || data?.error || res.status + " " + res.statusText);
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }
  return data;
}

function ensureTrailingSlash(base) {
  return base.endsWith("/") ? base : base + "/";
}

async function tryRefresh() {
  try {
    const data = await api("auth/refresh", {
      method: "POST",
      auth: false,
      body: { refreshToken: state.refreshToken },
    });
    if (data?.accessToken) {
      state.accessToken = data.accessToken;
      state.refreshToken = data.refreshToken;
      saveState();
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

/* ---------- 3.5. RELATION OPTIONS — para ang ID fields ay magiging dropdown ---------- */

const refCache = {};

// Kapag may na-save/na-delete, lahat ng dropdown list ay dapat mag-refresh —
// lalo na ang Animal list, dahil nagbabago ang adoption_status nito.
function clearRefCache() {
  for (const key of Object.keys(refCache)) delete refCache[key];
}

// Kukunin ang lista ng isang resource (hal. 'animal' o 'staff') para sa select options
async function getRefRows(refKey) {
  if (refCache[refKey]) return refCache[refKey];

  const r = RESOURCES.find((x) => x.key === refKey);
  const rows = await api(r.path);
  refCache[refKey] = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  return refCache[refKey];
}

function refOptionLabel(refConf, row, idValue) {
  const label = refConf.labelKeys
    .map((k) => row[k])
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" ");
  return `#${idValue}${label ? " — " + label : ""}`;
}

/* ---------- 4. LOGIN VIEW ---------- */

const $ = (id) => document.getElementById(id);

function showApp(show) {
  $("view-app").hidden = !show;
  $("view-login").hidden = show;
  if (show) {
    $("topbar-user").textContent = `${state.username} (${state.role ?? "?"})`;
    $("topbar-avatar").textContent = String(state.username || "?").charAt(0).toUpperCase();
    $("topbar-api").textContent = state.base;
    buildSidebar();
    loadResource(currentKey);
  }
}

async function doLogin(username, password, signupFirst) {
  const base = $("login-api").value.trim().replace(/\/+$/, "");
  if (!base) return loginMsg("Enter the API URL.");
  state.base = base; saveState();

  try {
    if (signupFirst) {
      await api("auth/register", { auth: false, method: "POST", body: { username, password } });
      loginMsg("Registered! Logging in…", "");
    }
    const data = await api("auth/login", { auth: false, method: "POST", body: { username, password } });

    if (data?.error) return loginMsg(data.error); // "Invalid credentials"

    const payload = jwtPayload(data.accessToken) || {};
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.username = payload.username ?? username;
    state.role = payload.role ?? "?";
    saveState();

    loginMsg("", "");
    showApp(true);
  } catch (err) {
    loginMsg("Login failed: " + err.message);
  }
}

function loginMsg(text, kind = "err") {
  const el = $("login-msg");
  el.textContent = text;
  el.style.color = kind === "err" ? "var(--danger)" : "var(--ok)";
}

function loginBtnLoading(btn, label) {
  // I-disable ang lahat ng login buttons + spinner sa pinindot — para
  // malinaw na "nag-iisip" ang app at di paulit-ulit ang clicks habang cold start
  const original = btn.innerHTML;
  const all = ["btn-login", "btn-register", "btn-test"];
  btn.innerHTML = `<span class="spinner-inline"></span>${label}`;
  for (const id of all) $(id).disabled = true;
  return function done() {
    btn.innerHTML = original;
    for (const id of all) $(id).disabled = false;
  };
}

function wireLogin() {
  $("login-api").value = state.base;

  $("btn-login").addEventListener("click", async () => {
    const u = $("login-user").value.trim();
    const p = $("login-pass").value;
    if (!u || !p) return loginMsg("Please fill in the username and password.");
    const done = loginBtnLoading($("btn-login"), "Logging in…");
    loginMsg("Connecting… (cold start: the first request may take 30–90 seconds)", "ok");
    try {
      await doLogin(u, p, false);
    } finally {
      done();
    }
  });

  $("btn-register").addEventListener("click", async () => {
    const u = $("login-user").value.trim();
    const p = $("login-pass").value;
    if (!u || !p) return loginMsg("Please fill in the username and password to register.");
    const done = loginBtnLoading($("btn-register"), "Registering…");
    loginMsg("Creating your account…", "ok");
    try {
      await doLogin(u, p, true);
    } finally {
      done();
    }
  });

  $("btn-test").addEventListener("click", async () => {
    const base = $("login-api").value.trim().replace(/\/+$/, "");
    const done = loginBtnLoading($("btn-test"), "Testing…");
    loginMsg("Testing the connection…", "ok");
    try {
      const res = await fetch(new URL("/", ensureTrailingSlash(base)));
      const data = await res.json();
      loginMsg(data?.message ? `✅ ${data.message}` : "✅ Got a response, but not the expected NestJS message.", "ok");
    } catch (err) {
      loginMsg("❌ Cannot reach the API — is the backend running? (" + err.message + ")");
    } finally {
      done();
    }
  });

  $("btn-logout").addEventListener("click", async () => {
    try {
      const payload = jwtPayload(state.accessToken);
      if (payload?.sub) {
        await api("auth/logout", { method: "POST", body: { userId: payload.sub } });
      }
    } catch { /* logout date na — ok lang kahit ilagpas */ }
    clearAuth();
    showApp(false);
  });

  // Click ang API pill sa topbar → palitan ang base URL on the fly
  $("topbar-api").addEventListener("click", () => {
    const val = prompt("API URL:", state.base);
    if (val) {
      state.base = val.trim().replace(/\/+$/, "");
      saveState();
      $("topbar-api").textContent = state.base;
      loadResource(currentKey);
    }
  });
}

/* ---------- 5. SIDEBAR + TABLE RENDERING ---------- */

function buildSidebar() {
  const nav = $("sidebar");
  nav.innerHTML = "";
  let lastGroup = null;

  for (const r of RESOURCES) {
    if (r.group !== lastGroup) {
      const div = document.createElement("div");
      div.className = "group-label";
      div.textContent = r.group;
      nav.appendChild(div);
      lastGroup = r.group;
    }
    const btn = document.createElement("button");
    btn.innerHTML = `${r.icon} ${r.label}`;
    btn.dataset.key = r.key;
    if (r.key === currentKey) btn.classList.add("active");
    btn.addEventListener("click", () => {
      currentKey = r.key;
      editingId = null;
      nav.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.key === r.key));
      loadResource(r.key);
    });
    nav.appendChild(btn);
  }
}

function currentRes() {
  return RESOURCES.find((r) => r.key === currentKey);
}

function prettyCol(name) {
  return String(name).replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function fmtCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    // e.g., relation object: show the "_name" field if present
    const nameKey = Object.keys(value).find((k) => k.endsWith("_name"));
    return nameKey ? String(value[nameKey]) : JSON.stringify(value);
  }
  if (typeof value === "string") {
    // ISO datetime (e.g. 2026-10-22T12:38:55.000Z) → readable: 2026-10-22 12:38
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16).replace("T", " ");
  }
  return String(value);
}

async function loadResource(key) {
  currentKey = key;
  const r = currentRes();
  $("res-title").innerHTML = `${r.icon} ${r.label}`;
  $("search").value = "";
  hideForm();

  $("table-wrap").innerHTML = `
    <div class="empty">
      <div class="spinner"></div>
      <p class="muted">Fetching data from the API…</p>
    </div>`;
  try {
    currentRows = await api(r.path);
    if (!Array.isArray(currentRows)) currentRows = currentRows ? [currentRows] : [];
    renderTable();
    toast(`${r.label}: ${currentRows.length} record(s)`, "ok");
  } catch (err) {
    if (err.message === "unauthorized") return;
    $("table-wrap").innerHTML = `<p class="muted pad">❌ ${escapeHtml(err.message)}</p>`;
  }
}

function tableColumns() {
  const r = currentRes();
  const cols = [r.idKey, ...r.fields.map((f) => f.name)];

  // idadagdag ang mga extra column na mulatung sa tulong ng API
  // (hal. created_at sa users/categories)
  for (const row of currentRows) {
    for (const k of Object.keys(row)) {
      if (!cols.includes(k) && typeof row[k] !== "object") cols.push(k);
    }
  }
  return [...new Set(cols)];
}

function renderCell(row, col) {
  const raw = row[col];

  // Role chips: master/admin = violet badge, plain users = gray
  if (col === "role" && typeof raw === "string" && raw) {
    return `<span class="badge ${/master|admin/.test(raw.toLowerCase()) ? "violet" : "gray"}">${escapeHtml(raw)}</span>`;
  }

  // Status chips: "Available" = green, "Pending" = amber, etc.
  if (typeof raw === "string" && raw && col.toLowerCase().includes("status")) {
    return `<span class="badge ${badgeClass(raw)}">${escapeHtml(raw)}</span>`;
  }
  return escapeHtml(fmtCell(raw));
}

function badgeClass(value) {
  const s = String(value).toLowerCase();
  if (/available|approved|active|adopted/.test(s)) return "green";
  if (/completed|done|treated|resolved|medical/.test(s)) return "blue";
  if (/pending|foster|review|process|quarantine/.test(s)) return "amber";
  if (/reject|cancel|decline|deceased|infectious/.test(s)) return "red";
  return "gray";
}

function renderTable() {
  const r = currentRes();
  const q = $("search").value.trim().toLowerCase();
  const rows = q
    ? currentRows.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
    : currentRows;

  if (!rows.length) {
    $("table-wrap").innerHTML = `
      <div class="empty">
        <div class="empty-paw">🐾</div>
        <p class="muted">No records here yet. Click <strong style="color: var(--accent-2)">+ Add new</strong> to create the first one.</p>
      </div>`;
    return;
  }

  // Real-ID column is not displayed (Edit/Delete still target the actual ID)
  const cols = tableColumns().filter((c) => c !== r.idKey);
  const thead = `<tr>${cols.map((c) => `<th>${escapeHtml(prettyCol(c))}</th>`).join("")}<th></th></tr>`;
  const tbody = rows.map((row) => `
    <tr data-id="${escapeHtml(row[r.idKey])}">
      ${cols.map((c) => `<td>${renderCell(row, c)}</td>`).join("")}
      <td class="actions">
        <button class="btn sm act-edit">Edit</button>
        <button class="btn sm danger act-del">Delete</button>
      </td>
    </tr>`).join("");

  $("table-wrap").innerHTML = `
    <table>
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
    <p class="rowcount">${rows.length} of ${currentRows.length} record(s)${q ? " (filtered)" : ""}</p>`;

  // wire ang Edit / Delete buttons
  $("table-wrap").querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector(".act-edit").addEventListener("click", () => openForm(rows.find((x) => String(x[r.idKey]) === id)));
    tr.querySelector(".act-del").addEventListener("click", () => deleteRow(id));
  });
}

/* ---------- 6. FORM (Add / Edit) ---------- */

function buildFormFields(r, row) {
  const form = $("form");
  form.innerHTML = "";

  for (const f of r.fields) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const isEdit = row !== null;
    const skipPassword = f.type === "password" && isEdit;

    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = f.label + (f.required && !skipPassword ? " *" : "");
    wrap.appendChild(label);

    let input;

    if (f.type === "select") {
      input = document.createElement("select");
      for (const opt of f.options) {
        const o = document.createElement("option");
        o.value = o.textContent = opt;
        input.appendChild(o);
      }
    } else if (f.ref) {
      // RELATION DROPDOWN — imbes na mag-type ng numero, pipili ka na lang
      input = document.createElement("select");
      const ph = document.createElement("option");
      ph.textContent = "Loading list…";
      ph.disabled = true;
      ph.selected = true;
      input.appendChild(ph);
    } else {
      input = document.createElement("input");
      input.type = f.type;
    }

    input.name = f.name;
    input.id = "f-" + f.name;
    if (f.hint) input.placeholder = f.hint;
    if (!f.required && !f.ref) input.placeholder = input.placeholder || "(optional)";

    wrap.appendChild(input);

    if (f.hint) {
      const hint = document.createElement("div");
      hint.className = "muted";
      hint.style.cssText = "font-size:11.5px;margin-top:3px;";
      hint.textContent = f.hint;
      wrap.appendChild(hint);
    }

    form.appendChild(wrap);

    // Prefill (kapag edit) para sa mga normal na fields
    if (isEdit && !f.ref && f.type !== "password" && row && row[f.name] !== null && row[f.name] !== undefined) {
      input.value = row[f.name];
    } else if (!isEdit && f.defaultValue) {
      input.value = f.defaultValue;
    }

    // Populate ng relation dropdown (async — hindi nakakabara ang form)
    if (f.ref) {
      const rawVal = isEdit && row ? String(row[f.name] ?? "") : "";

      // Sa Adoption at Adoption Application forms, hindi na dapat piliin
      // ang mga animal na may adoption record, naka-"Adopted", o may
      // application nang "adopted" — para isang beses lang ma-adopt.
      const onlyAvailableAnimals =
        (r.key === "adoption" || r.key === "adoption-application") && f.name === "animal_id";

      getRefRows(f.ref.key).then(async (refRows) => {
        let selectableRows = refRows;

        if (onlyAvailableAnimals) {
          const [adoptions, applications] = await Promise.all([
            getRefRows("adoption"),
            getRefRows("adoption-application"),
          ]);

          const adoptedIds = new Set(adoptions.map((a) => String(a.animal_id)));
          const adoptedApplicationIds = new Set(
            applications
              .filter((a) => /^(adopted|completed)$/i.test(String(a.application_status ?? "").trim()))
              .map((a) => String(a.animal_id))
          );

          selectableRows = refRows.filter((rr) => {
            const id = String(rr.animal_id);
            if (id === rawVal) return true; // panatilihin ang kasalukuyang value kapag edit
            return !adoptedIds.has(id)
              && !adoptedApplicationIds.has(id)
              && !/^adopted$/i.test(String(rr.adoption_status ?? "").trim());
          });
        }

        input.innerHTML = "";
        if (!f.required) input.appendChild(new Option("— none / blank —", ""));

        const refRes = RESOURCES.find((x) => x.key === f.ref.key);
        for (const rr of selectableRows) {
          const label = refOptionLabel(f.ref, rr, rr[refRes.idKey]);
          const status = onlyAvailableAnimals
            ? String(rr.adoption_status ?? "").trim()
            : "";
          input.appendChild(new Option(status ? `${label} — ${status}` : label, String(rr[refRes.idKey])));
        }

        // Kapag edit at ang referenced record ay hindi na umiiral:
        if (rawVal) {
          const exists = [...input.options].some((o) => o.value === rawVal);
          if (!exists) input.appendChild(new Option(`#${rawVal} (no longer exists)`, rawVal));
          input.value = rawVal;
        }
      }).catch(() => {
        // Fallback: plain number input para hindi ma-blotot kung may problema sa API
        const num = document.createElement("input");
        num.type = "number";
        num.name = f.name;
        num.id = "f-" + f.name;
        if (rawVal && /^\d+$/.test(rawVal)) num.value = rawVal;
        if (!f.required) num.placeholder = "(optional / ID number)";
        input.replaceWith(num);
      });
    }
  }
}

function openForm(row) {
  const r = currentRes();
  editingId = row ? row[r.idKey] : null;

  $("form-title").innerHTML = `${row ? "✏️" : "✨"} ${row ? `Edit ${r.label} #${row[r.idKey]}` : `Add ${r.label}`}`;
  buildFormFields(r, row ?? null);
  $("form-panel").hidden = false;
  $("work-grid").classList.remove("single");
  const first = $("form").querySelector("input, select");
  if (first) first.focus();
}

function hideForm() {
  editingId = null;
  $("form-panel").hidden = true;
  // ihawak ang table sa buong lapad — walang naka-reserve na blangko para sa nakatagong form
  $("work-grid").classList.add("single");
}

async function saveForm() {
  const r = currentRes();
  const editing = editingId !== null;

  // 1) Buuin ang body mula sa inputs
  const body = {};
  const problems = [];

  for (const f of r.fields) {
    const el = $("f-" + f.name);
    if (!el) continue;
    const raw = el.value.trim();

    // Skip: blangko at optional — para sa password ay laging skip kapag blank
    if (!raw) {
      if (f.type === "password" || !f.required) continue;
      problems.push(`${f.label} is required`);
      continue;
    }

    if (f.type === "number") {
      const num = Number(raw);
      if (!Number.isSafeInteger(num) || num <= 0) {
        problems.push(`${f.label} must be a positive whole number`);
        continue;
      }
      body[f.name] = num;
    } else if (f.type === "password") {
      body[f.name] = raw; // hahashin na ng backend
    } else {
      body[f.name] = raw;
    }
  }

  if (problems.length) return toast(problems[0], "err");
  if (!Object.keys(body).length) return toast("No new values — fill in at least one field.", "err");

  // 2) Ipadala: POST kapag add, PUT kapag edit
  const path = editing ? `${r.path}/${editingId}` : r.path;
  const method = editing ? "PUT" : "POST";

  const saveBtn = $("btn-save");
  const originalLabel = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    await api(path, { method, body });
    clearRefCache(); // baka may bagong record na kaya't i-refresh ang mga dropdown
    toast(editing ? "Updated!" : "Created! The record was added.", "ok");
    hideForm();
    loadResource(currentKey);
  } catch (err) {
    if (err.message === "unauthorized") return;
    toast("Save failed: " + err.message, "err");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  }
}

async function deleteRow(id) {
  const r = currentRes();
  if (!confirm(`Delete ${r.label} #${id}? This cannot be undone.`)) return;
  try {
    await api(`${r.path}/${id}`, { method: "DELETE" });
    clearRefCache();
    toast("Deleted!", "ok");
    loadResource(currentKey);
  } catch (err) {
    if (err.message === "unauthorized") return;
    toast("Delete failed: " + err.message, "err");
  }
}

/* ---------- 7. TOAST + WIRING ---------- */

let toastTimer = null;
function toast(text, kind = "") {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast " + kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function wireApp() {
  $("btn-add").addEventListener("click", () => openForm(null));
  $("btn-cancel").addEventListener("click", hideForm);
  $("btn-save").addEventListener("click", saveForm);
  $("btn-reload").addEventListener("click", () => loadResource(currentKey));
  $("search").addEventListener("input", renderTable);
}

/* ---------- 8. BOOT ---------- */
wireLogin();
wireApp();

// Keep-awake ping — hindi natutulog ang Render free tier habang bukas ang tab
// (5 minuto pagitan; hindi dagdag sa API load — isang GET / lang)
setInterval(() => {
  if (document.hidden || !state.accessToken) return;
  fetch(ensureTrailingSlash(state.base), { method: "GET" }).catch(() => { /* silent */ });
}, 5 * 60 * 1000);

// Kapag may na-save na session, diretsyo sa app; kung wala, login screen
if (state.accessToken) {
  showApp(true);
} else {
  showApp(false);
}
