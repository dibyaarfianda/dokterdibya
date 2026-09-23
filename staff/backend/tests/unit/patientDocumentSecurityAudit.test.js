const { buildAuditReport } = require('../../scripts/audit-patient-document-security');

describe('patient document security audit', () => {
    test('returns aggregate share and access evidence without identifiers or share secrets', async () => {
        const auditDb = {
            query: jest.fn()
                .mockResolvedValueOnce([[{
                    total_shares: 12,
                    active_unexpired_shares: 3,
                    expired_not_closed: 2,
                    missing_actor_shares: 1,
                    patient_actor_shares: 4,
                    unknown_actor_shares: 2
                }]])
                .mockResolvedValueOnce([[
                    { channel: 'link', status: 'pending', share_count: 5 },
                    { channel: 'whatsapp', status: 'opened', share_count: 7 }
                ]])
                .mockResolvedValueOnce([[
                    { action: 'view', event_count: 20, document_count: 8, first_seen_at: '2026-09-01', last_seen_at: '2026-09-23' }
                ]])
        };

        const report = await buildAuditReport(auditDb, new Date('2026-09-23T10:00:00.000Z'));

        expect(report).toEqual({
            as_of: '2026-09-23T10:00:00.000Z',
            shares: {
                total: 12,
                active_unexpired: 3,
                expired_not_closed: 2,
                missing_actor: 1,
                patient_actor: 4,
                unknown_actor: 2,
                by_channel_status: [
                    { channel: 'link', status: 'pending', count: 5 },
                    { channel: 'whatsapp', status: 'opened', count: 7 }
                ]
            },
            access_last_90_days: [
                { action: 'view', events: 20, documents: 8, first_seen_at: '2026-09-01', last_seen_at: '2026-09-23' }
            ],
            requires_quarantine_review: true
        });

        const serialized = JSON.stringify(report);
        expect(serialized).not.toMatch(/share_token|patient_id|document_id|recipient_phone|file_(?:path|url)/i);
    });
});
