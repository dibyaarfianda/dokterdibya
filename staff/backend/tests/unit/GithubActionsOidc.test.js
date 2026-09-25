const { generateKeyPairSync } = require('crypto');
const jwt = require('jsonwebtoken');

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'dokterdibya-staff-performance';
const REPOSITORY = 'dibyaarfianda/dokterdibya';
const REPOSITORY_ID = '1092976768';
const OWNER_ID = '233383424';
const REF = 'refs/heads/main';
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/staff-performance-budget.yml@${REF}`;
const SUBJECT = `repo:${REPOSITORY}:ref:${REF}`;

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture-key', alg: 'RS256', use: 'sig' };

function token(overrides = {}, signOptions = {}) {
    const claims = {
        repository: REPOSITORY,
        repository_id: REPOSITORY_ID,
        repository_owner_id: OWNER_ID,
        ref: REF,
        ref_type: 'branch',
        workflow_ref: WORKFLOW_REF,
        event_name: 'workflow_dispatch',
        runner_environment: 'github-hosted',
        ...overrides
    };
    return jwt.sign(claims, privateKey, {
        algorithm: 'RS256', keyid: 'fixture-key', issuer: ISSUER,
        audience: AUDIENCE, subject: SUBJECT, expiresIn: '5m', notBefore: -1,
        ...signOptions
    });
}

function verifier(loadJwks = async () => ({ keys: [publicJwk] })) {
    const { createGithubActionsVerifier } = require('../../services/githubActionsOidc');
    return createGithubActionsVerifier({ loadJwks });
}

describe('short-lived GitHub Actions performance identity', () => {
    test('accepts only a signed token from the pinned main-branch performance workflow', async () => {
        const claims = await verifier().verify(token());
        expect(claims.repository_id).toBe(REPOSITORY_ID);
        expect(claims.workflow_ref).toBe(WORKFLOW_REF);
    });

    test.each([
        ['issuer', {}, { issuer: 'https://attacker.example' }],
        ['audience', {}, { audience: 'other-service' }],
        ['repository ID', { repository_id: '999' }, {}],
        ['owner ID', { repository_owner_id: '999' }, {}],
        ['repository name', { repository: 'other/repo' }, {}],
        ['branch', { ref: 'refs/heads/feature' }, {}],
        ['ref type', { ref_type: 'tag' }, {}],
        ['workflow', { workflow_ref: `${REPOSITORY}/.github/workflows/other.yml@${REF}` }, {}],
        ['event', { event_name: 'pull_request' }, {}],
        ['runner', { runner_environment: 'self-hosted' }, {}]
    ])('rejects a signed token with wrong %s', async (_label, claims, options) => {
        await expect(verifier().verify(token(claims, options))).rejects.toThrow('CI_AUTH_INVALID');
    });

    test('rejects expired, overlong, unsigned, and wrong-key tokens', async () => {
        await expect(verifier().verify(token({}, { expiresIn: -60 }))).rejects.toThrow('CI_AUTH_INVALID');
        await expect(verifier().verify(token({}, { expiresIn: '1h' }))).rejects.toThrow('CI_AUTH_INVALID');
        await expect(verifier().verify(jwt.sign({ repository_id: REPOSITORY_ID }, 'not-an-rsa-key')))
            .rejects.toThrow('CI_AUTH_INVALID');
        await expect(verifier(async () => ({ keys: [{ ...publicJwk, kid: 'another-key' }] })).verify(token()))
            .rejects.toThrow('CI_AUTH_INVALID');
    });

    test('rejects unavailable JWKS and never accepts an unverified token', async () => {
        const loadJwks = jest.fn(async () => { throw new Error('upstream unavailable'); });
        await expect(verifier(loadJwks).verify(token())).rejects.toThrow('CI_AUTH_INVALID');
        expect(loadJwks).toHaveBeenCalledTimes(1);
    });

    test('accepts the immutable GitHub subject only when both IDs match', async () => {
        const immutable = `repo:dibyaarfianda@${OWNER_ID}/dokterdibya@${REPOSITORY_ID}:ref:${REF}`;
        expect((await verifier().verify(token({}, { subject: immutable }))).sub).toBe(immutable);
        await expect(verifier().verify(token({}, { subject: `repo:dibyaarfianda@${OWNER_ID}/dokterdibya@999:ref:${REF}` })))
            .rejects.toThrow('CI_AUTH_INVALID');
    });
});
