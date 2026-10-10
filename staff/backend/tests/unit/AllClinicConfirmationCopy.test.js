const fs = require('fs');
const path = require('path');

const publicRoot = path.join(__dirname, '..', '..', '..', '..', 'public');
const backendRoot = path.join(__dirname, '..', '..');

test.each([
    'sisiwanita/index.html',
    'booking-klinik-promo-mock.html'
])('%s does not promise immediate confirmation', (relativePath) => {
    const html = fs.readFileSync(path.join(publicRoot, relativePath), 'utf8');

    expect(html).not.toMatch(/langsung terkonfirmasi/i);
    expect(html).toMatch(/konfirmasi kehadiran/i);
});

test('booking API source does not retain an immediate-confirmation response', () => {
    const source = fs.readFileSync(path.join(backendRoot, 'routes', 'sunday-appointments.js'), 'utf8');

    expect(source).not.toMatch(/langsung terkonfirmasi/i);
});
