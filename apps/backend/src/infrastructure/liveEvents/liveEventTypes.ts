import { z } from 'zod';

export const LIVE_EVENT_VERSION = 1 as const;

export const publicMaintenanceStatusPayloadSchema = z.object({
  active: z.boolean(),
  reason: z.enum(['backup', 'restore', 'platform-import', 'update']).optional(),
  startedAt: z.iso.datetime().optional(),
});

export type PublicMaintenanceStatusPayload = z.infer<typeof publicMaintenanceStatusPayloadSchema>;

export const documentCollaborationChangedPayloadSchema = z.object({
  documentId: z.cuid(),
  draftRevision: z.number().int().nonnegative().optional(),
  pendingSuggestionCount: z.number().int().nonnegative().optional(),
});

export type DocumentCollaborationChangedPayload = z.infer<
  typeof documentCollaborationChangedPayloadSchema
>;

export const documentDraftPresencePayloadSchema = z.object({
  documentId: z.cuid(),
  editors: z.array(
    z.object({
      userId: z.string().min(1),
      name: z.string(),
    })
  ),
});

export type DocumentDraftPresencePayload = z.infer<typeof documentDraftPresencePayloadSchema>;

export const liveClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(LIVE_EVENT_VERSION),
    type: z.literal('notification.unread-changed'),
  }),
  z.object({
    v: z.literal(LIVE_EVENT_VERSION),
    type: z.literal('maintenance.status-changed'),
    payload: publicMaintenanceStatusPayloadSchema,
  }),
  z.object({
    v: z.literal(LIVE_EVENT_VERSION),
    type: z.literal('document.collaboration-changed'),
    payload: documentCollaborationChangedPayloadSchema,
  }),
  z.object({
    v: z.literal(LIVE_EVENT_VERSION),
    type: z.literal('document.draft-presence'),
    payload: documentDraftPresencePayloadSchema,
  }),
]);

export type LiveClientEvent = z.infer<typeof liveClientEventSchema>;

export const liveNotifyTargetSchema = z.discriminatedUnion('target', [
  z.object({
    target: z.literal('user'),
    userId: z.cuid(),
    event: liveClientEventSchema,
  }),
  z.object({
    target: z.literal('all'),
    event: liveClientEventSchema,
  }),
]);

export type LiveNotifyEnvelope = z.infer<typeof liveNotifyTargetSchema>;

export function serializeLiveClientEvent(event: LiveClientEvent): string {
  return JSON.stringify(event);
}

export function parseLiveNotifyPayload(raw: string): LiveNotifyEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = liveNotifyTargetSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
