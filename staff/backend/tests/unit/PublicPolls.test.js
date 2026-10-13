'use strict';

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const { _internal } = require('../../routes/public-polls');
const PublicPollClassifier = require('../../services/PublicPollClassifier');

describe('public polls', () => {
    test('dedupe key uses IP unless the poll allows one answer per device', () => {
        const token = 'a'.repeat(32);
        expect(_internal.buildDedupeKey({ one_per_ip: 1 }, '1.2.3.4', token)).toBe('ip:1.2.3.4');
        expect(_internal.buildDedupeKey({ one_per_ip: 0 }, '1.2.3.4', token)).toBe(`dev:${token}`);
        // malformed device tokens fall back to IP
        expect(_internal.buildDedupeKey({ one_per_ip: 0 }, '1.2.3.4', 'x')).toBe('ip:1.2.3.4');
    });

    test('poll payload validation rejects reserved slugs and option polls without options', () => {
        const { errors } = _internal.validatePollPayload({ slug: 'admin', title: 't', question: 'q', answer_type: 'single', options: ['A'] });
        expect(errors).toEqual(expect.arrayContaining([
            expect.stringContaining('Kode link'),
            'Minimal 2 opsi jawaban'
        ]));

        const ok = _internal.validatePollPayload({
            slug: 'Mitos-IUD', title: 't', question: 'q', answer_type: 'multiple',
            options: ['IUD', 'iud', ' Pil '], one_per_ip: false,
            categories: [{ name: 'IUD jalan-jalan' }, { name: '  ' }]
        });
        expect(ok.errors).toEqual([]);
        expect(ok.values.slug).toBe('mitos-iud');
        expect(JSON.parse(ok.values.options_json)).toEqual(['IUD', 'Pil']);
        expect(ok.values.one_per_ip).toBe(0);
        expect(ok.categories).toHaveLength(1);
    });

    test('classifier constrains output to known category ids and drops unknown ids', async () => {
        const create = jest.fn().mockResolvedValue({
            model: 'claude-opus-5-5',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify({ category_ids: ['7', '99'], confidence: 'tinggi', reason: 'pindah tempat' }) }]
        });
        PublicPollClassifier._setClientForTests({ beta: { messages: { create } } });
        process.env.ANTHROPIC_API_KEY = 'test-key';

        const result = await PublicPollClassifier.classifyAnswer({
            poll: { question: 'Kenapa takut IUD?' },
            categories: [{ id: 7, name: 'IUD jalan-jalan' }, { id: 8, name: 'IUD bikin mandul' }],
            answerText: 'takut spiral pindah ke perut'
        });

        expect(result.categoryIds).toEqual([7]);
        const request = create.mock.calls[0][0];
        expect(request.output_config.format.schema.properties.category_ids.items.enum).toEqual(['7', '8']);
        expect(request.messages[0].content).toContain('<jawaban>');
        delete process.env.ANTHROPIC_API_KEY;
    });

    test('classifier reports refusals as errors', async () => {
        PublicPollClassifier._setClientForTests({ beta: { messages: { create: jest.fn().mockResolvedValue({
            stop_reason: 'refusal', stop_details: { category: 'bio' }, content: []
        }) } } });
        process.env.ANTHROPIC_API_KEY = 'test-key';
        await expect(PublicPollClassifier.classifyAnswer({
            poll: { question: 'q' }, categories: [{ id: 1, name: 'x' }], answerText: 'y'
        })).rejects.toMatchObject({ code: 'AI_REFUSAL' });
        delete process.env.ANTHROPIC_API_KEY;
    });
});
