let initialized = false;
let observer = null;

function stripLinks(container) {
    container.setAttribute('data-disable-links', '1');

    container.querySelectorAll('a').forEach(link => {
        link.removeAttribute('href');
        link.removeAttribute('target');
        link.removeAttribute('rel');
        link.setAttribute('tabindex', '-1');
    });

    container.querySelectorAll('[onclick]').forEach(element => {
        element.removeAttribute('onclick');
    });

    container.querySelectorAll('button').forEach(button => {
        button.setAttribute('type', 'button');
        button.setAttribute('tabindex', '-1');
    });
}

export function init() {
    const container = document.getElementById('announcements-container');
    if (!container) return;
    if (initialized) {
        stripLinks(container);
        return;
    }
    initialized = true;
    stripLinks(container);

    function blockInteraction(event) {
        const interactive = event.target?.closest?.('a, button, [onclick], .announcement-item');
        if (!interactive || !container.contains(interactive)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
    }

    container.addEventListener('click', blockInteraction, true);
    container.addEventListener('auxclick', blockInteraction, true);
    container.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') blockInteraction(event);
    }, true);

    observer = new MutationObserver(() => stripLinks(container));
    observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'onclick']
    });
}
