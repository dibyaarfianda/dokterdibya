/**
 * Patient Page View Tracker
 * Fire-and-forget — tracks page visits for analytics.
 * Include this script in patient-facing HTML pages.
 */
(function() {
    var token = localStorage.getItem('vps_auth_token');
    if (!token) return;

    var pageName = document.title || location.pathname;

    fetch('/api/patients/track-page', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ page_name: pageName })
    }).catch(function() {});
})();
