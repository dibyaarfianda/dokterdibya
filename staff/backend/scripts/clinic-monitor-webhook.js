// Operational setup only, run explicitly after the bot and secret are configured.
// Registration stays out of application startup. Never prints the bot token or
// the webhook secret, so the output is safe to paste into an operations log.
require('dotenv').config();

const WEBHOOK_PATH = '/api/clinic-monitor/telegram/webhook';

// The public base URL is supplied per deployment instead of a new environment
// variable, so the registered address is reviewed rather than guessed.
function webhookUrl(base) {
    const url = new URL(String(base || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('INVALID_BASE_URL');
    return `${url.origin}${WEBHOOK_PATH}`;
}

async function call(method, body) {
    const token = process.env.CLINIC_MONITOR_TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_NOT_CONFIGURED');
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error('TELEGRAM_REQUEST_FAILED');
    return result.result;
}

async function main([command, base], request = call) {
    if (command === 'set') {
        const secret = process.env.CLINIC_MONITOR_TELEGRAM_WEBHOOK_SECRET;
        if (!secret) throw new Error('TELEGRAM_NOT_CONFIGURED');
        const url = webhookUrl(base);
        // Only private Start messages are handled, and pending updates are dropped
        // so an expired pairing token cannot be redeemed after registration.
        await request('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
        return `Webhook registered at ${url}\nPairing and notifications still require verified sources and explicit activation.\n`;
    }
    if (command === 'info') {
        const info = await request('getWebhookInfo', {});
        return `url=${info.url || '(none)'} pending=${info.pending_update_count ?? 0} last_error=${info.last_error_message || '(none)'}\n`;
    }
    if (command === 'delete') {
        await request('deleteWebhook', { drop_pending_updates: false });
        return 'Webhook removed. Telegram pairing and alerts stop until it is registered again.\n';
    }
    throw new Error('USAGE');
}

if (require.main === module) {
    main(process.argv.slice(2))
        .then(output => process.stdout.write(output))
        .catch(error => {
            const hint = error.message === 'USAGE' ? 'Usage: clinic-monitor-webhook.js set|info|delete [https://base-url]'
                : error.message === 'INVALID_BASE_URL' ? 'Base URL must be https without credentials, query or hash.'
                : error.message === 'TELEGRAM_NOT_CONFIGURED' ? 'Configure the bot token and webhook secret on the server first.'
                : 'Telegram request failed; check bot configuration and outbound access.';
            process.stderr.write(`${hint}\n`);
            process.exitCode = 1;
        });
}

module.exports = { webhookUrl, main, WEBHOOK_PATH };
