/* Visible text fields use the display contract; native controls retain ISO values and validation. */
(function () {
    'use strict';
    if (window.__dibyaDateInputs) return;
    window.__dibyaDateInputs = true;
    const selector = 'input[type="date"],input[type="time"],input[type="datetime-local"]';
    const valueProperty = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const controls = new WeakMap();

    function enhance(input) {
        if (controls.has(input) || !input.parentNode) return;
        const type = input.type;
        const wrapper = document.createElement('span');
        wrapper.className = 'dibya-date-input';
        wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;min-width:0;max-width:100%;width:100%;';
        const text = document.createElement('input');
        text.type = 'text';
        // Do not copy application field classes/data attributes: serializers and
        // delegated clinical handlers must continue to see only the native field.
        text.className = ['dibya-date-text', ...Array.from(input.classList).filter(name => /^(form-control(?:-sm|-lg)?|input-sm|input-lg)$/.test(name))].join(' ');
        text.style.cssText = input.style.cssText;
        text.style.removeProperty('display');
        const computed = getComputedStyle(input);
        for (const name of ['font', 'color', 'background-color', 'border', 'border-radius', 'padding', 'height', 'min-height', 'box-sizing', 'line-height', 'text-align']) {
            text.style.setProperty(name, computed.getPropertyValue(name));
        }
        text.style.setProperty('padding-right', '2.25rem', 'important');
        text.style.setProperty('width', '100%', 'important');
        text.dataset.dateTimeDisplay = type;
        text.placeholder = type === 'date' ? 'DD-MM-YYYY' : type === 'time' ? 'HH:mm' : 'DD-MM-YYYY HH:mm';
        text.setAttribute('aria-label', input.getAttribute('aria-label') || input.labels?.[0]?.textContent.trim() || text.placeholder);
        text.autocomplete = 'off';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = type === 'time' ? '◷' : '▦';
        button.setAttribute('aria-label', type === 'time' ? 'Pilih jam (24 jam)' : 'Pilih tanggal');
        button.style.cssText = 'position:absolute;right:2px;top:2px;bottom:2px;width:2rem;border:0;background:transparent;color:inherit;cursor:pointer;';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.append(text, input, button);
        // Keep the native control focusable for required/min/max/step validation.
        input.style.setProperty('position', 'absolute', 'important');
        input.style.setProperty('opacity', '0', 'important');
        input.style.setProperty('width', '1px', 'important');
        input.style.setProperty('height', '1px', 'important');
        input.style.setProperty('pointer-events', 'none', 'important');
        input.tabIndex = -1;
        function sync() {
            text.value = window.DibyaDateTime.inputDisplay(valueProperty.get.call(input), type);
            text.disabled = input.disabled;
            text.readOnly = input.readOnly;
            text.required = input.required;
            text.setCustomValidity('');
            button.disabled = input.disabled || input.readOnly;
            wrapper.style.display = input.hidden || input.style.display === 'none' || input.classList.contains('d-none') ? 'none' : 'inline-flex';
        }
        controls.set(input, sync);
        for (const property of ['value', 'valueAsDate', 'valueAsNumber']) {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, property);
            Object.defineProperty(input, property, {
                configurable: true,
                get() { return descriptor.get.call(this); },
                set(value) { descriptor.set.call(this, value); sync(); }
            });
        }
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
        input.addEventListener('focus', () => text.focus());
        input.addEventListener('invalid', () => { text.setCustomValidity(input.validationMessage); text.focus(); });
        function commit(event) {
            event.stopPropagation();
            const value = window.DibyaDateTime.toInputValue(text.value.trim(), type);
            text.setCustomValidity(value === null ? `Gunakan format ${text.placeholder} yang valid.` : '');
            valueProperty.set.call(input, value === null ? '' : value);
            input.dispatchEvent(new Event(event.type, { bubbles: true }));
            // Preserve an incomplete edit until the user finishes typing.
            if (value === null) {
                text.value = draft;
                text.setCustomValidity(`Gunakan format ${text.placeholder} yang valid.`);
            }
        }
        let draft = '';
        for (const name of ['input', 'change']) text.addEventListener(name, event => { draft = text.value; commit(event); });
        button.addEventListener('click', () => {
            try { if (input.showPicker) input.showPicker(); else input.click(); }
            catch (_) { text.focus(); }
        });
        input.form?.addEventListener('reset', () => queueMicrotask(sync));
        new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled', 'readonly', 'required', 'min', 'max', 'step', 'value', 'hidden', 'class', 'style'] });
        sync();
    }

    function scan(root) {
        if (root.matches?.(selector)) enhance(root);
        root.querySelectorAll?.(selector).forEach(enhance);
    }
    function start() {
        scan(document);
        new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
        }).observe(document.documentElement, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
