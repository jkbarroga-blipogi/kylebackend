import { createClient, DEFAULT_API } from "./js/api.js";
import { resources, getResource, canAccess, canWrite, provisioned } from "./js/resources.js";
import { readRows } from "./js/records.js";
import { $, icon, escapeHtml as esc, message, announce, emptyState } from "./js/ui.js";
import { renderOverview, renderTable } from "./js/views.js";
import { createEditor } from "./js/editor.js";
import { createDeletion } from "./js/deletion.js";
import { showLogin, wireAuth } from "./js/auth.js";
import { adopterPages, createAdopterPortal } from "./js/adopter.js";

let currentKey = new URL(location.href).searchParams.get("resource") || "overview";
let currentRows = [];
let tableLoaded = false;
let loadVersion = 0;
let expiredOwner = null;
let followup = null;
const client = createClient({ base: document.querySelector('meta[name="api-base"]')?.content || DEFAULT_API, onExpired: (owner) => {
  expiredOwner = { id: owner.id, role: owner.role, base: client.base };
  loadVersion++;
  editor.clearPasswords();
  $("delete-dialog").close();
  $("page-content").setAttribute("aria-busy", "false");
  showLogin("Your session expired. Sign in to continue. Your non-password draft stays in this tab.");
} });

const confirmDelete = createDeletion(client, async (outcome) => {
  editor.close(false);
  message("page-message", outcome === "missing" ? "This record was already absent. Records reloaded." : "Record deleted.", "success");
  const loaded = await loadTable();
  if (!loaded && client.session) message("page-message", "Deletion confirmed. Reload to see current records.", "success");
  $("res-title").focus();
});
const editor = createEditor(client, {
  onDelete: confirmDelete,
  onReload: () => loadTable(),
  onSaved: async (resource, row, created) => {
    message("page-message", "Changes saved.", "success");
    if (resource.key === "adoption" && created) {
      followup = { applicationId: row.application_id, adoptionId: row.adoption_id };
      $("adoption-followup").hidden = false;
      message("followup-message", "");
      $("btn-finalize").disabled = false;
    }
    const loaded = await loadTable();
    if (!loaded && client.session) message("page-message", "Changes saved. Reload to see current records.", "success");
    announce("Changes saved.");
    $("res-title").focus();
  },
});
const portal = createAdopterPortal(client, navigate);

function buildNavigation() {
  const role = client.session.role;
  const groups = new Map(role === "user" ? [["Your adoption journey", adopterPages]] : [["Workspace", [{ key: "overview", label: "Overview", icon: "overview" }]]]);
  for (const resource of resources) {
    if (!canAccess(role, resource.key) || (role === "staff" && resource.key === "staff")) continue;
    if (!groups.has(resource.group)) groups.set(resource.group, []);
    groups.get(resource.group).push(resource);
  }
  $("sidebar").innerHTML = [...groups].map(([group, entries]) => `<div class="nav-group"><p class="group-label">${esc(group)}</p><div>${entries.map((entry) => `<a class="nav-link" href="?resource=${entry.key}" data-resource="${entry.key}" ${entry.key === currentKey ? 'aria-current="page"' : ""}>${icon(entry.icon)}<span>${esc(entry.label)}</span></a>`).join("")}</div></div>`).join("");
}

function closeNavigation() {
  $("sidebar").classList.remove("is-open");
  $("nav-toggle").setAttribute("aria-expanded", "false");
}

async function navigate(key, create = false, push = true) {
  if (!client.session || !provisioned(client.session.role)) return;
  const adopter = client.session.role === "user";
  if (!(adopter ? portal.canLeave() : editor.canLeave())) return;
  if (adopter) {
    if (!adopterPages.some((page) => page.key === key)) key = "available-animals";
  } else if (key !== "overview" && !canAccess(client.session.role, key)) key = "overview";
  loadVersion++;
  currentKey = key;
  editor.close(false);
  closeNavigation();
  message("page-message", "");
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("resource", key);
  url.hash = "";
  if (push && url.href !== location.href) history.pushState(null, "", url);
  buildNavigation();
  const resource = adopter ? adopterPages.find((page) => page.key === key) : getResource(key);
  const overview = key === "overview";
  $("res-title").textContent = resource?.label || "Overview";
  $("breadcrumb").textContent = resource?.label || "Overview";
  $("page-eyebrow").textContent = adopter ? "Your adoption journey" : resource?.group || "The day at a glance";
  $("res-description").textContent = resource?.description || `Welcome back, ${client.session.username}. Here's your shelter at a glance.`;
  $("overview").hidden = !overview;
  $("records-view").hidden = overview || adopter;
  $("adopter-view").hidden = !adopter;
  $("btn-add").hidden = overview || adopter || !canWrite(client.session.role, key);
  $("btn-add").innerHTML = icon("plus") + `Add ${esc(resource?.singular || "animal")}`;
  $("today").hidden = !overview;
  $("search").value = "";
  document.title = `${resource?.label || "Overview"} | Barroga`;
  $("res-title").focus();
  if (adopter) await portal.show(key);
  else if (overview) await loadOverview();
  else {
    await loadTable();
    if (create && client.session && currentKey === key && canWrite(client.session.role, key)) editor.open(resource);
  }
}

async function loadTable() {
  const resource = getResource(currentKey);
  if (!resource || !client.session || !canAccess(client.session.role, resource.key)) return false;
  const version = ++loadVersion;
  const owner = client.session;
  currentRows = [];
  tableLoaded = false;
  $("page-content").setAttribute("aria-busy", "true");
  $("table-wrap").innerHTML = '<div class="loading" role="status">Loading records...</div>';
  $("record-count").textContent = "Loading";
  $("table-summary").textContent = "";
  $("last-updated").textContent = "";
  $("btn-reload").disabled = true;
  try {
    const rows = readRows(resource, await client.request(resource.path));
    if (version !== loadVersion || owner !== client.session) return false;
    currentRows = rows;
    tableLoaded = true;
    drawTable();
    $("last-updated").textContent = "Updated " + new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
    announce(`${resource.label}: ${rows.length} records loaded.`);
    return true;
  } catch (error) {
    if (version !== loadVersion || owner !== client.session) return false;
    $("record-count").textContent = "Unavailable";
    $("table-wrap").innerHTML = emptyState("Records could not load", error.message, resource.icon) + '<div class="empty"><button id="btn-table-retry" class="btn secondary" type="button">Retry loading</button></div>';
    $("btn-table-retry").onclick = loadTable;
    announce("Records could not load. Retry loading to continue.");
    return false;
  } finally {
    if (version === loadVersion) { $("page-content").setAttribute("aria-busy", "false"); $("btn-reload").disabled = false; }
  }
}

function drawTable() {
  const resource = getResource(currentKey);
  if (resource && client.session && tableLoaded) renderTable(resource, currentRows, client.session.role, editor.open, (resource, row) => {
    if (editor.canLeave()) confirmDelete(resource, row);
  });
}

async function loadOverview() {
  const owner = client.session;
  if (!owner) return;
  const version = ++loadVersion;
  $("page-content").setAttribute("aria-busy", "true");
  $("overview").innerHTML = '<div class="panel loading" role="status">Getting your shelter overview...</div>';
  const keys = owner.role === "volunteer" ? ["animal"] : ["animal", "adoption-application", "adoption"];
  const results = await Promise.allSettled(keys.map(async (key) => readRows(getResource(key), await client.request(getResource(key).path))));
  if (version !== loadVersion || owner !== client.session) return;
  renderOverview(Object.fromEntries(keys.map((key, index) => [key, results[index].status === "fulfilled" ? results[index].value : null])), owner.role);
  $("btn-overview-reload").onclick = loadOverview;
  $("page-content").setAttribute("aria-busy", "false");
  announce("Shelter overview loaded.");
}

function clearWorkspace() {
  loadVersion++;
  currentRows = [];
  tableLoaded = false;
  expiredOwner = null;
  followup = null;
  editor.close(false);
  portal.clear();
  $("adoption-followup").hidden = true;
  $("overview").replaceChildren();
  $("table-wrap").replaceChildren();
  $("sidebar").replaceChildren();
  message("page-message", "");
  $("page-content").setAttribute("aria-busy", "false");
}

wireAuth(client, {
  beforeLogout: () => client.session?.role === "user" ? portal.canLeave() : editor.canLeave(),
  onLogout: clearWorkspace,
  onLogin: async (session) => {
    const resume = expiredOwner?.id === session.id && expiredOwner.base === client.base && expiredOwner.role === session.role;
    const changed = Boolean(expiredOwner && !resume);
    if (!resume) clearWorkspace();
    expiredOwner = null;
    $("view-login").hidden = true;
    $("view-app").hidden = false;
    document.querySelector(".skip-link").href = "#workspace-main";
    $("topbar-user").textContent = session.username;
    $("topbar-role").textContent = session.role === "user" ? "Adopter" : session.role;
    $("topbar-avatar").textContent = session.username.charAt(0).toUpperCase();
    $("api-label").textContent = `API: ${new URL(client.base).host}`;
    $("access-panel").hidden = provisioned(session.role);
    $("page-content").hidden = !provisioned(session.role);
    buildNavigation();
    if (!provisioned(session.role)) {
      $("btn-add").hidden = true;
      $("res-title").textContent = "Your workspace";
      $("res-description").textContent = "Your account needs a provisioned shelter role.";
      $("res-title").focus();
      return;
    }
    if (resume && session.role === "user") {
      await portal.resume();
      $("res-title").focus();
    } else if (resume && editor.hasDraft) {
      editor.resume();
      message("page-message", "Signed in again. Your draft is ready to continue.", "success");
      $("form-title").focus();
    } else await navigate(currentKey, false, false);
    if (changed) message("page-message", "The account or access changed. The previous draft is cleared.");
  },
});

$("btn-finalize").onclick = async () => {
  if (!followup || !client.session || $("btn-finalize").disabled) return;
  const saved = followup;
  const owner = client.session;
  $("btn-finalize").disabled = true;
  message("followup-message", "Updating the application...");
  try {
    const result = await client.request(`shelter/adoption-application/${saved.applicationId}`, { method: "PUT", body: { application_status: "Adopted" } });
    if (owner !== client.session || followup !== saved) return;
    readRows(getResource("adoption-application"), [result]);
    followup = null;
    $("adoption-followup").hidden = true;
    message("page-message", `Adoption #${saved.adoptionId} and application #${saved.applicationId} are recorded. Other open applications for this animal are rejected.`, "success");
    if (currentKey === "overview") await loadOverview(); else await loadTable();
  } catch (error) {
    if (owner === client.session && followup === saved && error.status !== 401) message("followup-message", "Adoption saved. Application status still needs updating. " + error.message, "error");
  } finally { if (followup === saved || followup === null) $("btn-finalize").disabled = false; }
};
$("btn-add").onclick = () => { if (canWrite(client.session?.role, currentKey)) editor.open(getResource(currentKey)); };
$("btn-reload").onclick = loadTable;
$("search").oninput = () => { if ($("page-content").getAttribute("aria-busy") !== "true") drawTable(); };
$("search-icon").innerHTML = icon("search");
$("today").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date());
$("nav-toggle").onclick = () => {
  const open = $("sidebar").classList.toggle("is-open");
  $("nav-toggle").setAttribute("aria-expanded", String(open));
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("sidebar").classList.contains("is-open")) { closeNavigation(); $("nav-toggle").focus(); }
});
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-resource]");
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  navigate(link.dataset.resource, link.dataset.create === "true");
});
window.addEventListener("popstate", () => {
  const key = new URL(location.href).searchParams.get("resource") || "overview";
  if (!client.session) { currentKey = key; return; }
  navigate(key, false, false);
});
showLogin();
