export const $ = (id) => document.getElementById(id);
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const paths = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  paw: '<path d="M7 15c0-3 2-5 5-5s5 2 5 5c0 3-3 2-5 2s-5 1-5-2Z"/><ellipse cx="5" cy="8" rx="2" ry="3"/><ellipse cx="11" cy="5" rx="2" ry="3"/><ellipse cx="18" cy="7" rx="2" ry="3"/><path d="M8 21h8"/>',
  medical: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 5V3h8v2M12 10v6m-3-3h6"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6m-6 4h4"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-8h6v8"/>',
  leaf: '<path d="M20 3C9 2 3 7 5 14s15 6 15-11ZM4 21l10-10"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  badge: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M9 3h6v4H9z"/><circle cx="12" cy="12" r="2"/><path d="M8 18a4 4 0 0 1 8 0"/>',
  shield: '<path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.overview}</svg>`;
}
export function message(id, text, kind = "") {
  const element = $(id);
  element.textContent = text;
  element.hidden = !text;
  element.className = `message ${kind}`;
}
export function announce(text) { $("announcer").textContent = text; }
export function badge(value) {
  const status = String(value ?? "Not set");
  const key = status.trim().toLowerCase();
  const color = ["available", "adopted", "completed", "approved"].includes(key) ? "green" : ["pending", "review", "quarantine"].includes(key) ? "amber" : ["rejected", "cancelled", "canceled", "deceased"].includes(key) ? "red" : key === "admin" ? "violet" : "neutral";
  return `<span class="badge ${color}"><span aria-hidden="true"></span>${escapeHtml(status)}</span>`;
}
export const emptyState = (title, text, symbol = "layers") => `<div class="empty"><span class="empty-icon">${icon(symbol)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></div>`;
