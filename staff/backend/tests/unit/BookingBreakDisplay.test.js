const fs = require('fs');
const path = require('path');
const vm = require('vm');
const display = require('../../../../public/scripts/booking-break-display');
const slots = [{number:1,time:'12:45',available:true},{number:2,time:'13:45',available:false}];
const rest = {startTime:'13:00',endTime:'13:45',durationMinutes:45};
test('break is non-selectable and preserves all slot identities, times and availability', () => {
 const rows=display.timeline(slots,rest);
 expect(rows.map(row=>row.isBreak?'rest':row.number)).toEqual([1,'rest',2]);
 expect(rows.filter(row=>!row.isBreak)).toEqual(slots);
 expect(display.timeline(slots,null)).toEqual(slots);
 expect(display.block(rest)).toContain('Istirahat');
 expect(display.block(rest)).not.toContain('<button');
 expect(display.block(rest,true)).toContain('is-active');
 expect(display.block({startTime:'<img>',endTime:'x'})).not.toContain('<img>');
});
test.each(['public/booking-klinik.html','public/scripts/booking-appointment.js'])('actual renderer inserts one full-width break on %s', file => {
 const source=fs.readFileSync(path.join(__dirname,'../../../..',file),'utf8');
 const start=source.indexOf('const slotsHtml = ');
 const end=source.indexOf(".join('');",start)+11;
 const html=vm.runInNewContext(source.slice(start,end)+';slotsHtml', {session:{session:1,label:'Sesi',slots,break:rest},BookingBreakDisplay:display});
 expect(html.match(/<button/g)).toHaveLength(2);
 expect(html.indexOf('12:45')).toBeLessThan(html.indexOf('booking-break-block'));
 expect(html.indexOf('booking-break-block')).toBeLessThan(html.lastIndexOf('13:45'));
 expect(html).toContain('grid-column:1 / -1');
});
