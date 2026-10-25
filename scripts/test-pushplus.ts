import { loadConfig, validateConfig } from "../src/config";
import { createTargets } from "../src/notifications";

// Explicit manual command only. Never runs as part of tests or the scheduled monitor.
const config = loadConfig({ PUSHPLUS_TOKEN: process.env.PUSHPLUS_TOKEN, NOTIFY_MODE: "previews" });
if (!config.pushplusToken) throw new Error("PUSHPLUS_TOKEN is required for the connection test.");
const errors = validateConfig(config);
if (errors.length) throw new Error(errors.join("\n"));
const target = createTargets(config).find((candidate) => candidate.channel === "pushplus")!;
try {
  const receipt = await target.send({
    test: true,
    key: `connection-test:${Date.now()}`,
    post: { id: "0", text: "连接测试：确认你能在微信收到 Codex 预告提醒。这不是 Tibo 的真实预告。",
      createdAt: new Date().toISOString(), url: "https://x.com/thsottiaux", media: [] },
    events: [], targets: [target.id], delivered: [],
  });
  console.log(JSON.stringify({ provider: "pushplus", status: receipt?.status,
    message: "PushPlus accepted the test. Confirm receipt in WeChat; acceptance does not prove phone delivery." }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "PushPlus connection test failed");
  process.exitCode = 1;
}
