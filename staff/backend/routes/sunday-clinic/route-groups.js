'use strict';

const GROUP_MATCHERS = Object.freeze({
    queue: (path) => path.startsWith('/queue/') || path === '/records/:mrId/queue-status',
    records: (path) => (
        path === '/check-existing' ||
        path === '/directory' ||
        (path.startsWith('/records/') && path !== '/records/:mrId/queue-status') ||
        path.startsWith('/medify-sync/')
    ),
    billing: (path) => path.startsWith('/billing/'),
    prescription: (path) => path.startsWith('/prescription-templates'),
    resumeExport: (path) => (
        path === '/statistics/categories' ||
        path.startsWith('/generate-anamnesa/') ||
        path.startsWith('/resume-medis/')
    ),
    visitWalkIn: (path) => (
        path === '/start-walk-in' ||
        path.startsWith('/patient-visits/') ||
        path.startsWith('/last-anthropometry/')
    )
});

function groupsForPath(path) {
    return Object.entries(GROUP_MATCHERS)
        .filter(([, acceptsPath]) => acceptsPath(path))
        .map(([group]) => group);
}

module.exports = { GROUP_MATCHERS, groupsForPath };
