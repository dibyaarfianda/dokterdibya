const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.resolve(__dirname, '../../../public/scripts/sunday-clinic/utils/previous-planning.js');
const source = fs.readFileSync(filename, 'utf8').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const context = {};
vm.runInNewContext(source, context, { filename });
const {selectPreviousPrivateVisit, previousPlanningText, visitTimestamp} = context;

const current = {createdAt: '2026-10-05T10:00:00+07:00'};
const visit = (mr_id, visit_date, visit_location='klinik_private', mr_category='gyn_special') =>
    ({mr_id,visit_date,visit_location,mr_category});

describe('previous private-clinic Planning reference', () => {
    test('selects the preceding private visit across templates, excluding current and later visits', () => {
        const visits = [
            visit('DRD0108','2026-10-06T09:00:00+07:00'),
            visit('DRD0107','2026-10-05T10:00:00+07:00'),
            visit('DRD0106',current.createdAt,'klinik_private','obstetri'),
            visit('DRD0105','2026-10-05T09:59:00+07:00','rsia_melinda'),
            visit('DRD0104','2026-10-05T09:30:00+07:00','klinik_private','gyn_repro'),
            visit('DRD0103','2026-10-04T09:30:00+07:00')
        ];
        expect(selectPreviousPrivateVisit(visits,current,'DRD0106').mr_id).toBe('DRD0104');
    });

    test('breaks equal visit times by numeric DRD sequence, including different digit counts', () => {
        const visits = ['DRD9','DRD11','DRD8','DRD10'].map(id=>visit(id,current.createdAt));
        expect(selectPreviousPrivateVisit(visits,current,'DRD10').mr_id).toBe('DRD9');
        expect(visits.map(item=>item.mr_id)).toEqual(['DRD9','DRD11','DRD8','DRD10']);
    });

    test('anchors retrospective history to the active visit instead of the latest visit today', () => {
        const visits = [visit('DRD20','2026-10-05T09:30:00+07:00'),
            visit('DRD30','2026-09-03T09:00:00+07:00'),visit('DRD29','2026-09-02T09:00:00+07:00')];
        expect(selectPreviousPrivateVisit(visits,current,'DRD30').mr_id).toBe('DRD29');
    });

    test('uses the loaded current visit time if history omits its row and ignores malformed dates', () => {
        expect(selectPreviousPrivateVisit([visit('DRD5','invalid'),visit('DRD4','2026-10-04 23:30:00')],
            current,'DRD6').mr_id).toBe('DRD4');
        expect(()=>selectPreviousPrivateVisit([],{},'DRD6')).toThrow(/date is unavailable/);
    });

    test('has no previous control when all candidates are current, future, or from other hospitals', () => {
        expect(selectPreviousPrivateVisit([visit('DRD6',current.createdAt),
            visit('DRD7','2026-10-06'),visit('DRD4','2026-10-04','rsud_gambiran'),
            visit('DRD3','2026-10-03','rs_bhayangkara')],current,'DRD6')).toBeNull();
    });

    test('interprets unzoned database dates as WIB rather than the device timezone', () => {
        expect(visitTimestamp('2026-10-05 00:30:00')).toBe(Date.parse('2026-10-04T17:30:00Z'));
        expect(visitTimestamp('2026-10-05')).toBe(Date.parse('2026-10-04T17:00:00Z'));
    });

    test('supports imported obat/instruksi and complete records without replacing deliberate clearing', () => {
        const legacy=previousPlanningText({latestComplete:{data:{planning:{obat:['Obat A','Obat B'],instruksi:['Kontrol']}}}});
        expect(legacy.terapi).toBe('Obat A\nObat B');
        expect(legacy.rencana).toBe('Kontrol');
        const cleared=previousPlanningText({byType:{planning:{data:{terapi:'',rencana:'',obat:['Lama'],instruksi:['Lama']}}},
            latestComplete:{data:{planning:{terapi:'Lebih lama',rencana:'Lebih lama'}}}});
        expect(cleared.terapi).toBe('');
        expect(cleared.rencana).toBe('');
        expect(previousPlanningText({byType:{planning:{data:{}}},latestComplete:{data:{planning:{terapi:'Lama'}}}}).terapi).toBe('');
    });
});
