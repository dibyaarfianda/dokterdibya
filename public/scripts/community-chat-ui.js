export function badgeLabel(count) {
    return count > 0 ? (count > 99 ? '99+' : String(count)) : '';
}

export function shiftMentions(previous, next, mentions) {
    let start = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
    let oldEnd = previous.length, newEnd = next.length;
    while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
    const delta = next.length - previous.length;
    return mentions.flatMap(item => {
        if (item.end <= start) return [{ ...item }];
        if (item.start >= oldEnd) return [{ ...item, start: item.start + delta, end: item.end + delta }];
        return [];
    });
}

export function communityName(message) {
    const name = String(message.sender_nickname || (message.sender_type === 'staff' ? message.sender_name : '') || '').trim();
    return name && !name.includes('@') ? name : (message.sender_type === 'staff' ? 'Staf' : 'Anggota');
}

export function createMentionComposer({ input, menu, getRoom, getMembers, escapeHtml }) {
    let previous = input.value, mentions = [], members = [], room = null, loading = null;
    let options = [], selected = 0, active = null, generation = 0;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', menu.id);
    menu.setAttribute('role', 'listbox');

    function close() {
        active = null;
        menu.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }
    function reconcile() {
        mentions = shiftMentions(previous, input.value, mentions);
        previous = input.value;
    }
    function token() {
        if (input.selectionStart !== input.selectionEnd) return null;
        const end = input.selectionStart;
        const match = input.value.slice(0, end).match(/(?:^|\s)@([^@\n]{0,40})$/u);
        if (!match) return null;
        const start = end - match[1].length - 1;
        if (mentions.some(item => item.start === start)) return null;
        return { start, end, query: match[1].toLocaleLowerCase() };
    }
    function render() {
        const opening = menu.hidden;
        menu.hidden = false;
        if (opening) animateChatNode(menu);
        input.setAttribute('aria-expanded', 'true');
        menu.innerHTML = options.length ? options.map((member, index) => {
            const avatar = member.avatar_url
                ? '<img alt="" src="' + escapeHtml(member.avatar_url) + '">'
                : '<span class="mention-avatar">' + escapeHtml(member.display_name.slice(0, 1)) + '</span>';
            return '<button type="button" role="option" id="mention-option-' + index + '" data-index="' + index +
                '" aria-selected="' + (index === selected) + '">' + avatar + '<span>' + escapeHtml(member.display_name) +
                '<small>' + (member.user_type === 'staff' ? 'Staf' : 'Anggota') + '</small></span></button>';
        }).join('') : '<div class="mention-empty">Tidak ada anggota yang cocok</div>';
        if (options.length) {
            input.setAttribute('aria-activedescendant', 'mention-option-' + selected);
            menu.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
        } else input.removeAttribute('aria-activedescendant');
    }
    async function update() {
        reconcile();
        const current = token();
        if (!current || !getRoom()) { close(); return; }
        const slug = getRoom();
        if (room !== slug) { room = slug; members = []; loading = null; generation++; }
        const version = ++generation;
        active = current;
        if (!members.length) {
            const opening = menu.hidden;
            menu.hidden = false;
            if (opening) animateChatNode(menu);
            menu.innerHTML = '<div class="mention-empty">Memuat anggota...</div>';
            try {
                loading = loading || getMembers(slug);
                const result = await loading;
                if (version !== generation || slug !== getRoom()) return;
                members = result.map(item => ({ ...item, display_name: communityName({ sender_nickname: item.display_name, sender_type: item.user_type }) }));
            } catch (_) {
                if (version !== generation) return;
                menu.innerHTML = '<div class="mention-empty">Anggota belum bisa dimuat. Ketik kembali untuk mencoba.</div>';
                loading = null;
                return;
            }
        }
        if (version !== generation) return;
        active = token();
        if (!active) { close(); return; }
        options = members.filter(item => item.display_name.toLocaleLowerCase().includes(active.query)).slice(0, 12);
        selected = 0;
        render();
    }
    function choose(index) {
        if (!active || !options[index]) return;
        const member = options[index];
        const label = '@' + member.display_name;
        const start = active.start;
        input.setRangeText(label + ' ', start, active.end, 'end');
        reconcile();
        mentions.push({ user_id: String(member.user_id), user_type: member.user_type, start, end: start + label.length });
        close();
        input.focus({ preventScroll: true });
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.addEventListener('input', update);
    input.addEventListener('click', update);
    input.addEventListener('keydown', event => {
        if (event.isComposing || menu.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            if (options.length) { selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length; render(); }
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (options.length) choose(selected);
        }
    });
    menu.addEventListener('pointerdown', event => event.preventDefault());
    menu.addEventListener('click', event => {
        const button = event.target.closest('[data-index]');
        if (button) choose(Number(button.dataset.index));
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
    close();
    return {
        invalidateMembers() { members = []; loading = null; generation++; },
        reset() { generation++; previous = input.value; mentions = []; members = []; loading = null; room = null; close(); },
        payload() {
            reconcile();
            const leading = input.value.length - input.value.trimStart().length;
            const message = input.value.trim();
            return { message, mentions: mentions.filter(item => item.start >= leading && item.end <= leading + message.length)
                .map(item => ({ ...item, start: item.start - leading, end: item.end - leading })) };
        }
    };
}

export function animateChatNode(node) {
    if (!node?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    node.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 190, easing: 'cubic-bezier(.22,.61,.36,1)' });
}
