const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/staff-panel-ci.yml'), 'utf8');

test('Wave 3 CI covers all Staff integration tests and DocBoard changes', () => {
    expect(workflow).toContain('"docboard/**"');
    expect(workflow).toMatch(/npm run test:integration -- --runInBand --coverage=false --detectOpenHandles/);
    expect(workflow).toMatch(/working-directory: docboard/);
    expect(workflow).toMatch(/docboard-contracts:\n    runs-on: ubuntu-24\.04\n    env:\n      TZ: Asia\/Jakarta/);
    expect(workflow).toMatch(/run: npm test/);
    expect(workflow).toMatch(/run: npm run build/);
});
