import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openBrowser, mockBackend } from "./browser.mjs";

let browser;
before(async () => { browser = await openBrowser(); });
after(async () => { if (browser) await browser.close(); });

async function loginPage(options) {
  const page = await browser.page(mockBackend(options));
  await page.go("/");
  await page.wait("document.querySelector('#username') && !document.querySelector('#username').disabled");
  return page;
}

async function dashboard(options = {}) {
  const page = await browser.page(mockBackend({ authenticated: true, ...options }));
  await page.go("/dashboard");
  await page.wait("document.body.innerText.includes('Test Admin')");
  return page;
}

test("login uses one centered dark card without public registration", { timeout: 30000 }, async () => {
  const page = await loginPage();
  try {
    assert.equal(await page.evaluate("document.querySelector('h1').textContent"), "Welcome back");
    assert.equal(await page.evaluate("getComputedStyle(document.documentElement).colorScheme"), "dark");
    assert.equal(await page.evaluate("document.body.innerText.includes('Create account') || document.body.innerText.includes('Create Account')"), false);
    assert.equal(await page.evaluate("document.querySelectorAll('form').length"), 1);
    const bounds = await page.evaluate("({form:document.querySelector('form').getBoundingClientRect().toJSON(),width:document.documentElement.clientWidth})");
    assert.ok(Math.abs(bounds.form.x + bounds.form.width / 2 - bounds.width / 2) < 4);
  } finally { await page.close(); }
});

test("wrong credentials show a friendly message below the fields, never a server code", { timeout: 30000 }, async () => {
  const page = await loginPage({ loginStatus: 401 });
  try {
    await page.fill("#username", "wrong-account");
    await page.fill("#password", "wrong-password");
    await page.click("button[type=submit]");
    await page.wait("document.querySelector('[role=alert]')");
    assert.equal(await page.evaluate("document.querySelector('[role=alert]').textContent.trim()"), "Wrong username or password.");
    assert.equal(await page.evaluate("document.body.innerText.includes('401') || document.body.innerText.includes('UnauthorizedException')"), false);
    assert.ok(await page.evaluate("document.querySelector('[role=alert]').getBoundingClientRect().y > document.querySelector('#password').getBoundingClientRect().y"));
    assert.equal(await page.evaluate("document.querySelector('#username').value"), "wrong-account");
  } finally { await page.close(); }
});

test("login toggles password visibility without clearing the password", { timeout: 30000 }, async () => {
  const page = await loginPage();
  try {
    await page.fill("#password", "sample-password");
    assert.equal(await page.evaluate("Boolean(document.querySelector('[aria-label=\"Show password\"]'))"), true);
    await page.click('[aria-label="Show password"]');
    assert.equal(await page.evaluate("document.querySelector('#password').type"), "text");
    await page.click('[aria-label="Hide password"]');
    assert.equal(await page.evaluate("document.querySelector('#password').type"), "password");
    assert.equal(await page.evaluate("document.querySelector('#password').value"), "sample-password");
  } finally { await page.close(); }
});

test("sign-out asks for confirmation, supports Cancel and Escape, and restores focus", { timeout: 30000 }, async () => {
  const page = await dashboard();
  try {
    assert.equal(await page.evaluate("Boolean(document.querySelector('[aria-label=\"Sign out\"]'))"), true);
    await page.click('[aria-label="Sign out"]');
    await page.wait("document.querySelector('dialog[open]')");
    assert.ok(await page.evaluate("document.querySelector('dialog').textContent.includes('Sign out of your workspace?')"));
    assert.equal(page.requests.some(r => r.path === '/auth/logout'), false);
    await page.click("dialog [data-cancel]");
    await page.wait("!document.querySelector('dialog[open]')");
    assert.equal(await page.evaluate("document.activeElement.getAttribute('aria-label')"), "Sign out");
    await page.click('[aria-label="Sign out"]');
    await page.key("Escape");
    await page.wait("!document.querySelector('dialog[open]')");
    assert.equal(await page.evaluate("location.pathname"), "/dashboard");
    await page.click('[aria-label="Sign out"]');
    await page.click("dialog [data-confirm]");
    await page.wait("location.pathname === '/' && document.querySelector('#username')");
    assert.equal(await page.evaluate("localStorage.getItem('admin-session')"), null);
    assert.equal(page.requests.filter(r => r.path === '/auth/logout').length, 1);
  } finally { await page.close(); }
});

test("styled modals retain Users CRUD endpoint wiring and keyboard containment", { timeout: 30000 }, async () => {
  const page = await dashboard();
  try {
    await page.click('[aria-label="Read user Test Admin"]');
    await page.wait("document.querySelector('dialog[open]')?.innerText.includes('admin@example.test')");
    assert.ok(page.requests.some(r => r.path === '/users/1' && r.method === 'GET'));
    await page.key("Escape");
    await page.click('[data-create-user]');
    await page.wait("document.querySelector('dialog[open]') && document.activeElement.id === 'create-username'");
    for (let count = 0; count < 10; count++) await page.key("Tab");
    assert.equal(await page.evaluate("Boolean(document.activeElement.closest('dialog'))"), true);
    await page.fill("#create-username", "New Caretaker");
    await page.fill("#create-email", "new@example.test");
    await page.fill("#create-password", "sample-password");
    await page.click("dialog button[type=submit]");
    await page.wait("!document.querySelector('dialog[open]') && document.body.innerText.includes('New Caretaker')");
    const created = page.requests.find(r => r.path === '/auth/register');
    assert.equal(created.method, "POST");
    assert.equal(created.body.username, "New Caretaker");
    await page.click('[aria-label="Update user New Caretaker"]');
    await page.fill("#edit-username", "Updated Caretaker");
    await page.fill("#edit-role", "staff");
    await page.click("dialog button[type=submit]");
    await page.wait("!document.querySelector('dialog[open]') && document.body.innerText.includes('Updated Caretaker')");
    assert.ok(page.requests.some(r => r.path === '/users/4' && r.method === 'PUT' && r.body.username === 'Updated Caretaker' && !('password' in r.body)));
    assert.ok(page.requests.some(r => r.path === '/users/4/role' && r.method === 'PUT' && r.body.role === 'staff'));
    await page.click('[aria-label="Delete user Updated Caretaker"]');
    await page.wait("!document.body.innerText.includes('Updated Caretaker')");
    assert.ok(page.requests.some(r => r.path === '/users/4' && r.method === 'DELETE'));
  } finally { await page.close(); }
});

test("login, dashboard, and modal fit six viewport widths and honor reduced motion", { timeout: 60000 }, async () => {
  const login = await loginPage();
  const admin = await dashboard();
  const screenshots = join(process.env.LOCALAPPDATA, "Temp", "opencode", "admin-redesign");
  await mkdir(screenshots, { recursive: true });
  try {
    for (const width of [320, 375, 425, 768, 1024, 1440]) {
      for (const page of [login, admin]) {
        await page.viewport(width);
        assert.ok(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), `Page overflow at ${width}px`);
      }
      await admin.click('[data-create-user]');
      await admin.wait("document.querySelector('dialog[open]')");
      assert.ok(await admin.evaluate("{ const r = document.querySelector('dialog').getBoundingClientRect(); r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }"), `Modal overflow at ${width}px`);
      await admin.key("Escape");
      if ([375, 1440].includes(width)) {
        for (const [name, page] of [["login", login], ["dashboard", admin]]) {
          const { data } = await page.send("Page.captureScreenshot", { format: "png" });
          await writeFile(join(screenshots, `${name}-${width}.png`), Buffer.from(data, "base64"));
        }
      }
    }
    await login.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    assert.equal(await login.evaluate("getComputedStyle(document.querySelector('form')).animationName"), "none");
  } finally { await login.close(); await admin.close(); }
});

test("initial data load shows skeletons, then an honest empty state", { timeout: 30000 }, async () => {
  const page = await browser.page(mockBackend({ authenticated: true, deferred: true }));
  try {
    await page.go("/dashboard");
    await page.wait("document.querySelectorAll('.skeleton').length > 0");
    assert.ok(await page.evaluate("document.querySelectorAll('.skeleton').length > 0"));
    page.setUsers([]);
    page.releaseUsers();
    await page.wait("document.body.innerText.includes('No users yet')");
    assert.equal(await page.evaluate("document.querySelectorAll('.skeleton').length"), 0);
  } finally { await page.close(); }
});

test("summary labels and role badges fit without overlapping or breaking words", { timeout: 30000 }, async () => {
  const page = await dashboard();
  try {
    for (const width of [320, 375, 425, 768, 1024, 1440]) {
      await page.viewport(width);
      assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('.summary-copy > p')).every(label => {
        const range = document.createRange(); range.selectNodeContents(label);
        return range.getBoundingClientRect().right <= label.closest('.summary-card').getBoundingClientRect().right - 8;
      })`), true, `Summary label overlap at ${width}px`);
      assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('.role-badge')).filter(badge => badge.getClientRects().length).every(badge => {
        const range = document.createRange(); range.selectNodeContents(badge);
        return range.getClientRects().length === 1;
      })`), true, `Role badge breaks across lines at ${width}px`);
    }
  } finally { await page.close(); }
});

test("permission failures display readable feedback rather than backend diagnostics", { timeout: 30000 }, async () => {
  const page = await browser.page(mockBackend({ authenticated: true, usersStatus: 403 }));
  try {
    await page.go("/dashboard");
    await page.wait("document.querySelector('[role=alert]')");
    const message = await page.evaluate("document.querySelector('[role=alert]').textContent");
    assert.ok(message.includes("permission"));
    assert.doesNotMatch(message, /403|UnauthorizedException/);
    assert.equal(await page.evaluate("document.querySelectorAll('.skeleton').length"), 0);
  } finally { await page.close(); }
});
