// Read-only diagnosis of fixed public endpoints. Never prints headers, body or secrets.
for (const [name, endpoint] of [
  ["profile", "https://api.fxtwitter.com/2/profile/thsottiaux"],
  ["timeline", "https://api.fxtwitter.com/2/profile/id:1953337039510003712/statuses?count=100&with_replies=1"],
]) {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(20_000), redirect: "error",
      headers: { Accept: "application/json", "User-Agent": "codex-reset-signal/1.1" } });
    let body; try { body = await response.json(); } catch { body = {}; }
    console.log(JSON.stringify({ endpoint: name, http: response.status, code: body.code ?? null,
      stale: body.stale ?? null, results: Array.isArray(body.results) ? body.results.length : null }));
  } catch { console.log(JSON.stringify({ endpoint: name, transport: "failed-or-timeout" })); }
}
