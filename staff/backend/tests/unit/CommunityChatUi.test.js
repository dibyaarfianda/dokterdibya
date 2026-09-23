const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sourcePath = path.resolve(__dirname, '../../../../public/scripts/community-chat-ui.js');
function ui() {
    const context = { module: { exports: {} } };
    const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
    vm.runInNewContext(source.replace(/export /g, '') + '\nmodule.exports = { shiftMentions: typeof shiftMentions === "function" ? shiftMentions : (() => []), badgeLabel: typeof badgeLabel === "function" ? badgeLabel : (() => "") };', context);
    return context.module.exports;
}
test('editing before a mention shifts its identity; editing its text removes identity', () => {
    const { shiftMentions } = ui();
    const entities = [{ user_id: 'P2', user_type: 'patient', start: 3, end: 8 }];
    expect(shiftMentions('Hi @Buna', 'Hi! @Buna', entities)).toEqual([{ user_id: 'P2', user_type: 'patient', start: 4, end: 9 }]);
    expect(shiftMentions('Hi @Buna', 'Hi @Buni', entities)).toEqual([]);
});
test('badge hides zero and caps display without losing actual count', () => {
    expect([0, 1, 99, 100].map(ui().badgeLabel)).toEqual(['', '1', '99', '99+']);
});
