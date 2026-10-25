import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, validateConfig } from "../src/config";
import { extractEvents } from "../src/events";
import { selectNotificationEvents } from "../src/notification-policy";
import { runMonitor } from "../src/monitor";
import { emptyState, writeState } from "../src/state";
import type { XPost } from "../src/types";

const now = new Date("2026-10-25T10:00:00Z");
const post = (text: string, id = "2"): XPost => ({
  id, text, createdAt: "2026-10-25T09:00:00Z",
  url: `https://x.com/thsottiaux/status/${id}`, media: [],
});
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("preview notification policy", () => {
  const config = loadConfig({ NOTIFY_MODE: "previews" });
  const selected = (p: XPost) => selectNotificationEvents(p, extractEvents(p, config.sourceTimezone), config, now);
  it("includes explicit timed and untimed future promises", () => {
    expect(selected(post("We will reset Codex usage in three hours."))[0]?.status).toBe("scheduled");
    expect(selected(post("We will reset Codex usage limits."))[0]?.status).toBe("announced");
    expect(selected(post("We will grant a banked reset tomorrow."))[0]?.type).toBe("bank_credit");
  });
  it.each([
    "We have reset Codex usage limits.",
    "Codex limits are now reset.",
    "Maybe we could reset Codex tomorrow?",
    "We will not reset Codex usage.",
    "I will reset my router tomorrow.",
    "We added a banked reset credit.",
    "Codex got faster today.",
  ])("does not notify completed, speculative or unrelated content: %s", (text) => {
    expect(selected(post(text))).toEqual([]);
  });
  it("drops passed deadlines, old backfills and missing timestamps", () => {
    expect(selected(post("Codex will reset in 30 minutes."))).toEqual([]);
    expect(selected({ ...post("We will reset Codex usage limits."), createdAt: "2026-10-23T09:00:00Z" })).toEqual([]);
    expect(selected({ ...post("We will reset Codex usage limits."), createdAt: null })).toEqual([]);
  });
  it("validates the selected policy and allows a PushPlus-only setup", () => {
    expect(validateConfig(loadConfig({ NOTIFY_MODE: "previews", PUSHPLUS_TOKEN: "test-token" }))).toEqual([]);
    expect(validateConfig(loadConfig({ NOTIFY_MODE: "typo" }), { offline: true })).toContain("NOTIFY_MODE must be all or previews.");
    expect(validateConfig(loadConfig({ NOTIFICATION_MAX_AGE_HOURS: "0" }), { offline: true })).toContain("NOTIFICATION_MAX_AGE_HOURS must be a positive number.");
  });
});

async function setup(bootstrap = false) {
  const dir = await mkdtemp(join(tmpdir(), "reset-previews-")); dirs.push(dir);
  const config = loadConfig({ NOTIFY_MODE: "previews", STATE_PATH: join(dir, "state.json") });
  if (!bootstrap) await writeState(config.statePath, { ...emptyState("thsottiaux", "reset"), sinceId: "1" });
  const source = { resolveUserId: vi.fn().mockResolvedValue("42"), getPosts: vi.fn() };
  return { config, source };
}

describe("preview delivery integration", () => {
  it("keeps completed detection while notifying a preview once across restarts and edits", async () => {
    const { config, source } = await setup();
    source.getPosts.mockResolvedValue({ posts: [post("We will reset Codex in three hours."), { ...post("We have reset Codex usage.", "3"), createdAt: "2026-10-25T08:00:00Z" }], newestId: "3" });
    const send = vi.fn().mockResolvedValue({ status: "accepted", id: "receipt123" });
    const deps = { source, targets: [{ id: "phone", channel: "pushplus", send }], now: () => now };
    const first = await runMonitor(config, deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(first.matches).toHaveLength(2);
    source.getPosts.mockResolvedValue({ posts: [post("We will reset Codex in four hours.")], newestId: "3" });
    const second = await runMonitor(config, deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(second.matches.find((m) => m.text.includes("three hours"))?.notificationReceipts?.phone).toEqual({ status: "accepted", id: "receipt123" });
  });
  it("bootstraps silently and retries only a pending preview on later runs", async () => {
    const { config, source } = await setup(true);
    const send = vi.fn().mockRejectedValueOnce(new Error("temporary"));
    const deps = { source, targets: [{ id: "phone", channel: "pushplus", send }], now: () => now };
    source.getPosts.mockResolvedValue({ posts: [post("We will reset Codex in three hours.")], newestId: "2" });
    await runMonitor(config, deps); expect(send).not.toHaveBeenCalled();
    source.getPosts.mockResolvedValue({ posts: [post("We will reset Codex in four hours.", "3")], newestId: "3" });
    await expect(runMonitor(config, deps)).rejects.toThrow("will retry");
    source.getPosts.mockResolvedValue({ posts: [], newestId: null });
    const state = await runMonitor(config, deps);
    expect(send).toHaveBeenCalledTimes(2); expect(state.outbox).toEqual([]);
  });
  it("does not send an expired preview left in an old queue", async () => {
    const { config, source } = await setup();
    source.getPosts.mockResolvedValue({ posts: [post("We will reset Codex in three hours.")], newestId: "2" });
    const send = vi.fn().mockRejectedValue(new Error("temporary"));
    const deps = { source, targets: [{ id: "phone", channel: "pushplus", send }], now: () => now };
    await expect(runMonitor(config, deps)).rejects.toThrow();
    source.getPosts.mockResolvedValue({ posts: [], newestId: null });
    await runMonitor(config, { ...deps, now: () => new Date("2026-10-25T13:00:00Z") });
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(config.statePath, "utf8")).outbox).toEqual([]);
  });
  it("suppresses a delayed preview when a later completion is already known", async () => {
    const { config, source } = await setup();
    source.getPosts.mockResolvedValue({ posts: [post("We will reset Codex in three hours."),
      { ...post("We have reset Codex usage.", "3"), createdAt: "2026-10-25T09:30:00Z" }], newestId: "3" });
    const send = vi.fn();
    await runMonitor(config, { source, targets: [{ id: "phone", channel: "pushplus", send }], now: () => now });
    expect(send).not.toHaveBeenCalled();
  });
  it("bounds PushPlus retries so a configuration failure cannot drain the daily quota", async () => {
    const { config, source } = await setup();
    source.getPosts.mockResolvedValue({ posts: [post("We will reset Codex in three hours.")], newestId: "2" });
    const send = vi.fn().mockRejectedValue(new Error("configuration rejected"));
    const deps = { source, targets: [{ id: "phone", channel: "pushplus", send }], now: () => now };
    for (let i = 0; i < 3; i++) await expect(runMonitor(config, deps)).rejects.toThrow("will retry");
    await expect(runMonitor(config, deps)).rejects.toThrow("retry limit");
    expect(send).toHaveBeenCalledTimes(3);
  });
});
