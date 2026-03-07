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
  var hasPendingData = false;
  var BEACON_INTERVAL = 30000;
  var API_BUFFER_SIZE = 50;

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

  function trackApiCall(endpoint, durationMs, status) {
    // Strip any patient identifiers from endpoint
    var clean = endpoint.replace(/\/\d+/g, '/:id').replace(/\?.*$/, '');
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

  // --- Beacon / Send ---

  function buildPayload() {
    return {
      page: window.__currentPage || 'unknown',
      role: window.__userRole || 'unknown',
      ts: Date.now(),
      metrics: Object.assign({}, metrics),
      apiCalls: apiCalls.splice(0)
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
    trackApiCall: trackApiCall
  };

})();
