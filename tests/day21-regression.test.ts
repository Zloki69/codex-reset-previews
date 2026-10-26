import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { extractEvents } from "../src/events";
import { selectNotificationEvents } from "../src/notification-policy";
import { runMonitor } from "../src/monitor";
import { emptyState, writeState } from "../src/state";
import day21 from "../fixtures/day21-reset-preview.json";

const collectedAt = new Date("2026-10-26T05:22:06.797Z");
const config = loadConfig({ NOTIFY_MODE: "previews", INCLUDE_MENTIONS: "false" });
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Day 21 missed-preview regression", () => {
  it("notifies the real post at the recorded collection time without claiming completion", () => {
    const events = extractEvents(day21[0], config.sourceTimezone);
    const selected = selectNotificationEvents(day21[0], events, config, collectedAt);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ type: "reset", status: "scheduled", time: { kind: "date" } });
    expect(selected[0].status).not.toBe("completed");
    expect(selected[0].time.end).toBe("2026-10-26T07:00:00.000Z");
  });

  it.each([
    "Today is a reset.",
    "Tomorrow is a global reset day.",
    "Tonight is another reset.",
    "It's reset day today.",
  ])("recognizes calendar announcements: %s", (text) => {
    expect(selectNotificationEvents({ ...day21[0], text }, extractEvents({ ...day21[0], text }, config.sourceTimezone), config, collectedAt)).toHaveLength(1);
  });

  it.each([
    "Maybe today is a reset?",
    "Tomorrow is not a reset day.",
    "Today was a reset day.",
    "Today is a reset for my password.",
    "Today's reset is already complete.",
  ])("continues to reject speculation, negation and completed resets: %s", (text) => {
    expect(selectNotificationEvents({ ...day21[0], text }, extractEvents({ ...day21[0], text }, config.sourceTimezone), config, collectedAt)).toEqual([]);
  });

  it("replays the actual collection through the durable queue exactly once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "day21-preview-")); dirs.push(dir);
    const runtime = { ...config, statePath: join(dir, "state.json") };
    await writeState(runtime.statePath, { ...emptyState("thsottiaux", "reset"), sinceId: "2114435873857028129" });
    const source = { resolveUserId: vi.fn().mockResolvedValue("1953337039510003712"),
      getPosts: vi.fn().mockResolvedValue({ posts: day21, newestId: day21[0].id }) };
    const send = vi.fn().mockResolvedValue({ status: "accepted", id: "regression-receipt" });
    const deps = { source, targets: [{ id: "wechat", channel: "pushplus", send }], now: () => collectedAt };
    await runMonitor(runtime, deps); await runMonitor(runtime, deps);
    expect(send).toHaveBeenCalledTimes(1);
    const state = JSON.parse(await readFile(runtime.statePath, "utf8"));
    expect(state.outbox).toEqual([]);
    expect(state.matches[0].notificationReceipts.wechat.status).toBe("accepted");
  });

  it("does not replay the old screenshot event as a new preview after its date window", () => {
    expect(selectNotificationEvents(day21[0], extractEvents(day21[0], config.sourceTimezone), config,
      new Date("2026-10-26T07:01:00Z"))).toEqual([]);
  });
});
