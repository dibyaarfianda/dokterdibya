/**
 * Real User Monitoring (RUM) - Lightweight Web Vitals & Performance Tracker
 * For Dokter Dibya Staff Admin Panel
 *
 * No patient data is collected. Only metric names, values, page, role, and timestamps.
 */
(function () {
  'use strict';

  var metrics = {};
  var apiCalls = [];
  var clientErrors = [];
  var hasPendingData = false;
  var BEACON_INTERVAL = 30000;
  var API_BUFFER_SIZE = 50;
  var ERROR_BUFFER_SIZE = 20;
  // Navigation keys are fixed by application code. Never beacon display names.
  var knownPageKeys = new Set([
    'dashboard', 'patients', 'sunday-clinic', 'anamnesa', 'usg', 'kelola-roles',
    'template-resep', 'estimasi-biaya', 'finance-analysis', 'profile-settings',
    'kelola-obat', 'activity-log', 'staff-activity', 'patient-activity',
    'support-chat', 'troubleshooting', 'staff-points', 'staff-briefing',
    'staff-payroll', 'tanya-dokter', 'birth-congrats', 'birth-testimonials',
    'invoice-history', 'artikel-kesehatan', 'ruang-cerita', 'community-chat',
    'klinik-private', 'antrian-online', 'hospital-appointments',
    'hospital-patients', 'tindakan', 'obat', 'cashier', 'perhatian-khusus',
    'physical', 'lab', 'stok', 'pengaturan', 'kelolaObat', 'logs', 'appointments',
    'analytics', 'finance', 'kelola-pasien', 'kelola-appointment', 'kelola-jadwal',
    'docboard', 'kelola-tindakan', 'kelola-pengumuman', 'voting',
    'penjualan-obat', 'bulk-upload-usg', 'medify-sync', 'patient-block-list',
    'booking-settings', 'birth-class', 'import-fields', 'profile', 'kantor-saya'
  ]);
  var knownErrorTypes = new Set(['window_error', 'unhandled_rejection', 'handled_error', 'error']);

  // --- Web Vitals via PerformanceObserver ---

  function observeWebVital(type, callback) {
    try {
      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        if (entries.length) callback(entries);
      });
      po.observe({ type: type, buffered: true });
    } catch (e) {
      // Observer not supported for this type
    }
  }

  // LCP - use the last reported entry
  observeWebVital('largest-contentful-paint', function (entries) {
    var last = entries[entries.length - 1];
    metrics.lcp = Math.round(last.startTime);
    hasPendingData = true;
  });

  // INP - track longest interaction duration
  observeWebVital('event', function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var duration = entries[i].duration;
      if (!metrics.inp || duration > metrics.inp) {
        metrics.inp = Math.round(duration);
        hasPendingData = true;
      }
    }
  });

  // CLS - accumulate layout shift scores (exclude recent input)
  var clsValue = 0;
  observeWebVital('layout-shift', function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].hadRecentInput) {
        clsValue += entries[i].value;
      }
    }
    metrics.cls = Math.round(clsValue * 1000) / 1000;
    hasPendingData = true;
  });

  // --- Page Load Milestones ---

  function captureLoadTimings() {
    var perf = performance;

    // Navigation timing
    var nav = perf.getEntriesByType && perf.getEntriesByType('navigation')[0];
    if (nav) {
      metrics.domContentLoaded = Math.round(nav.domContentLoadedEventEnd);
      metrics.load = Math.round(nav.loadEventEnd);
    } else if (perf.timing) {
      var t = perf.timing;
      metrics.domContentLoaded = t.domContentLoadedEventEnd - t.navigationStart;
      metrics.load = t.loadEventEnd - t.navigationStart;
    }

    // Paint timings
    var paints = perf.getEntriesByType ? perf.getEntriesByType('paint') : [];
    for (var i = 0; i < paints.length; i++) {
      if (paints[i].name === 'first-paint') {
        metrics.firstPaint = Math.round(paints[i].startTime);
      } else if (paints[i].name === 'first-contentful-paint') {
        metrics.firstContentfulPaint = Math.round(paints[i].startTime);
      }
    }

    if (metrics.domContentLoaded || metrics.firstPaint) {
      hasPendingData = true;
    }
  }

  window.addEventListener('load', function () {
    setTimeout(captureLoadTimings, 100);
  });

  // --- API Call Tracking ---

  // Only route families verified in server.js may become metric bucket names.
  // An arbitrary first segment can itself be a patient identifier.
  var knownApiFamilies = new Set([
    'auth', 'patients', 'patient', 'visits', 'medical-exams', 'appointments',
    'sunday-appointments', 'hospital-appointments', 'dashboard-stats',
    'sunday-clinic', 'lab-results', 'usg-photos', 'usg-bulk-upload',
    'patient-documents', 'practice-schedules', 'pdf', 'notifications',
    'analytics', 'billings', 'patient-billing', 'announcements',
    'staff-announcements', 'role-visibility', 'inventory', 'articles',
    'community-chat', 'support-chat', 'rum', 'registration-codes',
    'patient-notifications', 'medical-import', 'medify-batch', 'integration'
  ]);

  function normalizeApiPath(endpoint) {
    try {
      var parsed = new URL(endpoint, window.location.origin);
      var segments = parsed.pathname.split('/').filter(Boolean);
      if (segments[0] !== 'api' || !knownApiFamilies.has(segments[1] || '')) return '/other';
      return '/api/' + segments[1] + (segments.length > 2 ? '/:path' : '');
    } catch (e) {
      return '/unknown';
    }
  }

  function trackApiCall(endpoint, durationMs, status) {
    // Store a canonical pathname only; never keep origin, query, or identifiers.
    var clean = normalizeApiPath(endpoint);
    apiCalls.push({
      endpoint: clean,
      duration: Math.round(durationMs),
      status: status,
      ts: Date.now()
    });
    if (apiCalls.length > API_BUFFER_SIZE) {
      apiCalls.shift();
    }
    hasPendingData = true;
  }

  function trackCachedActivation(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    metrics.cachedActivation = Math.round(durationMs);
    hasPendingData = true;
  }

  // --- Sanitized client error tracking ---

  function scrubErrorText(value) {
    // Error prose may contain names or clinical context that regexes cannot catch.
    return 'Client error';
  }

  function stableHash(value) {
    var hash = 2166136261;
    var input = String(value || '');
    for (var i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function trackError(error, type) {
    var safeType = knownErrorTypes.has(type) ? type : 'error';
    clientErrors.push({
      type: safeType,
      message: scrubErrorText(error),
      fingerprint: stableHash(safeType),
      ts: Date.now()
    });
    if (clientErrors.length > ERROR_BUFFER_SIZE) clientErrors.shift();
    hasPendingData = true;
  }

  window.addEventListener('error', function (event) {
    trackError(event.error || event.message, 'window_error');
  });

  window.addEventListener('unhandledrejection', function (event) {
    trackError(event.reason, 'unhandled_rejection');
  });

  // --- Beacon / Send ---

  function buildPayload() {
    return {
      page: knownPageKeys.has(window.__currentPage) ? window.__currentPage : 'other',
      role: 'staff',
      ts: Date.now(),
      metrics: Object.assign({}, metrics),
      apiCalls: apiCalls.splice(0),
      errors: clientErrors.splice(0)
    };
  }

  function sendBeacon() {
    if (!hasPendingData) return;
    hasPendingData = false;

    var payload = JSON.stringify(buildPayload());

    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/rum', blob);
    } else {
      fetch('/api/rum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () { /* ignore */ });
    }
  }

  // Send on interval
  setInterval(sendBeacon, BEACON_INTERVAL);

  // Send when page is hidden (tab switch, close)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      sendBeacon();
    }
  });

  // --- Auto-instrument fetch for /api/* calls ---

  var _origFetch = window.fetch;
  window.fetch = function (url, opts) {
    var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    if (urlStr.indexOf('/api/') === -1 || urlStr.indexOf('/api/rum') !== -1) {
      return _origFetch.apply(this, arguments);
    }
    var t0 = performance.now();
    return _origFetch.apply(this, arguments).then(function (resp) {
      trackApiCall(urlStr, performance.now() - t0, resp.status);
      return resp;
    }).catch(function (err) {
      trackApiCall(urlStr, performance.now() - t0, 0);
      throw err;
    });
  };

  // --- Public API ---

  window.__rum = {
    trackApiCall: trackApiCall,
    trackError: trackError,
    trackCachedActivation: trackCachedActivation
  };

})();
