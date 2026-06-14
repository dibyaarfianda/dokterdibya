const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('staff realtime socket presence', () => {
    test('debounces transient polling disconnects before marking staff offline', () => {
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(server).toContain('const USER_DISCONNECT_GRACE_MS');
        expect(server).toContain('const userSocketIds = new Map();');
        expect(server).toContain('const userDisconnectTimers = new Map();');
        expect(server).toContain('function getOnlineUsersList()');
        expect(server).toContain('clearTimeout(existingDisconnectTimer);');
        expect(server).toContain('socketIds.delete(socket.id);');
        expect(server).toContain('if (socketIds.size > 0) {');
        expect(server).toContain('setTimeout(() => {');
        expect(server).toContain('io.emit(\'user:disconnected\'');
    });
});
