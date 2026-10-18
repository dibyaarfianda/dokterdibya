/* Shared display contract. ISO values used by forms, APIs and storage stay unchanged. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.DibyaDateTime = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const zone = 'Asia/Jakarta';
    const pad = value => String(value).padStart(2, '0');
    const calendar = /^(\d{4})-(\d{2})-(\d{2})$/;

    function validDate(value) {
        const m = String(value).match(calendar);
        if (!m) return false;
        const date = new Date(`${value}T12:00:00+07:00`);
        return !Number.isNaN(date.getTime()) && new Intl.DateTimeFormat('en-CA', {
            timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(date) === value;
    }

    function parse(value) {
        if (value == null || value === '') return null;
        if (typeof value === 'string') {
            if (calendar.test(value)) {
                if (!validDate(value)) return null;
                value += 'T12:00:00+07:00';
            } else if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value)) {
                value = value.replace(' ', 'T') + '+07:00';
            }
        }
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function parts(value) {
        const date = parse(value);
        if (!date) return null;
        return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
            timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }).formatToParts(date).map(part => [part.type, part.value]));
    }

    function time(value, options = {}) {
        if (typeof value === 'string' && /^\d\d:\d\d(?::\d\d)?$/.test(value)) {
            const [h, m, s = '00'] = value.split(':');
            if (+h > 23 || +m > 59 || +s > 59) return '-';
            return `${h}:${m}${options.second ? ':' + s : ''}`;
        }
        const p = parts(value);
        return p ? `${p.hour}:${p.minute}${options.second ? ':' + p.second : ''}` : '-';
    }

    function date(value, options = {}) {
        const p = parts(value);
        if (!p) return '-';
        // Calendar headings remain meaningful labels, rather than fabricated dates.
        if (!options.day && !options.dateStyle && (options.month || options.weekday) && !options.hour) {
            return new Intl.DateTimeFormat('id-ID', {
                timeZone: zone, ...(options.month ? { month: options.month } : {}),
                ...(options.year ? { year: options.year } : {}),
                ...(options.weekday ? { weekday: options.weekday } : {})
            }).format(parse(value));
        }
        const prefix = options.weekday ? new Intl.DateTimeFormat('id-ID', {
            timeZone: zone, weekday: options.weekday
        }).format(parse(value)) + ', ' : '';
        return `${prefix}${p.day}-${p.month}-${p.year}${options.hour || options.timeStyle ? ' ' + time(value, options) : ''}`;
    }

    function dateTime(value, options = {}) {
        if (!parts(value)) return '-';
        return date(value, { ...options, day: '2-digit', hour: undefined, timeStyle: undefined }) + ' ' + time(value, options);
    }

    function toInputValue(value, type) {
        if (value === '') return '';
        if (type === 'time') return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value) ? value : null;
        const match = String(value).match(/^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/);
        if (!match) return null;
        const iso = `${match[3]}-${match[2]}-${match[1]}`;
        if (!validDate(iso)) return null;
        if (type === 'date') return match[4] ? null : iso;
        return match[4] && toInputValue(match[4], 'time') ? `${iso}T${match[4]}` : null;
    }

    function inputDisplay(value, type) {
        if (!value) return '';
        if (type === 'time') return value;
        const [day, clock] = value.split('T');
        return day.split('-').reverse().join('-') + (clock ? ' ' + clock : '');
    }

    return Object.freeze({ date, time, dateTime, toInputValue, inputDisplay });
});
