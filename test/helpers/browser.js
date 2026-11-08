import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";

export const browserPath = [process.env.BROWSER_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].find((path) => path && existsSync(path));

export async function openBrowser() {
  const root = process.platform === "win32" ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : tmpdir();
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(join(root, "barroga-browser-"));
  const child = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let startupLog = "";
    let started = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error("Browser did not start within 15 seconds: " + startupLog)); }, 15000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { if (!started) { clearTimeout(timer); reject(new Error(`Browser exits during startup (${code}): ${startupLog}`)); } });
    child.stderr.on("data", (chunk) => {
      startupLog = (startupLog + String(chunk)).slice(-3000);
      const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { started = true; clearTimeout(timer); resolve(match[1]); }
    });
  });
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  let sessionId;
  const pending = new Map();
  const errors = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  });
  function send(method, params = {}, session = sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId: session }));
    });
  }
  const target = await send("Target.createTarget", { url: "about:blank" });
  const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  await send("Runtime.enable");
  await send("Page.enable");
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  return {
    send, evaluate, errors,
    async wait(expression) {
      return evaluate(`new Promise((resolve, reject) => {
        const check = () => { if (${expression}) { observer.disconnect(); clearTimeout(timer); resolve(true); } };
        const observer = new MutationObserver(check);
        const timer = setTimeout(() => { observer.disconnect(); reject(new Error(${JSON.stringify("Condition not met: " + expression)})); }, 7000);
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        check();
      })`);
    },
    click(selector) { return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); },
    fill(selector, value) { return evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); })()`); },
    async close() {
      const exited = once(child, "exit");
      await send("Browser.close", {}, undefined);
      socket.close();
      await exited;
      await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
    },
  };
}
