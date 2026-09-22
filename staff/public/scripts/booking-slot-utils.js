// Shared by the staff preview and backend. Keep this module free of DOM/database access.
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BookingSlotUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    function minutes(value) {
        const match = /^(\d{1,2}):([0-5]\d)(?::00)?$/.exec(String(value ?? ''));
        return match && Number(match[1]) < 24 ? Number(match[1]) * 60 + Number(match[2]) : NaN;
    }

    function time(value) {
        return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    }

    function slotMinutes(setting, slotNumber) {
        const start = minutes(setting.start_time);
        const duration = Number(setting.slot_duration);
        const slot = Number(slotNumber);
        if (!Number.isFinite(start) || !Number.isInteger(slot) || slot < 1 || !Number.isInteger(duration) || duration <= 0) return NaN;
        const breakStart = minutes(setting.break_start_time);
        const breakDuration = Number(setting.break_duration_minutes);
        let result = start + (slot - 1) * duration;
        if (Number.isFinite(breakStart) && breakDuration > 0) {
            // A slot ending exactly at the break is allowed. A partial overlap moves the whole slot.
            const firstAffected = Math.max(0, Math.floor((breakStart - start) / duration));
            if (slot - 1 >= firstAffected) {
                result = Math.max(start + firstAffected * duration, breakStart + breakDuration)
                    + (slot - 1 - firstAffected) * duration;
            }
        }
        return result;
    }

    function slotTime(setting, slotNumber) {
        const result = slotMinutes(setting, slotNumber);
        return Number.isFinite(result) && result < 1440 ? time(result) : null;
    }

    function schedule(setting) {
        const start = minutes(setting.start_time);
        const end = minutes(setting.end_time);
        const duration = Number(setting.slot_duration);
        const count = Number(setting.max_slots);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Waktu selesai harus setelah waktu mulai pada hari yang sama');
        if (!Number.isInteger(duration) || duration < 5 || duration > 60) throw new Error('Durasi slot harus bilangan bulat antara 5-60 menit');
        if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('Jumlah slot harus bilangan bulat antara 1-50');
        const hasStart = setting.break_start_time != null && setting.break_start_time !== '';
        const hasDuration = setting.break_duration_minutes != null && setting.break_duration_minutes !== '';
        let breakEnd = null;
        if (hasStart || hasDuration) {
            const breakStart = minutes(setting.break_start_time);
            const breakDuration = Number(setting.break_duration_minutes);
            if (!hasStart || !hasDuration || !Number.isFinite(breakStart) || !Number.isInteger(breakDuration) || breakDuration <= 0) {
                throw new Error('Isi jam mulai istirahat dan durasi dalam menit (bilangan bulat positif)');
            }
            if (breakStart < start) throw new Error('Istirahat tidak boleh dimulai sebelum sesi');
            breakEnd = breakStart + breakDuration;
        }
        const finalEnd = Math.max(end, slotMinutes(setting, count) + duration, breakEnd || 0);
        if (finalEnd >= 1440) throw new Error('Jadwal tidak boleh mencapai atau melewati tengah malam');
        return {
            slots: Array.from({ length: count }, (_, i) => ({ number: i + 1, time: slotTime(setting, i + 1) })),
            end_time: time(finalEnd),
            break_end_time: breakEnd === null ? null : time(breakEnd)
        };
    }

    return { slotTime, schedule };
});
