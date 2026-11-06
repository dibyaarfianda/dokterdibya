// Fake mysql2-style connection for unit-testing transactional code without a DB.
// handlers: array of [RegExp, valueOrFn]; fn is called with (params, sql).
function createFakeConnection(handlers = []) {
    const calls = [];
    const connection = {
        query: async (sql, params) => {
            calls.push({ sql, params });
            for (const [pattern, value] of handlers) {
                if (pattern.test(sql)) {
                    return typeof value === 'function' ? value(params, sql) : value;
                }
            }
            throw new Error('Unexpected SQL: ' + sql);
        },
        beginTransaction: jest.fn(async () => {}),
        commit: jest.fn(async () => {}),
        rollback: jest.fn(async () => {}),
        release: jest.fn()
    };
    return { connection, calls };
}

function createFakePool(connection) {
    return {
        getConnection: async () => connection,
        query: (...args) => connection.query(...args)
    };
}

module.exports = { createFakeConnection, createFakePool };
