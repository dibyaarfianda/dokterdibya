const MIN_TIMER_GA_DAYS = 28 * 7;
const TERM_GA_DAYS = 37 * 7;

const RED_FLAG_LABELS = {
    bleeding: 'perdarahan',
    ketuban_pecah: 'air ketuban keluar',
    constant_pain: 'nyeri menetap di luar kontraksi',
    reduced_fetal_movement: 'gerak bayi berkurang',
    severe_symptoms: 'gejala berat'
};

function normalizeGestationalAge(value) {
    if (!value || typeof value !== 'object') return null;
    const weeks = Number.parseInt(value.weeks, 10);
    const days = Number.parseInt(value.days || 0, 10);
    if (!Number.isFinite(weeks) || weeks < 0) return null;
    const normalizedDays = Number.isFinite(days) ? Math.min(Math.max(days, 0), 6) : 0;
    return {
        weeks,
        days: normalizedDays,
        totalDays: weeks * 7 + normalizedDays
    };
}

function normalizeEvents(events) {
    if (!Array.isArray(events)) return [];
    return events
        .map((event) => ({
            duration_seconds: Math.max(0, Number(event.duration_seconds || event.durationSeconds || 0)),
            interval_from_previous_seconds: event.interval_from_previous_seconds == null
                ? null
                : Math.max(0, Number(event.interval_from_previous_seconds))
        }))
        .filter((event) => Number.isFinite(event.duration_seconds) && event.duration_seconds > 0);
}

function average(values) {
    const clean = values.filter((value) => Number.isFinite(value));
    if (clean.length === 0) return 0;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function maxDeviation(values, mean) {
    const clean = values.filter((value) => Number.isFinite(value));
    if (clean.length === 0) return 0;
    return Math.max(...clean.map((value) => Math.abs(value - mean)));
}

function formatReasons(stats) {
    const reasons = [];
    if (stats.eventCount > 0) reasons.push(`${stats.eventCount} kontraksi tercatat`);
    if (stats.averageIntervalSeconds > 0) reasons.push(`rata-rata jarak ${Math.round(stats.averageIntervalSeconds / 60)} menit`);
    if (stats.averageDurationSeconds > 0) reasons.push(`rata-rata durasi ${Math.round(stats.averageDurationSeconds)} detik`);
    return reasons;
}

function createAssessment(code, overrides = {}) {
    const defaults = {
        inconclusive: {
            label: 'Belum cukup data',
            copy: 'Catat beberapa kontraksi lagi agar pola lebih mudah dibaca.',
            next_action: 'Lanjutkan pencatatan dan perhatikan tanda bahaya.'
        },
        braxton_hicks_like: {
            label: 'Lebih mirip Braxton Hicks',
            copy: 'Pola kontraksi tidak teratur atau mereda setelah istirahat, minum, dan ganti posisi.',
            next_action: 'Istirahat, cukup minum, dan ulangi pencatatan bila kontraksi muncul lagi.'
        },
        latent_like: {
            label: 'Lebih mirip fase laten',
            copy: 'Pola ini lebih mirip fase laten: kontraksi menetap, tetapi belum cukup rapat dan lama untuk evaluasi persalinan aktif.',
            next_action: 'Tetap pantau. Ke fasilitas kesehatan bila makin teratur, makin kuat, atau ada tanda bahaya.'
        },
        urgent_evaluation: {
            label: 'Perlu evaluasi persalinan',
            copy: 'pola kontraksi sudah teratur dan perlu evaluasi persalinan. Fase aktif hanya bisa dipastikan lewat pemeriksaan serviks.',
            next_action: 'Segera hubungi unit persalinan/IGD atau datang ke fasilitas kesehatan.'
        },
        preterm_warning: {
            label: 'Kontraksi sebelum 37 minggu',
            copy: 'Kontraksi teratur sebelum 37 minggu perlu dievaluasi karena bisa terkait persalinan prematur.',
            next_action: 'Segera hubungi unit persalinan/IGD atau datang ke fasilitas kesehatan.'
        },
        emergency_now: {
            label: 'Tanda bahaya',
            copy: 'Ada tanda bahaya yang perlu dinilai langsung, terlepas dari pola kontraksi.',
            next_action: 'Segera ke IGD/unit persalinan terdekat.'
        }
    };

    return {
        code,
        label: defaults[code].label,
        copy: defaults[code].copy,
        reasons: [],
        next_action: defaults[code].next_action,
        canUseTimer: true,
        ...overrides
    };
}

function summarizeEvents(events) {
    const normalized = normalizeEvents(events);
    const lastEvents = normalized.slice(-3);
    const lastIntervals = lastEvents
        .map((event) => event.interval_from_previous_seconds)
        .filter((value) => value != null && Number.isFinite(value));
    const lastDurations = lastEvents.map((event) => event.duration_seconds);
    const averageIntervalSeconds = average(lastIntervals);
    const averageDurationSeconds = average(lastDurations);
    const intervalDeviationSeconds = maxDeviation(lastIntervals, averageIntervalSeconds);

    return {
        events: normalized,
        eventCount: normalized.length,
        lastEvents,
        lastIntervals,
        averageIntervalSeconds,
        averageDurationSeconds,
        intervalDeviationSeconds
    };
}

function assessContractionPattern(input = {}) {
    const gestationalAge = normalizeGestationalAge(input.gestationalAge || input.gestational_age);
    const stats = summarizeEvents(input.events);
    const redFlags = Array.isArray(input.redFlags || input.red_flags) ? (input.redFlags || input.red_flags) : [];
    const restHydrationResult = input.restHydrationResult || input.rest_hydration_result || 'unknown';

    if (redFlags.length > 0) {
        const labels = redFlags.map((flag) => RED_FLAG_LABELS[flag] || flag);
        return createAssessment('emergency_now', {
            reasons: labels,
            stats
        });
    }

    if (!gestationalAge) {
        return createAssessment('inconclusive', {
            reasons: ['usia kehamilan belum tersedia'],
            next_action: 'Catat kontraksi bila perlu, dan segera ke unit persalinan/IGD bila ada tanda bahaya atau nyeri kuat.',
            stats
        });
    }

    if (gestationalAge.totalDays < MIN_TIMER_GA_DAYS) {
        return createAssessment('inconclusive', {
            reasons: [`usia kehamilan ${gestationalAge.weeks} minggu ${gestationalAge.days} hari`],
            next_action: 'Timer boleh dipakai untuk mencatat pola, tetapi kontraksi/nyeri sebelum 28 minggu sebaiknya dievaluasi langsung di unit persalinan/IGD bila menetap atau disertai tanda bahaya.',
            stats
        });
    }

    if (stats.eventCount < 3) {
        return createAssessment('inconclusive', {
            reasons: formatReasons(stats),
            stats
        });
    }

    if (restHydrationResult === 'improved') {
        return createAssessment('braxton_hicks_like', {
            reasons: ['kontraksi mereda setelah istirahat, hidrasi, atau ganti posisi', ...formatReasons(stats)],
            stats
        });
    }

    const isRegularFiveOneOne = stats.lastIntervals.length >= 2
        && stats.averageIntervalSeconds > 0
        && stats.averageIntervalSeconds <= 300
        && stats.averageDurationSeconds >= 60
        && stats.intervalDeviationSeconds <= 75;
    const isPersistentPreterm = gestationalAge
        && gestationalAge.totalDays < TERM_GA_DAYS
        && restHydrationResult !== 'improved'
        && (stats.eventCount >= 3 || isRegularFiveOneOne);

    if (isPersistentPreterm) {
        return createAssessment('preterm_warning', {
            reasons: formatReasons(stats),
            stats
        });
    }

    if (isRegularFiveOneOne && restHydrationResult !== 'improved') {
        return createAssessment('urgent_evaluation', {
            reasons: formatReasons(stats),
            stats
        });
    }

    const irregularOrShort = stats.averageIntervalSeconds === 0
        || stats.intervalDeviationSeconds > 120
        || stats.averageDurationSeconds < 40;
    if (irregularOrShort) {
        return createAssessment('braxton_hicks_like', {
            reasons: formatReasons(stats),
            stats
        });
    }

    return createAssessment('latent_like', {
        reasons: formatReasons(stats),
        stats
    });
}

module.exports = {
    MIN_TIMER_GA_DAYS,
    TERM_GA_DAYS,
    assessContractionPattern,
    normalizeEvents,
    normalizeGestationalAge,
    summarizeEvents
};
