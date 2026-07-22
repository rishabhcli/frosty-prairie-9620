/**
 * Records the real product footage for the ContactSafe demo video.
 *
 * Prerequisites (this script does NOT start these for you):
 *   - Local CockroachDB running (`pnpm db:up`, migrated).
 *   - API service running on 127.0.0.1:14901 (`pnpm --filter @contactsafe/api start`).
 *   - Console built and served on 127.0.0.1:14900 (`pnpm --filter @contactsafe/console build && pnpm --filter @contactsafe/console preview`).
 *
 * This script does NOT start the outbox-worker itself for scenes 2-4 (the console's
 * "Process one outbox delivery" button drives those directly). For the crash-recovery
 * scene it spawns and kills the *real* services/outbox-worker process -- an actual
 * SIGKILL, not a simulation -- and captures its real stdout lines with timestamps so
 * Remotion can render them as an on-screen terminal callout synced to the footage.
 *
 * Output:
 *   demo/capture/product-raw.webm -- Playwright's raw video recording
 *   demo/capture/events.json      -- scene markers + real worker log lines, timestamped
 *   demo/screenshots/*.png        -- key-moment screenshots
 */
import { chromium } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CAPTURE_DIR = join(REPO_ROOT, "demo", "capture");
const SCREENSHOTS_DIR = join(REPO_ROOT, "demo", "screenshots");
const CONSOLE_URL = "http://127.0.0.1:14900";
const API_URL = "http://127.0.0.1:14901";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable";

interface TimelineEvent {
  tMs: number;
  kind: "scene" | "worker-log" | "action";
  label: string;
}

const startedAt = Date.now();
const events: TimelineEvent[] = [];
function mark(kind: TimelineEvent["kind"], label: string) {
  const tMs = Date.now() - startedAt;
  events.push({ tMs, kind, label });
  console.log(`[record] +${tMs}ms [${kind}] ${label}`);
}

async function getContactState(contactId: string) {
  const res = await fetch(`${API_URL}/contacts/${contactId}/state`);
  if (!res.ok) throw new Error(`state fetch failed: ${res.status}`);
  return res.json() as Promise<{ outbox: { outbox_id: string; state: string }[] }>;
}

async function waitForOutboxState(
  contactId: string,
  predicate: (rows: { outbox_id: string; state: string }[]) => boolean,
  timeoutMs = 15000
): Promise<{ outbox_id: string; state: string }[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await getContactState(contactId);
    if (predicate(state.outbox)) return state.outbox;
    if (Date.now() > deadline) throw new Error("waitForOutboxState timed out");
    await new Promise((r) => setTimeout(r, 200));
  }
}

const WORKER_ENTRY = join(REPO_ROOT, "services", "outbox-worker", "dist", "worker.js");

function spawnOutboxWorker(demoDelayMs: number): ChildProcessWithoutNullStreams {
  // Run the pre-compiled dist/worker.js directly with plain `node` -- not `pnpm --filter
  // ... start`, and not `tsx` either. Both turned out to be multi-process wrappers: pnpm's
  // run wrapper is a separate parent (killing it left the real worker running underneath),
  // and tsx's own CLI re-spawns a *second* node process with --require/--import loader
  // flags to set up its transform hooks, so killing the process object tsx.spawn() returns
  // killed the wrong PID too -- both discovered because the "restarted" worker kept
  // failing with EADDRINUSE, proving the "killed" one was still alive. `node dist/worker.js`
  // needs no loader, so it's exactly one process, and SIGKILL actually kills it.
  const child = spawn(process.execPath, [WORKER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL,
      PORT_OUTBOX_WORKER: "14903",
      OUTBOX_WORKER_DEMO_DELAY_MS: String(demoDelayMs),
    },
  });
  child.stdout.on("data", (buf: Buffer) => {
    for (const line of buf.toString("utf8").split("\n")) {
      if (line.trim()) mark("worker-log", line.trim());
    }
  });
  child.stderr.on("data", (buf: Buffer) => {
    for (const line of buf.toString("utf8").split("\n")) {
      if (line.trim()) mark("worker-log", `[stderr] ${line.trim()}`);
    }
  });
  return child;
}

async function main() {
  await mkdir(CAPTURE_DIR, { recursive: true });
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: CAPTURE_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  // ---- Scene 2/3: reset + race ----
  mark("scene", "scene-02-race:start");
  await page.goto(CONSOLE_URL);
  await page.getByText(/^11111111-/).waitFor({ timeout: 15000 });
  await page.screenshot({ path: join(SCREENSHOTS_DIR, "01-recall-citations.png") });

  mark("action", "click race two workers");
  await page.getByRole("button", { name: "Race two workers for this contact" }).click();
  await page.getByText(/authorized \(fencing token 1\)/).waitFor({ timeout: 15000 });
  mark("scene", "scene-03-transaction-result");
  await page.screenshot({ path: join(SCREENSHOTS_DIR, "02-transaction-result.png") });

  // ---- Scene 4: revoke consent, then the outbox worker cancels the pending send ----
  mark("scene", "scene-04-revocation:start");
  await page.getByRole("button", { name: "Revoke email consent" }).click();
  await page.getByText("Consent revoked (email)").waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(SCREENSHOTS_DIR, "03-consent-revoked.png") });

  mark("action", "click process one outbox delivery (expect cancellation)");
  await page.getByRole("button", { name: "Process one outbox delivery" }).click();
  await page.getByText("Delivery canceled -- consent no longer granted").waitFor({ timeout: 10000 });
  mark("scene", "scene-04-revocation:canceled");
  await page.screenshot({ path: join(SCREENSHOTS_DIR, "04-delivery-canceled.png") });

  // ---- Scene 5: fresh reset + race, then a real crash + restart of the outbox worker ----
  mark("scene", "scene-05-crash-recovery:start");
  await page.getByRole("button", { name: "Reset demo state" }).click();
  await page.getByText(/^11111111-/).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Race two workers for this contact" }).click();
  await page.getByText(/authorized \(fencing token 1\)/).waitFor({ timeout: 15000 });

  const contactId = "11111111-1111-1111-1111-111111111111";
  const preOutbox = await waitForOutboxState(contactId, (rows) => rows.length === 1);
  const outboxId = preOutbox[0]?.outbox_id;
  if (!outboxId) throw new Error("expected an authorized outbox row before starting the crash-recovery scene");

  mark("action", "spawn real outbox-worker process (with demo post-claim delay)");
  let worker = spawnOutboxWorker(4000);

  await waitForOutboxState(contactId, (rows) => rows.some((r) => r.outbox_id === outboxId && r.state === "claimed"));
  mark("scene", "scene-05-crash-recovery:claimed-before-kill");
  await page.screenshot({ path: join(SCREENSHOTS_DIR, "05-outbox-claimed.png") });

  mark("action", `SIGKILL outbox-worker pid=${worker.pid}`);
  worker.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 1000));

  mark("action", "restart outbox-worker process");
  worker = spawnOutboxWorker(0);

  await waitForOutboxState(contactId, (rows) => rows.some((r) => r.outbox_id === outboxId && r.state === "delivered"));
  mark("scene", "scene-05-crash-recovery:resumed-delivered");
  // The console polls every 3s (App.tsx) rather than reloading -- a reload would re-run
  // the mount effect and reset the demo state we're trying to observe.
  await page.getByText("Sandbox delivery recorded").first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(SCREENSHOTS_DIR, "06-resumed-delivered.png") });

  worker.kill("SIGKILL");

  // ---- Scene 6: evaluation panel ----
  mark("scene", "scene-06-evaluation");
  await page.screenshot({ path: join(SCREENSHOTS_DIR, "07-evaluation.png") });

  const video = page.video();
  await context.close();
  await browser.close();

  const stableVideoPath = join(CAPTURE_DIR, "product-raw.webm");
  if (video) {
    const rawPath = await video.path();
    await rm(stableVideoPath, { force: true });
    await rename(rawPath, stableVideoPath);
  }

  await writeFile(join(CAPTURE_DIR, "events.json"), JSON.stringify(events, null, 2));
  console.log(`[record] wrote ${join(CAPTURE_DIR, "events.json")}`);
  console.log(`[record] video saved to ${stableVideoPath}`);
}

main().catch((err) => {
  console.error("[record] fatal", err);
  process.exit(1);
});
