// Header is emitted immediately before response headers, so it measures
// application work without client/network round-trip time or identifiers.
function appTiming(_req, res, next) {
    const started = process.hrtime.bigint();
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
        if (!res.headersSent) {
            const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
            res.setHeader('Server-Timing', `app;dur=${durationMs.toFixed(3)}`);
        }
        return writeHead.apply(this, args);
    };
    next();
}

module.exports = { appTiming };
