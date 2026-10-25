import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config";
import { createTargets } from "../src/notifications";

const item = {
  key: "preview:123", post: { id: "123", text: "We will reset Codex usage limits.",
    createdAt: "2026-10-25T09:00:00Z", url: "https://x.com/thsottiaux/status/123", media: [] },
  events: [], targets: [], delivered: [],
};
describe("PushPlus WeChat transport", () => {
  const config = loadConfig({ PUSHPLUS_TOKEN: "private-token", NOTIFY_MODE: "previews" });
  it.each([
    "receipt123",
    { shortCode: "receipt123" },
    [{ code: 200, channel: "wechat", shortCode: "receipt123" }],
  ])("records acceptance without claiming phone delivery", async (data) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: 200, data }));
    const target = createTargets(config, fetcher)[0];
    expect(await target.send(item)).toEqual({ status: "accepted", id: "receipt123" });
    expect(target.id).not.toContain("private-token");
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://www.pushplus.plus/send");
    expect(JSON.parse(options.body)).toMatchObject({ token: "private-token", channel: "wechat", template: "txt" });
    expect(JSON.parse(options.body).content).toContain(item.post.url);
  });
  it.each([
    { code: 905, msg: "private-token must not be logged" },
    { code: 200, data: [{ code: 500, channel: "wechat", shortCode: "bad" }] },
    { code: 200, data: { code: 500, shortCode: "bad" } },
    { code: 200, data: null },
  ])("rejects HTTP-200 business failures or missing receipts", async (body) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    await expect(createTargets(config, fetcher)[0].send(item)).rejects.toThrow(/PushPlus/);
    try { await createTargets(config, fetcher)[0].send(item); } catch (error) {
      expect(String(error)).not.toContain("private-token");
    }
  });
  it("passes an optional result callback without storing its secret in the target id", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: 200, data: "receipt123" }));
    const target = createTargets({ ...config, pushplusCallbackUrl: "https://example.com/receipt?key=callback-secret" }, fetcher)[0];
    await target.send(item);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).callbackUrl).toContain("callback-secret");
    expect(target.id).not.toContain("callback-secret");
  });
});
