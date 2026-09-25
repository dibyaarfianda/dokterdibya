const https = require('https');
const { createPublicKey } = require('crypto');
const jwt = require('jsonwebtoken');

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'dokterdibya-staff-performance';
const REPOSITORY = 'dibyaarfianda/dokterdibya';
const REPOSITORY_ID = '1092976768';
const OWNER_ID = '233383424';
const REF = 'refs/heads/main';
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/staff-performance-budget.yml@${REF}`;
const SUBJECTS = new Set([
    `repo:${REPOSITORY}:ref:${REF}`,
    `repo:dibyaarfianda@${OWNER_ID}/dokterdibya@${REPOSITORY_ID}:ref:${REF}`
]);

function fetchGithubJwks() {
    return new Promise((resolve, reject) => {
        const request = https.get(JWKS_URL, { timeout: 5000, headers: { Accept: 'application/json' } }, response => {
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error('CI_AUTH_INVALID'));
                return;
            }
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk;
                if (body.length > 65536) request.destroy(new Error('CI_AUTH_INVALID'));
            });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (_) { reject(new Error('CI_AUTH_INVALID')); }
            });
        });
        request.on('timeout', () => request.destroy(new Error('CI_AUTH_INVALID')));
        request.on('error', reject);
    });
}

function createGithubActionsVerifier({ loadJwks = fetchGithubJwks } = {}) {
    let cachedKeys = null;
    let expiresAt = 0;
    let inFlight = null;

    async function keys() {
        if (cachedKeys && Date.now() < expiresAt) return cachedKeys;
        if (!inFlight) {
            inFlight = Promise.resolve().then(loadJwks).then(jwks => {
                if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length === 0 || jwks.keys.length > 50) {
                    throw new Error('CI_AUTH_INVALID');
                }
                cachedKeys = jwks.keys;
                expiresAt = Date.now() + 5 * 60 * 1000;
                return cachedKeys;
            }).finally(() => { inFlight = null; });
        }
        return inFlight;
    }

    async function verify(token) {
        try {
            if (typeof token !== 'string' || token.length < 100 || token.length > 16000) throw new Error('CI_AUTH_INVALID');
            const decoded = jwt.decode(token, { complete: true });
            const header = decoded?.header;
            if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256) {
                throw new Error('CI_AUTH_INVALID');
            }
            const key = (await keys()).find(candidate => candidate.kid === header.kid
                && candidate.kty === 'RSA' && candidate.use === 'sig'
                && (!candidate.alg || candidate.alg === 'RS256')
                && typeof candidate.n === 'string' && typeof candidate.e === 'string');
            if (!key) throw new Error('CI_AUTH_INVALID');
            const publicKey = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' });
            const claims = jwt.verify(token, publicKey, {
                algorithms: ['RS256'], issuer: ISSUER, audience: AUDIENCE,
                clockTolerance: 30, maxAge: '10m'
            });
            if (!claims || typeof claims !== 'object'
                || !Number.isInteger(claims.iat) || !Number.isInteger(claims.nbf)
                || !Number.isInteger(claims.exp) || claims.exp <= claims.iat
                || claims.exp - claims.iat > 600
                || claims.repository !== REPOSITORY
                || String(claims.repository_id) !== REPOSITORY_ID
                || String(claims.repository_owner_id) !== OWNER_ID
                || claims.ref !== REF || claims.ref_type !== 'branch'
                || claims.workflow_ref !== WORKFLOW_REF
                || !['workflow_dispatch', 'schedule'].includes(claims.event_name)
                || claims.runner_environment !== 'github-hosted'
                || !SUBJECTS.has(claims.sub)) {
                throw new Error('CI_AUTH_INVALID');
            }
            return claims;
        } catch (_) {
            // No token, claim, or upstream error details belong in API responses or logs.
            throw new Error('CI_AUTH_INVALID');
        }
    }

    return { verify };
}

module.exports = { createGithubActionsVerifier, AUDIENCE };
