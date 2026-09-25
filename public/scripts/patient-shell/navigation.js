export function bindPatientNavigation(actions, options = {}) {
    const root = options.root || document;
    const stopSelector = options.stopSelector || '[data-shell-stop-propagation]';
    const actionSelector = options.actionSelector || '[data-shell-action]';

    function handleAction(event) {
        const trigger = event.target.closest(actionSelector);
        const stopTarget = event.type === 'click' ? event.target.closest(stopSelector) : null;
        if (stopTarget && (!trigger || !stopTarget.contains(trigger))) {
            event.stopPropagation();
            return;
        }

        if (!trigger) return;

        const handler = actions[trigger.dataset.shellAction || ''];
        if (typeof handler !== 'function') return;

        if (event.type === 'click') event.preventDefault();
        handler(trigger, event);
    }

    ['click', 'input', 'change'].forEach(eventName => root.addEventListener(eventName, handleAction));
    return () => ['click', 'input', 'change'].forEach(eventName => root.removeEventListener(eventName, handleAction));
}
