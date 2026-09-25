const fs = require('fs');
const path = require('path');
const { chromium } = require('../../../../node_modules/playwright');

const repoRoot = path.resolve(__dirname, '../../../..');
const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

describe('patient birth date wheel navigation', () => {
    test('runs inner date actions while keeping empty card clicks separate from backdrop clicks', async () => {
        const browser = await chromium.launch({
            headless: true,
            ...(fs.existsSync(systemChrome) ? { executablePath: systemChrome } : {})
        });
        try {
            const page = await browser.newPage();
            const html = fs.readFileSync(path.join(repoRoot, 'public/patient-menu.html'), 'utf8');
            const dialog = html.match(/<div class="birth-date-wheel-modal" id="birth-date-wheel-modal"[\s\S]*?<\/section>\s*<\/div>/)?.[0];
            expect(dialog).toBeTruthy();
            await page.setContent(dialog);

            const navigation = fs.readFileSync(path.join(repoRoot, 'public/scripts/patient-shell/navigation.js'), 'utf8');
            await page.addScriptTag({ content: navigation.replace('export function bindPatientNavigation', 'function bindPatientNavigation') + `
                window.firedBirthActions = [];
                const actions = Object.fromEntries([
                    'select-birth-date-wheel-value', 'apply-birth-date-wheel',
                    'close-birth-date-wheel'
                ].map(name => [name, (target) => window.firedBirthActions.push({ name, value: target.dataset.wheelValue || '' })]));
                bindPatientNavigation(actions);
            ` });

            await page.locator('#birth-date-wheel-day').evaluate(list => {
                list.innerHTML = '<button type="button" class="birth-date-wheel-option" data-shell-action="select-birth-date-wheel-value" data-wheel-value="21">21</button>';
            });
            await page.locator('#birth-date-wheel-month').evaluate(list => {
                list.innerHTML = '<button type="button" class="birth-date-wheel-option" data-shell-action="select-birth-date-wheel-value" data-wheel-value="9">September</button>';
            });
            await page.locator('#birth-date-wheel-year').evaluate(list => {
                list.innerHTML = '<button type="button" class="birth-date-wheel-option" data-shell-action="select-birth-date-wheel-value" data-wheel-value="2026">2026</button>';
            });
            await page.evaluate(() => {
                const modal = document.getElementById('birth-date-wheel-modal');
                modal.classList.add('active');
                modal.setAttribute('aria-hidden', 'false');
            });
            await page.addStyleTag({ content: '.birth-date-wheel-modal { position: fixed; inset: 0; display: flex; align-items: flex-end; justify-content: center; } .birth-date-wheel-card { background: white; padding: 16px; }' });

            await page.getByText('21', { exact: true }).click({ timeout: 2000 });
            await page.getByText('September', { exact: true }).click({ timeout: 2000 });
            await page.getByText('2026', { exact: true }).click({ timeout: 2000 });
            expect(await page.locator('[data-shell-action="apply-birth-date-wheel"]').count()).toBe(1);
            await page.locator('[data-shell-action="apply-birth-date-wheel"]').click({ timeout: 2000 });
            await page.getByRole('button', { name: 'Batal' }).click({ timeout: 2000 });
            await page.getByRole('button', { name: 'Tutup' }).click({ timeout: 2000 });
            await page.locator('.birth-date-wheel-head').click({ position: { x: 5, y: 5 }, timeout: 2000 });
            await page.locator('#birth-date-wheel-modal').click({ position: { x: 2, y: 2 }, timeout: 2000 });

            expect(await page.evaluate(() => window.firedBirthActions)).toEqual([
                { name: 'select-birth-date-wheel-value', value: '21' },
                { name: 'select-birth-date-wheel-value', value: '9' },
                { name: 'select-birth-date-wheel-value', value: '2026' },
                { name: 'apply-birth-date-wheel', value: '' },
                { name: 'close-birth-date-wheel', value: '' },
                { name: 'close-birth-date-wheel', value: '' },
                { name: 'close-birth-date-wheel', value: '' }
            ]);
        } finally {
            await browser.close();
        }
    }, 20000);
});
