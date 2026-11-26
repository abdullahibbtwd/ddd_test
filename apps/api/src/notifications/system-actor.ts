import type { ActorContext } from "../audit/actor-context";

/**
 * Sweep writes are audited as source `system` with a null actor user.
 *
 * A reserved system user row was rejected: `audit_log.actor_user_id` is
 * already nullable and has no FK, and a fake user would show up in the
 * user list and interact with the last-admin rule. The audit screen
 * already renders source `system` as «Система». The label distinguishes
 * this job from other system writes.
 */
export const NOTIFICATION_SYSTEM_LABEL = "system:notification-sweep";

export function notificationSystemActor(requestId?: string | null): ActorContext {
  return {
    source: "system",
    actorUserId: null,
    actorLabel: NOTIFICATION_SYSTEM_LABEL,
    requestId: requestId ?? null,
    ip: null,
  };
}
