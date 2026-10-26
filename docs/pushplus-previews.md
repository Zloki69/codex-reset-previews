# Tibo 预告 → PushPlus 微信

本地适配基于 [AllenXiao95/codex-reset-signal](https://github.com/AllenXiao95/codex-reset-signal)，保留上游和原作者的 MIT 许可。上游基线：`ed339d044d439de6920fb0f983416796edad2d08`。

## 采用的流程

GitHub Actions 每约 5 分钟运行上游监控程序，经免费 FxEmbed 接口读取 `@thsottiaux` 的公开帖子与回复，再进入上游队列和去重状态。PushPlus Token 仅存 GitHub Actions Secret `PUSHPLUS_TOKEN`。运行状态继续使用独立 `monitor-state` 分支。

本适配的默认 workflow 设置为 `NOTIFY_MODE=previews`、`INCLUDE_MENTIONS=false`、`BOOTSTRAP_NOTIFY=false`，首次只建立基线，不补发历史通知。类型为 reset 或 bank_credit 且有明确未来承诺的帖子才有资格通知；排除完成、弱暗示、请求及否定。原帖只通知一次；内容编辑不会重复通知。

明确安排也包括“Today is a reset / It's reset day today”这类日程公告，无需出现 will。2026-10-26 的 Day 21 原帖已保存为回归样例，按实际采集时刻回放验证入队、受理与去重；修复不回退线上游标，不补发这条旧预告。日期型时间窗从原文时区的零点起算，不继承发帖分钟和秒。

已过预告时刻、超过 24 小时才发现、缺发帖时间或已知存在后续同类完成公告的预告会跳过；失败队列投递前再次检查。调整 `NOTIFICATION_MAX_AGE_HOURS` 可改变新鲜度窗口。

## 云端接通

1. 使用自己的 fork，先设置仓库 Actions Variable `MONITOR_ENABLED=false`。
2. 确认 `monitor-state` 分支存在且状态属于 `thsottiaux`。初次部署应是空基线，不沿用他人的游标。
3. 在本机运行 `scripts/set-pushplus-secret.ps1 -Repository owner/repo -SendTest`，隐藏输入 Token，脚本经标准输入调用 `gh secret set`，不写入文件或命令参数。
4. 查看手动的 `Test PushPlus connection` workflow，确认手机收到标为“连接测试”的消息。该命令不读取／改动运行状态。
5. 手动运行 `Monitor X for reset` 建立静默基线，检查采集结果和持久化步骤。
6. 确认实收后将 `MONITOR_ENABLED=true`，启用后续预告定时检查。停用时设为 false。

无需部署上游仪表盘，也不需要接入 Cloudflare。GitHub schedule 可能延迟，不能保证严格五分钟到账；需要更稳定的时钟时可复用上游 Cloudflare scheduler，但执行端仍为 Actions。

2026-10-26 日志中观察到约两小时的原生 schedule 间隔；这不是每五分钟实际运行的验收结果。该日 Day 21 漏报本身由分类造成：原帖 13:21:22 发布，13:22:06 已被采集，旧解析却将其当普通提及过滤，没有发送请求。调度问题需另外接入外部时钟解决，不能靠放宽分类规则解决。

## 投递结果与限制

PushPlus 通过 HTTPS 调用，使用 txt 模板并检查业务 code 与微信消息流水号。成功只记为 `accepted`，流水号保留在原 MatchRecord 的 `notificationReceipts`，不声称手机已读或已到达。PushPlus 的 200 响应只是异步受理。若已有 HTTPS 结果接收服务，可配置 Secret `PUSHPLUS_CALLBACK_URL`，适配器会传给 PushPlus；本方案不另建回调服务器，未配置时以 PushPlus 后台及手机实收核验最终状态。

PushPlus 业务拒绝保留待发项，下轮重试，每个预告目标最多尝试 3 次，避免错误配置耗尽额度。上游队列存在“供应商受理成功但状态保存失败”时重复的窗口，不能保证严格 exactly-once。HTTP 超时后实际结果也可能不确定。

沿用上游单帖解析：仅在回复中写“By midnight”而未出现 reset、需跨帖关联才知所指的内容可能漏报。第三方时间线也可能遗漏／延迟；不以轮询成功证明 X 内容完整。

## 本地验证

`npm test`、`npm run typecheck`；自动测试使用假响应，不发送微信。只读源联调成功取得目标用户和 20 条帖子；不以零个当前有效预告证明没有公告。微信实收、GitHub 云端采集和定时运行分别验收。
