import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { browserPath, openBrowser } from "./helpers/browser.js";

const frontendRoot = fileURLToPath(new URL("../frontend-next/", import.meta.url));
const nextBin = fileURLToPath(new URL("../frontend-next/node_modules/next/dist/bin/next", import.meta.url));
let browser;
let server;
let origin;
let api;
let apiOrigin;
let refreshRequests = 0;
const pendingRefresh = [];

function finishRefresh() {
  const claims = { sub: 7, username: "Fixture admin", role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 };
  const accessToken = `fixture.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.fixture`;
  for (const response of pendingRefresh.splice(0)) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ accessToken, refreshToken: "fixture-refresh" }));
  }
}

function fixtureApi(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  const path = new URL(request.url, apiOrigin).pathname;
  if (path === "/auth/refresh") {
    refreshRequests++;
    pendingRefresh.push(response);
    return;
  }
  const animal = { animal_id: 1, animal_name: "Fixture Luna", breed_id: 1, sex: "Female", arrival_date: "2026-11-01", adoption_status: "Available", color: "White", image_url: "/mark.svg" };
  const rows = path === "/animal" ? [animal]
    : path === "/breed" ? [{ breed_id: 1, species_id: 1, breed_name: "Aspin" }]
    : path === "/species" ? [{ species_id: 1, species_name: "Dog" }]
    : [];
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(rows));
}

function buildFrontend() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, "build"], {
      cwd: frontendRoot,
      env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_API_URL: apiOrigin },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const capture = (chunk) => { output = (output + String(chunk)).slice(-12000); };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Next.js test build failed (${code}): ${output}`));
      else {
        if (/warning/i.test(output)) console.warn(output);
        resolve();
      }
    });
  });
}

async function restoreSession() {
  await expect.poll(() => pendingRefresh.length, { timeout: 15000 }).toBeGreaterThan(0);
  finishRefresh();
}

async function openPage(resource) {
  const previous = await browser.evaluate("window.__fixtureGeneration ?? null");
  finishRefresh();
  await browser.send("Page.navigate", { url: `${origin}/?resource=${resource}` });
  await expect.poll(
    () => browser.evaluate(`Boolean(window.__fixtureGeneration && window.__fixtureGeneration !== ${JSON.stringify(previous)})`),
    { timeout: 15000 },
  ).toBe(true);
}

async function expectPage(title) {
  try {
    await expect.poll(
      () => browser.evaluate('document.querySelector("h1")?.textContent'),
      { timeout: 10000 },
    ).toBe(title);
  } catch {
    throw new Error(`Expected ${title}. Refresh requests: ${refreshRequests}. Browser events: ${JSON.stringify(browser.runtimeEvents)}`);
  }
}

describe.skipIf(!browserPath)("Next.js session restoration and Overview navigation", () => {
  beforeAll(async () => {
    api = createServer(fixtureApi);
    await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
    apiOrigin = `http://127.0.0.1:${api.address().port}`;
    await buildFrontend();
    const portProbe = createServer();
    await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
    const port = portProbe.address().port;
    await new Promise((resolve) => portProbe.close(resolve));
    origin = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: frontendRoot,
      env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEST_API_URL: apiOrigin },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      let output = "";
      const capture = (chunk) => {
        output = (output + String(chunk)).slice(-4000);
        if (/ready in/i.test(output)) resolve();
      };
      server.stdout.on("data", capture);
      server.stderr.on("data", capture);
      server.once("error", reject);
      server.once("exit", (code) => reject(new Error(`Next.js test server exited (${code}): ${output}`)));
    });
    browser = await openBrowser();
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await browser.send("Inspector.enable");
    await browser.send("Target.setDiscoverTargets", { discover: true });
    await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__fixtureGeneration = crypto.randomUUID()" });
    await browser.send("Network.setCookie", { name: "barroga_refresh", value: "fixture-refresh", url: origin, httpOnly: true, sameSite: "Lax" });
  }, 180000);

  afterEach(() => expect(browser?.errors ?? []).toEqual([]));
  afterAll(async () => {
    finishRefresh();
    if (browser) await browser.close();
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
    if (api) {
      api.closeAllConnections();
      await new Promise((resolve) => api.close(resolve));
    }
  }, 20000);

  it("restores the current Animals page on refresh without flashing the login screen", async () => {
    await openPage("animal");
    await expect.poll(
      () => browser.evaluate('Boolean(document.querySelector("[aria-label=\\"Restoring your session\\"]"))'),
      { timeout: 7000 },
    ).toBe(true);
    expect(await browser.evaluate("document.body.textContent")).not.toContain("Welcome back.");
    await restoreSession();
    await expectPage("Animals");

    await browser.send("Page.reload");
    await expect.poll(
      () => browser.evaluate('Boolean(document.querySelector("[aria-label=\\"Restoring your session\\"]"))'),
      { timeout: 7000 },
    ).toBe(true);
    expect(await browser.evaluate("document.body.textContent")).not.toContain("Welcome back.");
    await restoreSession();
    await expectPage("Animals");
    expect(await browser.evaluate("window.location.search")).toBe("?resource=animal");
  }, 40000);

  it.each(["Explore animals", "View all animals", "Fixture Luna"])(
    "opens Animals from %s without replacing the document or refreshing the session",
    async (label) => {
      await openPage("overview");
      await restoreSession();
      await expectPage("Overview");
      await expect.poll(
        () => browser.evaluate(`Array.from(document.querySelectorAll("a")).some(link => link.textContent.includes(${JSON.stringify(label)}))`),
        { timeout: 10000 },
      ).toBe(true);
      await browser.evaluate('window.__documentMarker = "same-workspace"');
      const refreshesBeforeClick = refreshRequests;
      await browser.evaluate(`Array.from(document.querySelectorAll("a")).find(link => link.textContent.includes(${JSON.stringify(label)})).click()`);
      await expectPage("Animals");
      expect(await browser.evaluate("window.__documentMarker")).toBe("same-workspace");
      expect(refreshRequests).toBe(refreshesBeforeClick);
      expect(await browser.evaluate("window.location.search")).toBe("?resource=animal");
    },
    30000,
  );
});
