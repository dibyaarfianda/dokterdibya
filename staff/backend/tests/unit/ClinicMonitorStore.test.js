const Store = require('../../services/ClinicMonitorStore');
function setup(rows = []) {
    const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn(async sql => sql.startsWith('SELECT id') ? [[{id:1}]] : sql.startsWith('SELECT record_key') ? [rows] : [{affectedRows:1}]) };
    return { connection, store: new Store({ getConnection: async () => connection }) };
}
test('durable transaction locks before read, writes only changed monitor records, commits then releases', async () => {
    const {store,connection} = setup([{record_key:'episode:old',payload:JSON.stringify({id:'old'})}]);
    await store.transact(r => { r['event:new'] = {id:'new'}; });
    expect(connection.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    const writes = connection.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
    expect(writes).toHaveLength(1); expect(writes[0][1]).toEqual(['event:new','event','{"id":"new"}']);
    expect(connection.commit).toHaveBeenCalledTimes(1); expect(connection.release).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls.every(([sql]) => /clinic_monitor_/.test(sql))).toBe(true);
});
test('a failed transaction rolls back and releases without publishing new state', async () => {
    const {store,connection} = setup();
    await expect(store.transact(() => {throw new Error('synthetic');})).rejects.toThrow('synthetic');
    expect(connection.rollback).toHaveBeenCalledTimes(1); expect(connection.commit).not.toHaveBeenCalled(); expect(connection.release).toHaveBeenCalledTimes(1);
});
test('missing lock row fails closed instead of allowing concurrent unlocked mutation', async () => {
    const {store,connection} = setup(); connection.query.mockResolvedValue([[]]);
    const mutation = jest.fn(); await expect(store.transact(mutation)).rejects.toThrow('MONITOR_SCHEMA_NOT_READY');
    expect(mutation).not.toHaveBeenCalled(); expect(connection.rollback).toHaveBeenCalledTimes(1);
});
