import { getIdToken } from './vps-auth-v2.js';

const inFlightGets = new Map();
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class StaffApiError extends Error {
    constructor(message, { status = 0, code = '', details = null } = {}) {
        super(message);
        this.name = 'StaffApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function wait(delayMs, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason || new DOMException('Request aborted', 'AbortError'));
        }, { once: true });
    });
}

function combineSignals(signals) {
    const controller = new AbortController();
    const abort = signal => {
        if (!controller.signal.aborted) {
            controller.abort(signal?.reason || new DOMException('Request aborted', 'AbortError'));
        }
    };
    signals.filter(Boolean).forEach(signal => {
        if (signal.aborted) abort(signal);
        else signal.addEventListener('abort', () => abort(signal), { once: true });
    });
    return controller;
}

function resolveUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return new URL(path, window.location.origin).href;
}

async function parseResponse(response) {
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return response.json();
    return response.text();
}

async function executeRequest(path, options) {
    const {
        timeoutMs = 15000,
        retries = 2,
        retryBaseMs = 350,
        signal,
        headers = {},
        body,
        method = 'GET',
        ...fetchOptions
    } = options;
    const upperMethod = method.toUpperCase();
    let attempt = 0;

    while (true) {
        const timeoutController = new AbortController();
        const timeout = setTimeout(
            () => timeoutController.abort(new DOMException('Request timed out', 'TimeoutError')),
            timeoutMs
        );
        const combined = combineSignals([signal, timeoutController.signal]);

        try {
            const token = await getIdToken();
            if (!token) throw new StaffApiError('Sesi login tidak tersedia', { status: 401, code: 'AUTH_REQUIRED' });

            const requestHeaders = new Headers(headers);
            requestHeaders.set('Authorization', `Bearer ${token}`);
            if (body != null && !(body instanceof FormData) && !requestHeaders.has('Content-Type')) {
                requestHeaders.set('Content-Type', 'application/json');
            }

            const response = await fetch(resolveUrl(path), {
                ...fetchOptions,
                method: upperMethod,
                headers: requestHeaders,
                body,
                signal: combined.signal,
                credentials: 'same-origin',
                cache: upperMethod === 'GET' ? 'no-store' : fetchOptions.cache
            });
            const data = await parseResponse(response);

            if (!response.ok) {
                const message = data?.message || data?.error || `Request gagal (HTTP ${response.status})`;
                const error = new StaffApiError(message, {
                    status: response.status,
                    code: data?.code || '',
                    details: data?.details || null
                });
                if (upperMethod === 'GET' && attempt < retries && RETRYABLE_STATUS.has(response.status)) {
                    attempt += 1;
                    await wait(retryBaseMs * (2 ** (attempt - 1)), signal);
                    continue;
                }
                throw error;
            }

            return data;
        } catch (error) {
            const retryableNetworkFailure = upperMethod === 'GET'
                && attempt < retries
                && error?.name !== 'AbortError'
                && error?.name !== 'TimeoutError'
                && !(error instanceof StaffApiError);
            if (!retryableNetworkFailure) throw error;
            attempt += 1;
            await wait(retryBaseMs * (2 ** (attempt - 1)), signal);
        } finally {
            clearTimeout(timeout);
        }
    }
}

function fingerprintToken(token) {
    let hash = 2166136261;
    const value = String(token || 'anonymous');
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export async function staffApiRequest(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const coalesce = options.coalesce !== false && method === 'GET';
    const tokenFingerprint = coalesce ? fingerprintToken(await getIdToken()) : '';
    const key = coalesce ? `${tokenFingerprint}:${method}:${resolveUrl(path)}` : null;
    if (key && inFlightGets.has(key)) return inFlightGets.get(key);

    const promise = executeRequest(path, options);
    if (!key) return promise;
    inFlightGets.set(key, promise);
    promise.finally(() => {
        if (inFlightGets.get(key) === promise) inFlightGets.delete(key);
    }).catch(() => {});
    return promise;
}

export function createPageRequestScope() {
    const controller = new AbortController();
    return {
        get signal() {
            return controller.signal;
        },
        request(path, options = {}) {
            return staffApiRequest(path, { ...options, signal: options.signal || controller.signal });
        },
        abort(reason = 'Page deactivated') {
            if (!controller.signal.aborted) {
                controller.abort(new DOMException(reason, 'AbortError'));
            }
        }
    };
}
