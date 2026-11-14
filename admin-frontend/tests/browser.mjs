import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

// Node's WebSocket and an installed Chromium browser keep tests dependency-free.
export async function openBrowser() {
  const executable = process.env.BROWSER_PATH || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
  if (!executable) throw new Error("Set BROWSER_PATH to a Chromium browser executable.");
  const profile = await mkdtemp(join(process.env.LOCALAPPDATA, "Temp", "opencode", "admin-browser-"));
  const child = spawn(executable, ["--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("Browser startup timed out.")); }, 15000);
    child.once("error", reject);
    child.stderr.on("data", (chunk) => {
      if (process.env.DEBUG_BROWSER) console.error(String(chunk).trim());
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const socket = new WebSocket(endpoint);
  await once(socket, "open");
  let nextId = 0;
  const pending = new Map();
  const events = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (process.env.DEBUG_BROWSER && ["Page.javascriptDialogOpening", "Inspector.targetCrashed", "Target.targetCrashed", "Runtime.exceptionThrown"].includes(message.method)) console.error(message.method, JSON.stringify(message.params));
    if (message.method === "Inspector.targetCrashed") {
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Browser renderer crashed.")); }
      pending.clear();
    }
    const handler = events.get(`${message.sessionId}:${message.method}`);
    if (handler) handler(message.params);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  });
  function command(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  if (process.env.DEBUG_BROWSER) {
    console.error(await command("Browser.getVersion"));
    await command("Target.setDiscoverTargets", { discover: true });
  }
  return {
    async page(mock = mockBackend()) {
      const { targetId } = await command("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
      const send = (method, params) => command(method, params, sessionId);
      await send("Page.enable");
      await send("Runtime.enable");
      await send("Page.addScriptToEvaluateOnNewDocument", { source: mock.source });
      async function evaluate(expression) {
        const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      }
      const cors = [
        { name: "Content-Type", value: "application/json" },
        { name: "Access-Control-Allow-Origin", value: "*" },
        { name: "Access-Control-Allow-Headers", value: "authorization,content-type" },
        { name: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
      ];
      const requests = [];
      let users = structuredClone(mock.users);
      let releaseUsers;
      const released = new Promise((resolve) => { releaseUsers = resolve; });
      events.set(`${sessionId}:Page.javascriptDialogOpening`, () => { void send("Page.handleJavaScriptDialog", { accept: true }); });
      events.set(`${sessionId}:Fetch.requestPaused`, ({ requestId, request }) => {
        void (async () => {
          const url = new URL(request.url);
          if (url.origin === new URL(process.env.TEST_BASE_URL || "http://localhost:3000").origin) {
            await send("Fetch.continueRequest", { requestId });
            return;
          }
          if (url.origin !== "https://kylebackend.onrender.com") {
            await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
            return;
          }
          if (request.method === "OPTIONS") {
            await send("Fetch.fulfillRequest", { requestId, responseCode: 204, responseHeaders: cors });
            return;
          }
          const path = new URL(request.url).pathname;
          const method = request.method;
          const body = request.postData ? JSON.parse(request.postData) : null;
          requests.push({ path, method, body });
          let status = 200;
          let data = { ok: true };
          const id = Number(path.split("/")[2]);
          if (path === "/auth/login") { status = mock.loginStatus; data = { accessToken: "test-access-token", refreshToken: "test-refresh-token" }; }
          if (path === "/users" && method === "GET") {
            if (mock.deferred) await released;
            status = mock.usersStatus;
            data = users;
          }
          if (path.startsWith("/users/") && method === "GET") data = users.find(user => user.id === id);
          if (path === "/auth/register") { data = { ...body, id: 4, role: "user", created_at: "2026-11-14T09:00:00Z" }; users.push(data); }
          if (method === "PUT") Object.assign(users.find(user => user.id === id), body);
          if (method === "DELETE") users = users.filter(user => user.id !== id);
          await send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: cors, body: Buffer.from(JSON.stringify(status >= 400 ? { message: `Internal UnauthorizedException ${status}` } : data)).toString("base64") });
        })().catch((error) => { console.error("Mock backend failed:", error.message); process.exitCode = 1; });
      });
      await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
      return {
        requests,
        releaseUsers,
        setUsers: (next) => { users = next; },
        send,
        evaluate,
        go: (path) => send("Page.navigate", { url: `${process.env.TEST_BASE_URL || "http://localhost:3000"}${path}` }),
        async wait(expression) {
          await send("Page.bringToFront");
          return evaluate(`new Promise((resolve, reject) => {
            const deadline = performance.now() + 15000;
            function check() {
              if (${expression}) return resolve(true);
              if (performance.now() > deadline) return reject(new Error('UI condition timed out: ' + ${JSON.stringify(expression)}));
              setTimeout(check, 25);
            }
            check();
          })`);
        },
        async click(selector) {
          const point = await evaluate(`(() => { const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.getClientRects().length); if (!element) throw new Error('Missing visible control: ' + ${JSON.stringify(selector)}); element.scrollIntoView({block:'center'}); const rect = element.getBoundingClientRect(); return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}; })()`);
          await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, buttons: 0 });
          await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
          await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
        },
        async fill(selector, value) {
          const select = await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.focus(); if (input instanceof HTMLSelectElement) { input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', {bubbles:true})); return true; } input.select(); return false; })()`);
          if (!select) await send("Input.insertText", { text: value });
        },
        async key(key, modifiers = 0) {
          const code = key === "Escape" ? 27 : 9;
          await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: code, modifiers });
          await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code, modifiers });
        },
        viewport: (width) => send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }),
        async close() {
          events.delete(`${sessionId}:Fetch.requestPaused`);
          events.delete(`${sessionId}:Page.javascriptDialogOpening`);
          await command("Target.closeTarget", { targetId });
        },
      };
    },
    async close() {
      await command("Browser.close");
      socket.close();
      if (child.exitCode === null) await once(child, "exit");
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

export function mockBackend({ authenticated = false, loginStatus = 200, usersStatus = 200, deferred = false } = {}) {
  return { loginStatus, usersStatus, deferred, users: [
    {id: 1, username: 'Test Admin', email: 'admin@example.test', role: 'admin', created_at: '2026-11-14T09:00:00Z'},
    {id: 2, username: 'Avery', email: 'avery.with.a.long.email.address@example.test', role: 'user', created_at: '2026-11-13T09:00:00Z'},
    {id: 3, username: 'Shelter Staff', email: null, role: 'staff', created_at: '2026-11-12T09:00:00Z'}
  ], source: `(() => {
    const pair = {accessToken: 'test-access-token', refreshToken: 'test-refresh-token'};
    ${authenticated ? "localStorage.setItem('admin-session', JSON.stringify(pair));" : "localStorage.removeItem('admin-session');"}
  })();` };
}
