/* Visible text fields use the display contract; native controls retain ISO values and validation. */
(function () {
    'use strict';
    if (window.__dibyaDateInputs) return;
    window.__dibyaDateInputs = true;
    const selector = 'input[type="date"],input[type="time"],input[type="datetime-local"]';
    const valueProperty = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const controls = new WeakMap();
    let closeActivePicker = null;

    function openTimePicker(input, button) {
        closeActivePicker?.();
        if (input.disabled || input.readOnly || input.matches(':disabled')) return;
        const initialValue = input.value;
        const hasDate = input.type === 'datetime-local';
        const fallback = hasDate
            ? window.DibyaDateTime.toInputValue(window.DibyaDateTime.dateTime(new Date()), 'datetime-local')
            : window.DibyaDateTime.time(new Date());
        const value = initialValue || fallback;
        const [dateValue, clock] = hasDate ? value.split('T') : ['', value];
        const [hour, minute, second = '00'] = clock.split(':');
        const hasSeconds = clock.split(':').length > 2 || input.step === 'any' || (input.step && Number(input.step) % 60 !== 0);
        const dialog = document.createElement('dialog');
        dialog.dataset.dateTimePicker = '24';
        dialog.setAttribute('aria-label', hasDate ? 'Pilih tanggal dan jam (24 jam)' : 'Pilih jam (24 jam)');
        dialog.style.cssText = 'position:fixed!important;padding:20px!important;border:1px solid #cbd5e1!important;border-radius:12px!important;width:calc(100% - 32px)!important;max-width:400px!important;max-height:560px!important;overflow:auto!important;background:#fff!important;color:#1f2937!important;box-shadow:0 12px 40px #0004!important;';
        const heading = document.createElement('h3');
        heading.textContent = hasDate ? 'Pilih tanggal dan jam (24 jam)' : 'Pilih jam (24 jam)';
        heading.style.cssText = 'font-size:18px!important;margin:0 0 16px!important;color:inherit!important;';
        dialog.append(heading);
        let dateInput;
        if (hasDate) {
            const label = document.createElement('label');
            label.textContent = 'Tanggal';
            label.style.cssText = 'display:block!important;margin-bottom:16px!important;';
            dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.className = 'form-control';
            dateInput.setAttribute('aria-label', 'Tanggal pada pemilih jam');
            dateInput.dataset.pickerDate = '';
            dateInput.value = dateValue;
            if (input.min) dateInput.min = input.min.split('T')[0];
            if (input.max) dateInput.max = input.max.split('T')[0];
            label.append(dateInput);
            dialog.append(label);
        }
        const columns = document.createElement('div');
        columns.style.cssText = 'display:flex!important;gap:12px!important;';
        function wheel(part, title, length, selected) {
            const label = document.createElement('label');
            label.style.cssText = 'display:block!important;flex:1!important;min-width:0!important;';
            label.textContent = title;
            const select = document.createElement('select');
            select.size = 5;
            select.dataset.timePart = part;
            select.setAttribute('aria-label', title);
            select.style.cssText = 'display:block!important;width:100%!important;height:160px!important;margin-top:6px!important;border:1px solid #94a3b8!important;border-radius:6px!important;background:#fff!important;color:#111827!important;font-size:20px!important;text-align:center!important;overflow-y:auto!important;';
            for (let number = 0; number < length; number++) {
                const option = document.createElement('option');
                option.value = option.textContent = String(number).padStart(2, '0');
                option.style.cssText = 'padding:6px!important;';
                select.append(option);
            }
            select.value = selected;
            label.append(select);
            if (columns.childElementCount) {
                const separator = document.createElement('span');
                separator.dataset.timeSeparator = '';
                separator.textContent = ':';
                separator.setAttribute('aria-hidden', 'true');
                separator.style.cssText = 'align-self:center!important;padding-top:24px!important;font-size:24px!important;font-weight:600!important;';
                columns.append(separator);
            }
            columns.append(label);
            return select;
        }
        const hours = wheel('hour', 'Jam (00–23)', 24, hour);
        const minutes = wheel('minute', 'Menit', 60, minute);
        const seconds = hasSeconds ? wheel('second', 'Detik', 60, second) : null;
        dialog.append(columns);
        const error = document.createElement('p');
        error.dataset.pickerError = '';
        error.setAttribute('role', 'alert');
        error.style.cssText = 'color:#b91c1c!important;font-size:14px!important;margin:12px 0!important;';
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex!important;justify-content:flex-end!important;gap:10px!important;';
        function action(label, attribute) {
            const element = document.createElement('button');
            element.type = 'button';
            element.textContent = label;
            element.setAttribute(attribute, '');
            element.style.cssText = 'padding:8px 16px!important;border:1px solid #94a3b8!important;border-radius:6px!important;background:#fff!important;color:#1f2937!important;font:inherit!important;cursor:pointer!important;';
            actions.append(element);
            return element;
        }
        const cancel = action('Batal', 'data-picker-cancel');
        const apply = action('Terapkan', 'data-picker-apply');
        apply.style.setProperty('background', '#1d4ed8', 'important');
        apply.style.setProperty('color', '#fff', 'important');
        dialog.append(error, actions);
        function close() {
            if (dialog.open && dialog.close) dialog.close();
            dialog.remove();
            if (closeActivePicker === close) closeActivePicker = null;
            if (button.isConnected) button.focus();
        }
        closeActivePicker = close;
        cancel.addEventListener('click', close);
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        apply.addEventListener('click', () => {
            if (!input.isConnected || input.disabled || input.readOnly || input.matches(':disabled')) { close(); return; }
            if (input.value !== initialValue) { error.textContent = 'Nilai formulir telah berubah. Batal dan buka kembali pemilih jam.'; return; }
            const time = `${hours.value}:${minutes.value}${seconds ? ':' + seconds.value : ''}`;
            const candidate = hasDate ? `${dateInput.value}T${time}` : time;
            const probe = input.cloneNode(false);
            probe.value = candidate;
            if (!probe.value || !probe.validity.valid) {
                error.textContent = 'Tanggal atau jam tidak sesuai batas dan interval pada formulir.';
                return;
            }
            input.value = candidate;
            close();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        document.body.append(dialog);
        if (dialog.showModal) dialog.showModal();
        else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog'); dialog.style.setProperty('z-index', '10000'); }
        hours.focus();
    }

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
        button.setAttribute('aria-label', type === 'date' ? 'Pilih tanggal' : type === 'time' ? 'Pilih jam (24 jam)' : 'Pilih tanggal dan jam (24 jam)');
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
            if (type !== 'date') { openTimePicker(input, button); return; }
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
