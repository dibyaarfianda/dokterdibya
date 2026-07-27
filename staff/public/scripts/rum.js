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

  function normalizeApiPath(endpoint) {
    try {
      var parsed = new URL(endpoint, window.location.origin);
      return parsed.pathname
        .replace(/\/\d+(?=\/|$)/g, '/:id')
        .replace(/\/[A-Za-z]{2,}\d+(?=\/|$)/g, '/:id')
        .replace(/\/[0-9a-fA-F-]{8,}(?=\/|$)/g, '/:id');
    } catch (e) {
      return String(endpoint || '/unknown').replace(/\?.*$/, '');
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

  // --- Sanitized client error tracking ---

  function scrubErrorText(value) {
    return String(value || 'Unknown client error')
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
      .replace(/https?:\/\/[^\s)]+/g, '[url]')
      .replace(/\b(?:DRD|P)\d{4,}\b/gi, '[record]')
      .replace(/\b\d{6,}\b/g, '[number]')
      .slice(0, 180);
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
    var source = error && typeof error === 'object' ? error : { message: error };
    var message = scrubErrorText(source.message || source.reason || source);
    var stackShape = String(source.stack || '')
      .split('\n')
      .slice(0, 4)
      .join('\n')
      .replace(/:\d+:\d+/g, ':#:#')
      .replace(/https?:\/\/[^\s)]+/g, '[url]');
    clientErrors.push({
      type: String(type || source.name || 'error').slice(0, 40),
      message: message,
      fingerprint: stableHash((source.name || type || 'error') + '|' + message + '|' + stackShape),
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
      page: window.__currentPage || 'unknown',
      role: window.__userRole || 'unknown',
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
    trackError: trackError
  };

})();
