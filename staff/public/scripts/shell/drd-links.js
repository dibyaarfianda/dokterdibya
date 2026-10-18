(function installStaffDrdLinks() {
    'use strict';
    if (window.__staffDrdLinksInstalled) return;
    window.__staffDrdLinksInstalled = true;

    // Preserve existing navigation, form controls and clinical drafts. A plain
    // anchor also retains the browser's normal unsaved-change protection.
    const excluded = [
        'a', 'button', 'input', 'textarea', 'select', 'option', 'label',
        'script', 'style', 'noscript', 'template', 'svg', 'canvas',
        '[contenteditable]', '[role="textbox"]', '[role="button"]',
        '[role="link"]', '[role="tab"]', '[role="menuitem"]',
        '[onclick]', '[data-toggle]', '[data-shell-action]', '[data-no-drd-link]'
    ].join(',');
    const candidate = /drd\d{4}/i;
    // Keep leading zeroes and support sequences beyond four digits. Invoice
    // suffixes (e.g. DRD0858-T01) are not part of the visit identifier.
    const identifiers = /(^|[^\p{L}\p{N}_])(DRD\d{4,})(?![\p{L}\p{N}_])/giu;

    function visitUrl(mrId) {
        const slug = mrId.toLowerCase();
        if (typeof window.buildSundayClinicAppUrl === 'function') {
            return window.buildSundayClinicAppUrl(slug, 'identitas');
        }
        const url = `/staff/public/index-adminlte.html?page=sunday-clinic&mr=${encodeURIComponent(slug)}&section=identitas`;
        return typeof window.buildMobileUrl === 'function' ? window.buildMobileUrl(url) : url;
    }

    function linkText(node) {
        const value = node.data;
        const matches = [...value.matchAll(identifiers)];
        if (!matches.length) return;
        const fragment = document.createDocumentFragment();
        let offset = 0;
        for (const match of matches) {
            const start = match.index + match[1].length;
            fragment.append(document.createTextNode(value.slice(offset, start)));
            const link = document.createElement('a');
            link.className = 'staff-drd-link';
            link.textContent = match[2];
            link.href = visitUrl(match[2]);
            link.title = `Buka rekam medis ${match[2].toUpperCase()}`;
            fragment.append(link);
            offset = start + match[2].length;
        }
        fragment.append(document.createTextNode(value.slice(offset)));
        node.replaceWith(fragment);
    }

    function scan(root) {
        if (!root.isConnected) return;
        const parent = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
        if (!parent?.closest || parent.closest(excluded) || parent.isContentEditable) return;
        if (root.nodeType === Node.TEXT_NODE) {
            if (candidate.test(root.data)) linkText(root);
            return;
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    return node.matches(excluded) || node.isContentEditable
                        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
                }
                return candidate.test(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        // Collect before replacing so TreeWalker never follows a removed node.
        const texts = [];
        while (walker.nextNode()) texts.push(walker.currentNode);
        texts.forEach(linkText);
    }

    function start() {
        scan(document.body);
        const pending = new Set();
        let scheduled = false;
        const observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'characterData') pending.add(record.target);
                else record.addedNodes.forEach(node => pending.add(node));
            }
            if (scheduled || !pending.size) return;
            scheduled = true;
            queueMicrotask(() => {
                scheduled = false;
                const roots = new Set(pending);
                pending.clear();
                // Only scan added/changed subtrees, once each; do not rescan the
                // entire Staff panel for every polling, chat or modal update.
                for (const root of roots) {
                    let ancestor = root.parentNode;
                    while (ancestor && !roots.has(ancestor)) ancestor = ancestor.parentNode;
                    if (!ancestor) scan(root);
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
