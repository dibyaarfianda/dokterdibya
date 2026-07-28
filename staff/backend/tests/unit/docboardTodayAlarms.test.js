const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('DocBoard today alarms', () => {
  test('exposes personalized alarm routes and a minute scheduler', () => {
    const route = readRepoFile('staff', 'backend', 'routes', 'docboard.js');
    const scheduler = readRepoFile('staff', 'backend', 'services', 'appointmentScheduler.js');
    const push = readRepoFile('staff', 'backend', 'services', 'DocBoardPushService.js');

    expect(route).toContain("router.get('/alarms/today'");
    expect(route).toContain("router.put('/alarms'");
    expect(route).toContain("router.delete('/alarms/:id'");
    expect(scheduler).toContain("cron.schedule('* * * * *'");
    expect(scheduler).toContain("timezone: 'Asia/Jakarta'");
    expect(scheduler).toContain('startDocBoardAlarmScheduler();');
    expect(push).toContain('async function sendToUser');
    expect(push).toContain('WHERE user_id = ?');
  });

  test('shows all supported agenda groups with time and sound controls', () => {
    const app = readRepoFile('docboard', 'src', 'app.jsx');
    const alarms = readRepoFile('docboard', 'src', 'views', 'TodayAlarms.jsx');
    const calendar = readRepoFile('docboard', 'src', 'views', 'Calendar.jsx');
    const settings = readRepoFile('docboard', 'src', 'views', 'Settings.jsx');

    expect(app).toContain('<TodayAlarms path="/docboard/alarms" />');
    expect(calendar).toContain('Alarm agenda hari ini');
    expect(settings).toContain('title="Alarm Hari Ini"');
    expect(alarms).toContain("operasi: { label: 'Operasi'");
    expect(alarms).toContain("tindakan: { label: 'Tindakan'");
    expect(alarms).toContain("ilmiah: { label: 'Ilmiah'");
    expect(alarms).toContain("pribadi: { label: 'Pribadi'");
    expect(alarms).toContain('type="time"');
    expect(alarms).toContain('ALARM_SOUNDS.map');
    expect(alarms).toContain('subscribeToPush()');
  });

  test('handles background push, lockscreen interaction, and foreground sound', () => {
    const worker = readRepoFile('docboard', 'public', 'sw.js');
    const main = readRepoFile('docboard', 'src', 'main.jsx');
    const sounds = readRepoFile('docboard', 'src', 'utils', 'alarmSound.js');

    expect(worker).toContain("self.addEventListener('push'");
    expect(worker).toContain('requireInteraction: isAgendaAlarm');
    expect(worker).toContain("self.addEventListener('notificationclick'");
    expect(worker).toContain("type: 'DOCBOARD_ALARM'");
    expect(main).toContain("event.data?.type !== 'DOCBOARD_ALARM'");
    expect(main).toContain('playAlarmSound');
    expect(sounds).toContain("urgent:");
  });
});
