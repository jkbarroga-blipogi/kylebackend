import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { browserPath, openBrowser } from "./helpers/browser.js";

const root = resolve("frontend");
let browser, server, origin, rows, requests, failures, delays, role, adopterProfile, accountId;
const token = () => `header.${btoa(JSON.stringify({ sub: accountId, username: "Alex", role }))}.signature`;
const fixtureRows = () => ({
  animal: [{ animal_id: 1, breed_id: 1, animal_name: "Luna", sex: "Female", arrival_date: "2026-11-01", birth_date: null, color: "White", adoption_status: "Available" }],
  breed: [{ breed_id: 1, species_id: 1, breed_name: "Domestic shorthair", species: { species_name: "Cat" } }],
  species: [{ species_id: 1, species_name: "Cat" }],
  "shelter/adopter": [{ adopter_id: 2, first_name: "Sam", last_name: "Cruz", phone: "+63 0912", address: "Manila", email: null }],
  "shelter/staff": [{ staff_id: 3, first_name: "Alex", last_name: "Reyes", position: "Care coordinator" }],
  "shelter/adoption-application": [{ application_id: 4, animal_id: 1, adopter_id: 2, staff_id: 3, application_date: "2026-11-02", application_status: "Pending" }],
  "shelter/adoption": [], "shelter/medical-record": [],
  users: [{ id: 7, username: "Alex", role: "admin", password: "NEVER_RENDER_HASH", refresh_token: "NEVER_RENDER_TOKEN" }],
  "adopter/animals": [{ animal_id: 1, animal_name: "Luna", sex: "Female", color: "White", birth_date: null, arrival_date: "2026-11-01", adoption_status: "Available", breed_name: "Domestic shorthair", species_name: "Cat" }],
  "adopter/applications": [],
});

async function handle(request, response) {
  const url = new URL(request.url, origin || "http://127.0.0.1");
  if (!url.pathname.startsWith("/api/")) {
    const path = resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!path.startsWith(root)) { response.writeHead(404).end(); return; }
    try {
      let data = await readFile(path, "utf8");
      if (path.endsWith("index.html")) data = data.replace('content="https://kylebackend.onrender.com"', `content="${origin}/api"`);
      response.writeHead(200, { "Content-Type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html" });
      response.end(data);
    } catch (error) { response.writeHead(404).end("File not found"); }
    return;
  }
  const path = url.pathname.slice(5);
  let text = "";
  for await (const chunk of request) text += chunk;
  const body = text ? JSON.parse(text) : undefined;
  requests.push({ path, method: request.method, body, authorization: request.headers.authorization });
  if (delays[`${request.method} ${path}`]) await delays[`${request.method} ${path}`];
  const failure = failures[`${request.method} ${path}`];
  let status = failure || 200;
  let data;
  if (failure) data = { message: failure === 401 ? "Unauthorized" : "Fixture request failed" };
  else if (path === "auth/login") data = { accessToken: token(), refreshToken: "fixture-refresh" };
  else if (path === "auth/logout") data = { ok: true };
  else if (path === "auth/register") data = { id: 8, username: body.username, role: "user" };
  else if (path === "adopter/profile" && request.method === "GET") data = adopterProfile;
  else if (path === "adopter/profile" && request.method === "PUT") data = adopterProfile = { adopter_id: 10, ...body, email: body.email || null };
  else if (path === "adopter/applications" && request.method === "POST") {
    data = { application_id: 30, animal_id: body.animal_id, animal_name: "Luna", application_date: "2026-11-08", application_status: "Pending", reviewer_assigned: false };
    rows[path].push(data);
  }
  else if (request.method === "GET" && rows[path]) data = rows[path];
  else if (request.method === "POST" && rows[path]) {
    const idKey = { animal: "animal_id", "shelter/adopter": "adopter_id", "shelter/adoption": "adoption_id" }[path] || "id";
    data = { ...body, [idKey]: 8 };
    rows[path].push(data);
  } else if (request.method === "DELETE" && path.startsWith("shelter/adopter/")) {
    const id = Number(path.split("/").at(-1));
    rows["shelter/adopter"] = rows["shelter/adopter"].filter((row) => row.adopter_id !== id);
    data = { deleted: true, id };
  } else if (request.method === "PUT" && path.startsWith("shelter/adoption-application/")) {
    data = { ...rows["shelter/adoption-application"][0], ...body };
  } else { status = 404; data = { message: "Unexpected fixture route" }; }
  response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
}

async function login() {
  await browser.fill("#login-user", "Alex");
  await browser.fill("#login-pass", "fixture-password");
  await browser.evaluate('document.querySelector("#login-form").requestSubmit()');
  await browser.wait('!document.querySelector("#view-app").hidden');
  await browser.wait('document.querySelector("#page-content").getAttribute("aria-busy") !== "true"');
}
async function navigate(key) {
  await browser.click(`[data-resource="${key}"]`);
  await browser.wait(`document.querySelector("#res-title").textContent === ${JSON.stringify({ animal: "Animals", adopter: "Adopters", adoption: "Adoptions", users: "Users" }[key])}`);
  await browser.wait('document.querySelector("#page-content").getAttribute("aria-busy") !== "true"');
}
async function screenshot(name) {
  if (!process.env.FRONTEND_SCREENSHOTS) return;
  await mkdir(process.env.FRONTEND_SCREENSHOTS, { recursive: true });
  const { data } = await browser.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(process.env.FRONTEND_SCREENSHOTS, name + ".png"), Buffer.from(data, "base64"));
}

describe.skipIf(!browserPath)("frontend browser journeys (isolated local API)", () => {
  beforeAll(async () => {
    server = createServer((request, response) => { handle(request, response).catch((error) => { response.writeHead(500).end("Fixture failure"); console.error(error.message); }); });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await openBrowser();
  }, 25000);
  beforeEach(async () => {
    rows = fixtureRows(); requests = []; failures = {}; delays = {}; role = "admin"; adopterProfile = null; accountId = 7;
    browser.errors.length = 0;
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await browser.send("Page.navigate", { url: origin + "/" });
    await browser.wait('document.querySelector("#login-form") && document.querySelector("#login-form").dataset.ready === "true"');
  });
  afterEach(() => expect(browser.errors).toEqual([]));
  afterAll(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); }, 20000);

  it("validates accessible forms, saves numeric relationships, and distinguishes a saved write from reload failure", async () => {
    await screenshot("login-desktop");
    await login();
    await screenshot("overview-desktop");
    expect(await browser.evaluate('document.querySelector("#overview").textContent')).toContain("Total animals");
    expect(await browser.evaluate('document.querySelector("#overview").textContent')).not.toContain("Available animals");
    expect(await browser.evaluate('document.querySelector("#overview").textContent')).not.toContain("Make the next move");
    expect(await browser.evaluate('document.querySelector("#btn-overview-reload")')).toBeNull();
    expect(await browser.evaluate('document.querySelector(".breadcrumbs")')).toBeNull();
    expect(await browser.evaluate('getComputedStyle(document.documentElement).scrollBehavior')).toBe("smooth");
    expect(await browser.evaluate('document.querySelectorAll(".stat-card").length')).toBe(1);
    expect(await browser.evaluate('document.querySelector("#overview").textContent')).not.toContain("Pending applications");
    expect(await browser.evaluate('document.querySelector("#overview").textContent')).not.toContain("Adoption records");
    expect(await browser.evaluate('document.querySelector("#page-eyebrow").textContent')).toBe("Dashboard");
    expect(await browser.evaluate('document.querySelector("#res-description").textContent')).toContain("needs your attention");
    expect(await browser.evaluate('document.querySelector(".page-heading").textContent.toLowerCase()')).not.toContain("at a glance");
    await navigate("animal");
    await screenshot("animals-desktop");
    await browser.click("#btn-add");
    await browser.wait('!document.querySelector("#btn-save").disabled');
    await browser.evaluate('document.querySelector("#record-form").requestSubmit()');
    expect(await browser.evaluate('document.querySelector("#f-animal_name").getAttribute("aria-invalid")')).toBe("true");
    expect(await browser.evaluate('document.querySelector("label[for=f-animal_name]").textContent')).toContain("Animal name");
    await browser.fill("#f-breed_id", "1");
    await browser.fill("#f-animal_name", "Milo");
    await browser.fill("#f-sex", "Male");
    await browser.fill("#f-arrival_date", "2026-11-08");
    failures["GET animal"] = 500;
    await browser.evaluate('document.querySelector("#record-form").requestSubmit()');
    await browser.wait('document.querySelector("#page-message").textContent.includes("saved")');
    expect(requests.find((r) => r.path === "animal" && r.method === "POST").body).toMatchObject({ animal_name: "Milo", breed_id: 1, arrival_date: "2026-11-08" });
    expect(await browser.evaluate('document.querySelector("#page-message").textContent')).toContain("saved");
    await browser.wait('document.querySelector("#table-wrap").textContent.includes("could not")');
  });

  it("retains non-password drafts on expiry and resumes them for the same account", async () => {
    await login(); await navigate("adopter"); await browser.click("#btn-add");
    for (const [name, value] of Object.entries({ first_name: "Jamie", last_name: "Cruz", phone: "+63 00123", address: "Line one\nLine two" })) await browser.fill(`#f-${name}`, value);
    failures["POST shelter/adopter"] = 401;
    await browser.evaluate('document.querySelector("#record-form").requestSubmit()');
    await browser.wait('!document.querySelector("#view-login").hidden');
    expect(await browser.evaluate('document.querySelector("#login-msg").textContent')).toContain("draft");
    delete failures["POST shelter/adopter"];
    await login();
    expect(await browser.evaluate('document.querySelector("#f-address").value')).toBe("Line one\nLine two");
    expect(await browser.evaluate('document.querySelector("#form-message").textContent')).not.toContain("Saving your changes");
    expect(requests.some((r) => r.path === "auth/refresh")).toBe(false);
    expect(await browser.evaluate('localStorage.getItem("accessToken")')).toBeNull();
  });

  it("restricts volunteer requests and blocks unprovisioned management access", async () => {
    role = "volunteer";
    await login();
    expect(requests.filter((r) => r.method === "GET").every((r) => r.path === "animal")).toBe(true);
    await navigate("animal");
    expect(await browser.evaluate('document.querySelector("#btn-add").hidden')).toBe(true);
    expect(await browser.evaluate('document.querySelectorAll("[data-edit], [data-delete]").length')).toBe(0);
    await browser.click("#btn-logout");
    await browser.wait('!document.querySelector("#view-login").hidden');
    role = "unknown"; requests = [];
    await login();
    expect(await browser.evaluate('document.querySelector("#access-panel").hidden')).toBe(false);
    expect(requests.some((r) => r.method === "GET")).toBe(false);
  });

  it("derives adoption relationships and preserves partial success without duplicating adoption creation", async () => {
    await login(); await navigate("adoption"); await browser.click("#btn-add");
    await browser.wait('!document.querySelector("#btn-save").disabled');
    await browser.fill("#f-application_id", "4");
    await browser.fill("#f-staff_id", "3");
    await browser.fill("#f-adoption_date", "2026-11-08");
    expect(await browser.evaluate('document.querySelector("#f-animal_id").value')).toBe("1");
    expect(await browser.evaluate('document.querySelector("#f-adopter_id").value')).toBe("2");
    await browser.evaluate('document.querySelector("#record-form").requestSubmit()');
    await browser.wait('!document.querySelector("#adoption-followup").hidden');
    failures["PUT shelter/adoption-application/4"] = 409;
    await browser.click("#btn-finalize");
    await browser.wait('document.querySelector("#followup-message").textContent.includes("still needs")');
    expect(requests.filter((r) => r.method === "POST" && r.path === "shelter/adoption")).toHaveLength(1);
  });

  it("preserves a failed list state when the user searches", async () => {
    await login();
    failures["GET animal"] = 500;
    await navigate("animal");
    await browser.fill("#search", "Luna");
    expect(await browser.evaluate('document.querySelector("#table-wrap").textContent')).toContain("Records could not load");
    expect(await browser.evaluate('document.querySelector("#table-wrap").textContent')).not.toContain("No matching records");
  });

  it("discards a late adoption follow-up result after signing into another role", async () => {
    await login(); await navigate("adoption"); await browser.click("#btn-add");
    await browser.wait('!document.querySelector("#btn-save").disabled');
    await browser.fill("#f-application_id", "4");
    await browser.fill("#f-staff_id", "3");
    await browser.fill("#f-adoption_date", "2026-11-08");
    await browser.evaluate('document.querySelector("#record-form").requestSubmit()');
    await browser.wait('!document.querySelector("#adoption-followup").hidden');
    let release;
    delays["PUT shelter/adoption-application/4"] = new Promise((resolve) => { release = resolve; });
    await browser.click("#btn-finalize");
    await browser.click("#btn-logout");
    await browser.wait('!document.querySelector("#view-login").hidden');
    role = "user";
    await login();
    release();
    await browser.wait('!document.querySelector("#btn-finalize").disabled');
    expect(await browser.evaluate('document.querySelector("#page-message").textContent')).not.toContain("Adoption #");
    expect(await browser.evaluate('document.querySelector("#adoption-followup").hidden')).toBe(true);
  });

  it("keeps unavailable overview counts readable at 320 pixels", async () => {
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
    expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    failures["GET animal"] = 500;
    await login();
    expect(await browser.evaluate('document.querySelector("#overview").textContent')).toContain("Unavailable");
    expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
  });

  it("retries failed relationship choices while keeping the form draft", async () => {
    await login(); await navigate("animal");
    failures["GET breed"] = 500;
    await browser.click("#btn-add");
    await browser.wait('document.querySelector("#reference-message").textContent.includes("Cannot load")');
    await browser.fill("#f-animal_name", "Draft name");
    expect(await browser.evaluate('document.querySelector("#btn-save").disabled')).toBe(true);
    delete failures["GET breed"];
    await browser.click("#reference-message button");
    await browser.wait('!document.querySelector("#btn-save").disabled');
    expect(await browser.evaluate('document.querySelector("#f-animal_name").value')).toBe("Draft name");
    expect(await browser.evaluate('document.querySelector("#f-breed_id").options[1].textContent')).toContain("Domestic shorthair");
  });

  it("allows correction after a definite rejected update even when values are unchanged", async () => {
    await login(); await navigate("animal"); await browser.click('[data-edit="1"]');
    await browser.wait('!document.querySelector("#btn-save").disabled');
    failures["PUT animal/1"] = 409;
    await browser.evaluate('document.querySelector("#record-form").requestSubmit()');
    await browser.wait('document.querySelector("#form-message").textContent.includes("Fixture request failed")');
    expect(await browser.evaluate('document.querySelector("#btn-save").disabled')).toBe(false);
    expect(await browser.evaluate('document.querySelector("#form-message").textContent')).not.toContain("Reload records to check");
  });

  it("confirms deletes, keeps conflicts visible, and restores focus after success", async () => {
    await login(); await navigate("adopter");
    await browser.click('[data-delete="2"]');
    expect(await browser.evaluate('document.querySelector("#delete-dialog").open')).toBe(true);
    expect(await browser.evaluate('document.activeElement.id')).toBe("delete-cancel");
    failures["DELETE shelter/adopter/2"] = 409;
    await browser.click("#delete-confirm");
    await browser.wait('document.querySelector("#delete-message").textContent.includes("Fixture request failed")');
    expect(rows["shelter/adopter"]).toHaveLength(1);
    delete failures["DELETE shelter/adopter/2"];
    await browser.click("#delete-confirm");
    await browser.wait('!document.querySelector("#delete-dialog").open && document.querySelector("#table-wrap").textContent.includes("No adopters yet")');
    expect(await browser.evaluate('document.activeElement.id')).toBe("res-title");
    expect(rows["shelter/adopter"]).toHaveLength(0);
  });

  it("reflows at 320, 360, 768 and 1440 pixels, exposes keyboard navigation and escapes record text", async () => {
    rows.animal[0].animal_name = '<img src=x onerror="window.injected=true">';
    await login(); await navigate("animal");
    expect(await browser.evaluate('window.injected || false')).toBe(false);
    for (const width of [320, 360, 768, 1440]) {
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      const layout = await browser.evaluate(`({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll("body *")].filter(element => !element.closest(".table-wrap") && element.getBoundingClientRect().right > window.innerWidth).slice(0, 12).map(element => ({ tag: element.tagName, id: element.id, class: element.className, right: element.getBoundingClientRect().right })) })`);
      expect(layout.scroll <= layout.width, JSON.stringify(layout)).toBe(true);
    }
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: false });
    await screenshot("animals-mobile");
    await browser.evaluate('document.querySelector("#nav-toggle").focus()');
    await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
    await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    expect(await browser.evaluate('document.querySelector("#nav-toggle").getAttribute("aria-expanded")')).toBe("true");
    await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    expect(await browser.evaluate('document.querySelector("#nav-toggle").getAttribute("aria-expanded")')).toBe("false");
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate("users");
    expect(await browser.evaluate('document.querySelector("#table-wrap").textContent')).not.toMatch(/NEVER_RENDER/);
    await browser.click("#btn-add");
    expect(await browser.evaluate('document.querySelector("#f-role")')).toBeNull();
  });

  it("lets an adopter select an animal, save owned contact details, submit, and track status", async () => {
    role = "user";
    await login();
    expect(await browser.evaluate('document.querySelector("#topbar-role").textContent')).toBe("Adopter");
    await browser.click('[data-apply="1"]');
    await browser.wait('document.querySelector("#application-panel").textContent.includes("contact details")');
    await browser.click('#application-panel [data-resource="my-details"]');
    await browser.wait('document.querySelector("#adopter-profile-form")');
    for (const [name, value] of Object.entries({ first_name: "Ana", last_name: "Cruz", phone: "+63 00123", address: "First line\nSecond line", email: "ana@example.test" })) await browser.fill(`#f-${name}`, value);
    await browser.evaluate('document.querySelector("#adopter-profile-form").requestSubmit()');
    await browser.wait('document.querySelector("#btn-submit-application") && !document.querySelector("#btn-submit-application").disabled');
    await browser.click("#btn-submit-application");
    await browser.wait('document.querySelector("#res-title").textContent === "My applications" && document.querySelector("#adopter-view").textContent.includes("Pending")');
    const submitted = requests.find((item) => item.path === "adopter/applications" && item.method === "POST");
    expect(submitted.body).toEqual({ animal_id: 1 });
    expect(adopterProfile.phone).toBe("+63 00123");
    expect(requests.filter((item) => item.method === "GET").every((item) => item.path.startsWith("adopter/"))).toBe(true);
    rows["adopter/applications"][0].application_status = "Approved";
    rows["adopter/applications"][0].reviewer_assigned = true;
    await browser.click("#portal-reload");
    await browser.wait('document.querySelector("#adopter-view").textContent.includes("Approved")');
    await screenshot("adopter-applications");
  });

  it("registers a user through a native form and never submits a role", async () => {
    role = "user";
    await browser.click("#btn-register");
    await browser.fill("#login-user", "NewAdopter");
    await browser.fill("#register-email", "newadopter@example.com");
    await browser.fill("#login-pass", " sample password ");
    await browser.fill("#register-confirm", " sample password ");
    await browser.evaluate('document.querySelector("#login-form").requestSubmit()');
    await browser.wait('!document.querySelector("#view-app").hidden && document.querySelector("#page-content").getAttribute("aria-busy") === "false"');
    expect(requests.find((item) => item.path === "auth/register").body).toEqual({ username: "NewAdopter", email: "newadopter@example.com", password: " sample password " });
    expect(await browser.evaluate('document.querySelector("#res-title").textContent')).toBe("Available animals");
  });

  it("shows user sign up on the side with an automatic Render connection", async () => {
    expect(await browser.evaluate('document.querySelector("#login-form").textContent')).not.toContain("Create an adopter account");
    expect(await browser.evaluate('document.querySelector("#connection-settings")')).toBeNull();
    expect(await browser.evaluate('document.querySelector("#login-api")')).toBeNull();
    expect(await browser.evaluate('document.querySelector("#btn-test")')).toBeNull();
    expect(await browser.evaluate('document.querySelector("label[for=login-user]").textContent')).toContain("Username or Email");
    expect(await browser.evaluate('document.querySelector("#login-form").method')).toBe("post");
    expect(await browser.evaluate('document.querySelector("#btn-register").textContent')).toContain("Create new account");
    await browser.click("#btn-register");
    expect(await browser.evaluate('document.querySelector("#btn-register").textContent')).toContain("Already registered? Sign in");
    expect(await browser.evaluate('document.querySelector("#register-email").hidden')).toBe(false);
  });

  it("rejects a short registration password", async () => {
    await browser.click("#btn-register");
    await browser.fill("#login-user", "NewAdopter");
    await browser.fill("#register-email", "newadopter@example.com");
    await browser.fill("#login-pass", "short");
    await browser.fill("#register-confirm", "short");
    await browser.evaluate('document.querySelector("#login-form").requestSubmit()');
    expect(await browser.evaluate('document.querySelector("#login-msg").textContent')).toContain("at least 8");
    expect(requests).toHaveLength(0);
  });

  it("preserves adopter profile drafts on expiry and reflows the adopter screens", async () => {
    role = "user";
    await login();
    for (const width of [320, 360, 768, 1440]) {
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    }
    await screenshot("adopter-animals");
    await browser.click('[data-resource="my-details"]');
    await browser.wait('document.querySelector("#adopter-profile-form")');
    for (const [name, value] of Object.entries({ first_name: "Ana", last_name: "Cruz", phone: "+63 00123", address: "Home address" })) await browser.fill(`#f-${name}`, value);
    failures["PUT adopter/profile"] = 401;
    await browser.evaluate('document.querySelector("#adopter-profile-form").requestSubmit()');
    await browser.wait('!document.querySelector("#view-login").hidden');
    delete failures["PUT adopter/profile"];
    await login();
    expect(await browser.evaluate('document.querySelector("#f-phone").value')).toBe("+63 00123");
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
    expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
  });

  it("shows rejected application submissions without reporting success or retrying", async () => {
    role = "user";
    adopterProfile = { adopter_id: 10, first_name: "Ana", last_name: "Cruz", phone: "123", address: "City", email: null };
    await login();
    await browser.click('[data-apply="1"]');
    await browser.wait('document.querySelector("#btn-submit-application")');
    failures["POST adopter/applications"] = 409;
    await browser.click("#btn-submit-application");
    await browser.wait('document.querySelector("#application-message").textContent.includes("Fixture request failed")');
    expect(requests.filter((item) => item.method === "POST" && item.path === "adopter/applications")).toHaveLength(1);
    expect(rows["adopter/applications"]).toHaveLength(0);
  });

  it("keeps uncertain applications blocked until a reload reconciles the saved application", async () => {
    role = "user";
    adopterProfile = { adopter_id: 10, first_name: "Ana", last_name: "Cruz", phone: "123", address: "City", email: null };
    await login();
    await browser.click('[data-apply="1"]');
    failures["POST adopter/applications"] = 500;
    await browser.click("#btn-submit-application");
    await browser.wait('document.querySelector("#application-message").textContent.includes("Check My applications")');
    await browser.click('[data-apply="1"]');
    expect(await browser.evaluate('document.querySelector("#btn-submit-application").disabled')).toBe(true);
    expect(await browser.evaluate('document.querySelector("#application-message").textContent')).toContain("Check My applications");
    rows["adopter/applications"].push({ application_id: 30, animal_id: 1, animal_name: "Luna", application_date: "2026-11-08", application_status: "Pending", reviewer_assigned: false });
    await browser.click("#portal-reload");
    await browser.wait('document.querySelector("#adopter-view").textContent.includes("Application pending")');
    expect(await browser.evaluate('document.querySelector("#btn-submit-application")')).toBeNull();
    expect(requests.filter((item) => item.method === "POST" && item.path === "adopter/applications")).toHaveLength(1);
  });

  it("checks registration passwords and never registers twice after a sign-in failure", async () => {
    role = "user";
    await browser.click("#btn-register");
    await browser.fill("#login-user", "NewAdopter");
    await browser.fill("#register-email", "newadopter@example.com");
    await browser.fill("#login-pass", "new-password");
    await browser.fill("#register-confirm", "different-password");
    await browser.evaluate('document.querySelector("#login-form").requestSubmit()');
    expect(await browser.evaluate('document.querySelector("#login-msg").textContent')).toContain("do not match");
    expect(requests).toHaveLength(0);
    await browser.fill("#register-confirm", "new-password");
    failures["POST auth/login"] = 500;
    await browser.evaluate('document.querySelector("#login-form").requestSubmit()');
    await browser.wait('document.querySelector("#login-msg").textContent.includes("Registration accepted") && !document.querySelector("#btn-login").disabled');
    delete failures["POST auth/login"];
    await browser.evaluate('document.querySelector("#login-form").requestSubmit()');
    await browser.wait('!document.querySelector("#view-app").hidden');
    expect(requests.filter((item) => item.path === "auth/register")).toHaveLength(1);
  });

  it("clears an expired adopter draft when another adopter signs in", async () => {
    role = "user";
    await login();
    await browser.click('[data-resource="my-details"]');
    await browser.wait('document.querySelector("#adopter-profile-form")');
    for (const [name, value] of Object.entries({ first_name: "Private", last_name: "Draft", phone: "123", address: "Private address" })) await browser.fill(`#f-${name}`, value);
    failures["PUT adopter/profile"] = 401;
    await browser.evaluate('document.querySelector("#adopter-profile-form").requestSubmit()');
    await browser.wait('!document.querySelector("#view-login").hidden');
    accountId = 8;
    await login();
    expect(await browser.evaluate('document.querySelector("#f-address").value')).toBe("");
    expect(await browser.evaluate('document.querySelector("#page-message").textContent')).toContain("previous draft is cleared");
  });

  it("lets staff assign a reviewer to an unassigned self-service application", async () => {
    role = "staff";
    rows["shelter/adoption-application"][0].staff_id = null;
    await login();
    await browser.click('[data-resource="adoption-application"]');
    await browser.wait('document.querySelector("[data-edit]")');
    await browser.click('[data-edit="4"]');
    await browser.wait('!document.querySelector("#btn-save").disabled');
    expect(await browser.evaluate('document.querySelector("#f-staff_id").value')).toBe("");
    await browser.fill("#f-staff_id", "3");
    await browser.fill("#f-application_status", "Approved");
    await browser.evaluate('document.querySelector("#record-form").requestSubmit()');
    await browser.wait('document.querySelector("#page-message").textContent.includes("saved")');
    expect(requests.find((item) => item.path === "shelter/adoption-application/4" && item.method === "PUT").body).toMatchObject({ staff_id: 3, application_status: "Approved" });
  });
});
