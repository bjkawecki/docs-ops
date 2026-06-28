import { describe, expect, it } from 'vitest';
import {
  LIVE_EVENT_VERSION,
  liveClientEventSchema,
  liveNotifyTargetSchema,
  parseLiveNotifyPayload,
  serializeLiveClientEvent,
} from './liveEventTypes.js';

describe('liveEventTypes', () => {
  it('parses notification unread NOTIFY envelope', () => {
    const userId = 'cmqxvsywu000jeimm25vybdcq';
    const raw = JSON.stringify({
      target: 'user',
      userId,
      event: { v: LIVE_EVENT_VERSION, type: 'notification.unread-changed' },
    });
    const parsed = parseLiveNotifyPayload(raw);
    expect(parsed).toEqual({
      target: 'user',
      userId,
      event: { v: 1, type: 'notification.unread-changed' },
    });
  });

  it('parses maintenance broadcast NOTIFY envelope', () => {
    const raw = JSON.stringify({
      target: 'all',
      event: {
        v: LIVE_EVENT_VERSION,
        type: 'maintenance.status-changed',
        payload: { active: true, reason: 'backup' },
      },
    });
    const parsed = parseLiveNotifyPayload(raw);
    expect(parsed?.target).toBe('all');
    expect(liveNotifyTargetSchema.safeParse(parsed).success).toBe(true);
  });

  it('rejects invalid NOTIFY payload', () => {
    expect(parseLiveNotifyPayload('not-json')).toBeNull();
    expect(parseLiveNotifyPayload(JSON.stringify({ target: 'nope' }))).toBeNull();
  });

  it('serializes client events', () => {
    const event = liveClientEventSchema.parse({
      v: 1,
      type: 'maintenance.status-changed',
      payload: { active: false },
    });
    expect(serializeLiveClientEvent(event)).toBe(
      '{"v":1,"type":"maintenance.status-changed","payload":{"active":false}}'
    );
  });

  it('parses user-targeted NOTIFY envelope with cuid userId', () => {
    const userId = 'cmqxvsywu000jeimm25vybdcq';
    const documentId = 'cmqxvszhw0040eimmotuit0cc';
    const raw = JSON.stringify({
      target: 'user',
      userId,
      event: {
        v: LIVE_EVENT_VERSION,
        type: 'document.draft-presence',
        payload: {
          documentId,
          editors: [{ userId, name: 'admin@example.com' }],
        },
      },
    });
    const parsed = parseLiveNotifyPayload(raw);
    expect(parsed?.target).toBe('user');
    expect(liveNotifyTargetSchema.safeParse(parsed).success).toBe(true);
    if (parsed?.target === 'user') {
      expect(parsed.userId).toBe(userId);
      expect(parsed.event.type).toBe('document.draft-presence');
    }
  });

  it('parses document collaboration NOTIFY envelope', () => {
    const documentId = 'cmqxvszhw0040eimmotuit0cc';
    const userId = 'cmqxvsyvq000ieimm37xsou9t';
    const raw = JSON.stringify({
      target: 'user',
      userId,
      event: {
        v: LIVE_EVENT_VERSION,
        type: 'document.collaboration-changed',
        payload: { documentId },
      },
    });
    const parsed = parseLiveNotifyPayload(raw);
    expect(parsed?.target).toBe('user');
    expect(liveNotifyTargetSchema.safeParse(parsed).success).toBe(true);
    if (parsed?.target === 'user') {
      expect(parsed.event.type).toBe('document.collaboration-changed');
      if (parsed.event.type === 'document.collaboration-changed') {
        expect(parsed.event.payload.documentId).toBe(documentId);
      }
    }
  });
});
