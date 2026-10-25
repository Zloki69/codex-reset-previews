import { isExplicitResetPreview, type ResetEvent } from "./events";
import type { AppConfig, XPost } from "./types";

/** Keep detection/dashboard history intact; limit only the notification payload. */
export function selectNotificationEvents(
  post: XPost,
  events: ResetEvent[],
  config: AppConfig,
  now: Date,
): ResetEvent[] {
  if (config.notificationMode !== "previews") return events;
  const publishedAt = post.createdAt ? Date.parse(post.createdAt) : NaN;
  if (!Number.isFinite(publishedAt) || publishedAt > now.getTime() ||
      now.getTime() - publishedAt > config.notificationMaxAgeHours * 3_600_000)
    return [];
  return events.filter((event) => {
    if (!isExplicitResetPreview(event)) return false;
    // A deadline or exact announced time already in the past is not a new preview.
    const deadline = event.time.end ?? event.time.start;
    return !deadline || (Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > now.getTime());
  });
}
