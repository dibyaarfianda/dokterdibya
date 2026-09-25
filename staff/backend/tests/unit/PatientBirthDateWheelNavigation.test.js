const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const repoRoot = path.resolve(__dirname, '../../../..');

describe('patient birth date wheel navigation', () => {
    test('runs inner date actions while keeping empty card clicks separate from backdrop clicks', async () => {
        const browser = await puppeteer.launch({ headless: true });
        try {
            const page = await browser.newPage();
            page.setDefaultTimeout(2000);
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

            await page.$eval('#birth-date-wheel-day', list => {
                list.innerHTML = '<button type="button" class="birth-date-wheel-option" data-shell-action="select-birth-date-wheel-value" data-wheel-value="21">21</button>';
            });
            await page.$eval('#birth-date-wheel-month', list => {
                list.innerHTML = '<button type="button" class="birth-date-wheel-option" data-shell-action="select-birth-date-wheel-value" data-wheel-value="9">September</button>';
            });
            await page.$eval('#birth-date-wheel-year', list => {
                list.innerHTML = '<button type="button" class="birth-date-wheel-option" data-shell-action="select-birth-date-wheel-value" data-wheel-value="2026">2026</button>';
            });
            await page.evaluate(() => {
                const modal = document.getElementById('birth-date-wheel-modal');
                modal.classList.add('active');
                modal.setAttribute('aria-hidden', 'false');
            });
            await page.addStyleTag({ content: '.birth-date-wheel-modal { position: fixed; inset: 0; display: flex; align-items: flex-end; justify-content: center; } .birth-date-wheel-card { background: white; padding: 16px; }' });

            await page.click('[data-wheel-value="21"]');
            await page.click('[data-wheel-value="9"]');
            await page.click('[data-wheel-value="2026"]');
            expect(await page.$$('[data-shell-action="apply-birth-date-wheel"]')).toHaveLength(1);
            await page.click('[data-shell-action="apply-birth-date-wheel"]');
            await page.click('.birth-date-wheel-card .ghost-action[data-shell-action="close-birth-date-wheel"]');
            await page.click('.birth-date-wheel-close');
            const header = await page.$('.birth-date-wheel-head');
            const box = await header.boundingBox();
            await page.mouse.click(box.x + 5, box.y + 5);
            await page.mouse.click(2, 2);

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
