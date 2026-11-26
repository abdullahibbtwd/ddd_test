import {
  NotificationKind,
  NotificationPriority,
  NotificationRecipientType,
  type NotificationBodyParams,
} from "@ddcrm/shared";

export const NOTIFICATION_ENTITY = {
  CERTIFICATE: "health_certificates",
  AGREEMENT: "agreements",
  FOOD: "food_sampling_schedules",
  INVOICE: "invoices",
} as const;

type Sql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Array<{ id: string }>>;

export type NotificationInsert = {
  id: string;
  recipientUserId: string | null;
  recipientClientId: string | null;
  recipientType: (typeof NotificationRecipientType)[keyof typeof NotificationRecipientType];
  kind: (typeof NotificationKind)[keyof typeof NotificationKind];
  entityType: string;
  entityId: string;
  thresholdDay: number;
  priority: (typeof NotificationPriority)[keyof typeof NotificationPriority];
  titleI18nKey: string;
  bodyI18nKey: string;
  bodyParams: NotificationBodyParams;
};

/**
 * INSERT … ON CONFLICT DO NOTHING against the partial unique index.
 * Returns the new id, or null when the tuple already exists.
 * The conflict target matches the partial index (PostgreSQL 15+).
 */
export async function insertNotificationIgnoreDuplicate(
  queryRaw: Sql,
  row: NotificationInsert,
): Promise<string | null> {
  const params = JSON.stringify(row.bodyParams);
  if (row.recipientType === NotificationRecipientType.SYSTEM_USER) {
    const inserted = await queryRaw`
      INSERT INTO notifications (
        id, recipient_user_id, recipient_client_id, recipient_type,
        kind, entity_type, entity_id, threshold_day, priority,
        title_i18n_key, body_i18n_key, body_params
      ) VALUES (
        ${row.id}::uuid,
        ${row.recipientUserId}::uuid,
        NULL,
        ${row.recipientType}::"NotificationRecipientType",
        ${row.kind}::"NotificationKind",
        ${row.entityType},
        ${row.entityId}::uuid,
        ${row.thresholdDay},
        ${row.priority}::"NotificationPriority",
        ${row.titleI18nKey},
        ${row.bodyI18nKey},
        ${params}::jsonb
      )
      ON CONFLICT (recipient_user_id, kind, entity_type, entity_id, threshold_day)
        WHERE recipient_user_id IS NOT NULL
      DO NOTHING
      RETURNING id::text AS id
    `;
    return inserted[0]?.id ?? null;
  }

  const inserted = await queryRaw`
    INSERT INTO notifications (
      id, recipient_user_id, recipient_client_id, recipient_type,
      kind, entity_type, entity_id, threshold_day, priority,
      title_i18n_key, body_i18n_key, body_params
    ) VALUES (
      ${row.id}::uuid,
      NULL,
      ${row.recipientClientId}::uuid,
      ${row.recipientType}::"NotificationRecipientType",
      ${row.kind}::"NotificationKind",
      ${row.entityType},
      ${row.entityId}::uuid,
      ${row.thresholdDay},
      ${row.priority}::"NotificationPriority",
      ${row.titleI18nKey},
      ${row.bodyI18nKey},
      ${params}::jsonb
    )
    ON CONFLICT (recipient_client_id, kind, entity_type, entity_id, threshold_day)
      WHERE recipient_client_id IS NOT NULL
    DO NOTHING
    RETURNING id::text AS id
  `;
  return inserted[0]?.id ?? null;
}
