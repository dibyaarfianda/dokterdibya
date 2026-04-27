(function() {
    'use strict';

    const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api'
        : 'https://dokterdibya.com/api';

    let socket = null;
    let currentPoll = null;
    let initialized = false;
    let submittingVote = false;
    let submittingComment = false;
    let commentSortMode = 'recent';
    const pendingLikeCommentIds = new Set();

    function getToken() {
        return localStorage.getItem('vps_auth_token') ||
            sessionStorage.getItem('vps_auth_token') ||
            localStorage.getItem('patient_token');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text || '');
        return div.innerHTML;
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async function parseApiResult(response) {
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            return response.json();
        }

        const rawText = await response.text();
        const isHtml = /<\s*html|<\s*!doctype/i.test(rawText);
        if (!response.ok) {
            if (response.status >= 502 && response.status <= 504) {
                return {
                    success: false,
                    message: 'Server sedang sibuk. Silakan coba lagi beberapa detik.'
                };
            }

            return {
                success: false,
                message: isHtml
                    ? 'Respons server tidak valid. Silakan refresh halaman lalu coba lagi.'
                    : `Gagal memproses permintaan (HTTP ${response.status})`
            };
        }

        return {
            success: false,
            message: isHtml
                ? 'Respons server tidak valid. Silakan refresh halaman lalu coba lagi.'
                : 'Respons server tidak valid'
        };
    }

    function ensureModal() {
        if (document.getElementById('patient-voting-modal')) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'patient-voting-modal';
        wrapper.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);';
        wrapper.innerHTML = `
            <div style="max-width:520px;margin:8vh auto;background:#111;border:1px solid #333;border-radius:14px;color:#eee;box-shadow:0 20px 45px rgba(0,0,0,.45);overflow:hidden;">
                <div style="padding:14px 16px;border-bottom:1px solid #2a2a2a;display:flex;justify-content:space-between;align-items:center;">
                    <strong style="font-size:16px;"><i class="fa fa-bar-chart"></i> Voting Pasien</strong>
                    <button type="button" id="patient-voting-close" style="background:transparent;border:0;color:#bbb;font-size:20px;line-height:1;cursor:pointer;">&times;</button>
                </div>
                <div id="patient-voting-content" style="padding:16px;"></div>
            </div>
        `;

        document.body.appendChild(wrapper);

        const closeBtn = document.getElementById('patient-voting-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideModal);
        }

        wrapper.addEventListener('click', function(event) {
            if (event.target === wrapper) hideModal();
        });
    }

    function showModal() {
        ensureModal();
        const modal = document.getElementById('patient-voting-modal');
        if (modal) modal.style.display = 'block';
    }

    function hideModal() {
        const modal = document.getElementById('patient-voting-modal');
        if (modal) modal.style.display = 'none';
    }

    function renderOptions(options, selectedOptionId) {
        return (options || []).map((option) => {
            const checked = selectedOptionId === option.id;
            return `
                <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #2f2f2f;border-radius:10px;margin-bottom:8px;cursor:pointer;">
                    <input type="radio" name="patient-voting-option" value="${option.id}" ${checked ? 'checked' : ''} style="margin-top:3px;">
                    <span>${escapeHtml(option.option_text)}</span>
                </label>
            `;
        }).join('');
    }

    function renderResults(options, totalVotes) {
        return (options || []).map((option) => {
            const percent = Number(option.vote_percent || 0);
            return `
                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                        <span>${escapeHtml(option.option_text)}</span>
                        <strong>${percent.toFixed(2)}%</strong>
                    </div>
                    <div style="height:7px;background:#2b2b2b;border-radius:7px;overflow:hidden;">
                        <div style="height:100%;width:${Math.min(100, Math.max(0, percent))}%;background:linear-gradient(90deg,#f59e0b,#f97316);"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function sortComments(comments, mode) {
        const rows = Array.isArray(comments) ? comments.slice() : [];
        if (mode === 'popular') {
            rows.sort((a, b) => {
                const likeA = Number((a && a.like_count) || 0);
                const likeB = Number((b && b.like_count) || 0);
                if (likeB !== likeA) {
                    return likeB - likeA;
                }

                const dateA = new Date(a && a.created_at).getTime();
                const dateB = new Date(b && b.created_at).getTime();
                return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
            });
            return rows;
        }

        rows.sort((a, b) => {
            const dateA = new Date(a && a.created_at).getTime();
            const dateB = new Date(b && b.created_at).getTime();
            return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
        });
        return rows;
    }

    function renderCommentSortControls(mode) {
        const isRecent = mode !== 'popular';
        return `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                <button
                    type="button"
                    class="btn-comment-sort"
                    data-sort="recent"
                    style="border:1px solid ${isRecent ? 'rgba(245,158,11,.65)' : 'rgba(255,255,255,.15)'};background:${isRecent ? 'rgba(245,158,11,.15)' : 'transparent'};color:${isRecent ? '#f4d392' : '#bdbdbd'};font-size:11px;border-radius:999px;padding:4px 10px;cursor:pointer;"
                >
                    Terbaru
                </button>
                <button
                    type="button"
                    class="btn-comment-sort"
                    data-sort="popular"
                    style="border:1px solid ${!isRecent ? 'rgba(245,158,11,.65)' : 'rgba(255,255,255,.15)'};background:${!isRecent ? 'rgba(245,158,11,.15)' : 'transparent'};color:${!isRecent ? '#f4d392' : '#bdbdbd'};font-size:11px;border-radius:999px;padding:4px 10px;cursor:pointer;"
                >
                    Terbanyak Like
                </button>
            </div>
        `;
    }

    function renderComments(comments) {
        const rows = Array.isArray(comments) ? comments : [];
        if (!rows.length) {
            return '<div style="font-size:12px;color:#aaa;">Belum ada komentar.</div>';
        }

        const sortedRows = sortComments(rows, commentSortMode);

        return sortedRows.map((comment) => `
            <div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <strong style="font-size:12px;color:#f4d392;">${escapeHtml(comment.commenter_name || 'P*****')}</strong>
                    <small style="color:#8f8f8f;">${formatDate(comment.created_at)}</small>
                </div>
                <div style="font-size:13px;color:#e4e4e4;margin-top:6px;line-height:1.45;">${escapeHtml(comment.comment_text || '')}</div>
                <button type="button" class="btn-comment-like" data-comment-id="${comment.id}" style="margin-top:8px;background:transparent;border:0;color:${comment.liked_by_me ? '#f59e0b' : '#9a9a9a'};font-size:12px;padding:0;cursor:pointer;">
                    <i class="fa ${comment.liked_by_me ? 'fa-heart' : 'fa-heart-o'}"></i>
                    <span style="margin-left:4px;">Like${Number(comment.like_count || 0) > 0 ? ' (' + Number(comment.like_count || 0) + ')' : ''}</span>
                </button>
            </div>
        `).join('');
    }

    function renderCommentComposer(data) {
        if (!data || !data.id) return '';
        return `
            <div style="margin-top:12px;">
                <label style="display:block;font-size:12px;color:#bbb;margin-bottom:6px;">Komentar</label>
                <textarea id="patient-voting-comment" rows="3" maxlength="800" placeholder="Tulis komentar Anda..." style="width:100%;background:#1a1a1a;color:#eee;border:1px solid #333;border-radius:8px;padding:10px;font-size:13px;resize:vertical;"></textarea>
                <button type="button" class="js-voting-comment-submit" style="margin-top:8px;background:#f59e0b;border:0;color:#111;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer;">
                    Kirim Komentar
                </button>
            </div>
        `;
    }

    function bindCommentActions() {
        document.querySelectorAll('.btn-comment-sort').forEach((button) => {
            button.addEventListener('click', function() {
                const mode = this.getAttribute('data-sort') === 'popular' ? 'popular' : 'recent';
                if (commentSortMode === mode) return;
                commentSortMode = mode;
                renderVotingCard(currentPoll);
                renderPollContent(currentPoll, false, false);
            });
        });

        document.querySelectorAll('.js-voting-comment-submit').forEach((button) => {
            button.addEventListener('click', submitComment);
        });

        document.querySelectorAll('.btn-comment-like').forEach((button) => {
            button.addEventListener('click', function() {
                const commentId = Number(this.getAttribute('data-comment-id'));
                if (Number.isInteger(commentId) && commentId > 0) {
                    toggleCommentLike(commentId);
                }
            });
        });
    }

    function renderPollBlock(data, mode) {
        if (!data) {
            return `
                <div style="text-align:center;color:#bbb;padding:14px;">
                    <i class="fa fa-info-circle" style="font-size:24px;margin-bottom:8px;"></i>
                    <p style="margin:0;">Saat ini belum ada voting aktif.</p>
                </div>
            `;
        }

        const hasVoted = !!data.has_voted;
        const showVoteForm = !hasVoted;
        const wrapTop = mode === 'card' ? '0' : '0';

        return `
            <h4 style="margin:${wrapTop} 0 8px 0;font-size:17px;color:#fff;">${escapeHtml(data.title)}</h4>
            ${data.description ? `<p style="margin:0 0 12px 0;color:#bdbdbd;font-size:13px;">${escapeHtml(data.description)}</p>` : ''}
            ${showVoteForm ? `
                <div id="patient-voting-options-wrap">${renderOptions(data.options, null)}</div>
                <button type="button" class="js-voting-submit" style="width:100%;margin-top:8px;background:#f59e0b;border:0;color:#111;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer;">
                    Kirim Pilihan
                </button>
            ` : `
                <div style="background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);color:#a7f3d0;padding:10px 12px;border-radius:10px;margin-bottom:10px;">
                    Anda sudah memilih pada voting ini.
                </div>
            `}

            <div style="margin-top:10px;">
                ${renderResults(data.options, data.total_votes || 0)}
            </div>

            <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:12px;color:#d6d6d6;font-weight:700;margin-bottom:8px;">Komentar Pasien</div>
                <div style="font-size:11px;color:#9a9a9a;margin-bottom:8px;">Nama pada komentar disamarkan untuk menjaga privasi pasien.</div>
                ${renderCommentSortControls(commentSortMode)}
                <div id="patient-voting-comments-list">${renderComments(data.comments || [])}</div>
                ${renderCommentComposer(data)}
            </div>
        `;
    }

    function renderVotingCard(data) {
        const cardEl = document.getElementById('voting-card-container');
        if (!cardEl) return;

        if (!data) {
            cardEl.innerHTML = `
                <div style="text-align:center;color:#999;padding:14px;">
                    <i class="fa fa-info-circle" style="font-size:22px;"></i>
                    <p style="margin-top:8px;">Belum ada voting aktif.</p>
                </div>
            `;
            return;
        }

        cardEl.style.textAlign = 'left';
        cardEl.style.padding = '0';
        cardEl.innerHTML = `
            <div style="padding:14px 12px;">
                ${renderPollBlock(data, 'card')}
            </div>
        `;

        document.querySelectorAll('.js-voting-submit').forEach((button) => {
            button.addEventListener('click', submitVote);
        });
        bindCommentActions();
    }

    function renderPollContent(data, forceOpen, allowAutoOpen) {
        const contentEl = document.getElementById('patient-voting-content');
        if (!contentEl) return;

        if (!data) {
            contentEl.innerHTML = `
                <div style="text-align:center;color:#bbb;padding:14px;">
                    <i class="fa fa-info-circle" style="font-size:24px;margin-bottom:8px;"></i>
                    <p style="margin:0;">Saat ini belum ada voting aktif.</p>
                </div>
            `;
            if (forceOpen) showModal();
            return;
        }

        const hasVoted = !!data.has_voted;
        contentEl.innerHTML = renderPollBlock(data, 'modal');

        document.querySelectorAll('.js-voting-submit').forEach((button) => {
            button.addEventListener('click', submitVote);
        });
        bindCommentActions();

        if (forceOpen || ((allowAutoOpen !== false) && !hasVoted)) {
            showModal();
        }
    }

    async function loadActivePoll(forceOpen) {
        const token = getToken();
        if (!token) return;

        try {
            const response = await fetch(`${API_URL}/polls/patient/active?_t=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            const result = await response.json();

            if (!response.ok || !result.success) return;

            currentPoll = result.data;
            renderVotingCard(result.data);
            const showOnOpen = !!(result.data && result.data.show_on_open);
            renderPollContent(result.data, !!forceOpen, showOnOpen);

            if (!result.data) {
                return;
            }

            if (!result.data.show_on_open && !forceOpen) {
                return;
            }
        } catch (error) {
            // Silently fail to avoid blocking portal load
        }
    }

    async function submitVote() {
        if (!currentPoll || !currentPoll.id || submittingVote) return;

        const selected = document.querySelector('input[name="patient-voting-option"]:checked');
        if (!selected) {
            alert('Silakan pilih salah satu opsi terlebih dahulu.');
            return;
        }

        const optionId = Number(selected.value);
        if (!Number.isInteger(optionId)) {
            return;
        }

        const submitButtons = Array.from(document.querySelectorAll('.js-voting-submit'));
        submitButtons.forEach((button) => {
            button.disabled = true;
            button.textContent = 'Menyimpan...';
        });
        submittingVote = true;

        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/polls/patient/${currentPoll.id}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ option_id: optionId })
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal menyimpan pilihan');
            }

            currentPoll = result.data;
            renderVotingCard(result.data);
            renderPollContent(result.data, true, true);
            if (typeof window.loadNotificationCount === 'function') {
                window.loadNotificationCount();
            }
        } catch (error) {
            alert(error.message || 'Gagal menyimpan pilihan');
            submitButtons.forEach((button) => {
                button.disabled = false;
                button.textContent = 'Kirim Pilihan';
            });
        } finally {
            submittingVote = false;
        }
    }

    async function submitComment() {
        if (!currentPoll || !currentPoll.id || submittingComment) return;

        const textarea = document.getElementById('patient-voting-comment');
        if (!textarea) return;

        const comment = String(textarea.value || '').trim();
        if (!comment) {
            alert('Komentar tidak boleh kosong.');
            return;
        }

        const submitButtons = Array.from(document.querySelectorAll('.js-voting-comment-submit'));
        submitButtons.forEach((button) => {
            button.disabled = true;
            button.textContent = 'Mengirim...';
        });

        submittingComment = true;
        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/polls/patient/${currentPoll.id}/comment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ comment })
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal mengirim komentar');
            }

            currentPoll.comments = result.data || [];
            textarea.value = '';
            renderVotingCard(currentPoll);
            renderPollContent(currentPoll, false, false);
        } catch (error) {
            alert(error.message || 'Gagal mengirim komentar');
        } finally {
            submittingComment = false;
            submitButtons.forEach((button) => {
                button.disabled = false;
                button.textContent = 'Kirim Komentar';
            });
        }
    }

    async function toggleCommentLike(commentId) {
        if (!currentPoll || !currentPoll.id) return;
        if (pendingLikeCommentIds.has(commentId)) return;

        pendingLikeCommentIds.add(commentId);

        const previousComments = Array.isArray(currentPoll.comments) ? currentPoll.comments.slice() : [];
        const previousComment = previousComments.find((comment) => Number(comment.id) === Number(commentId));

        const attemptLikeRequest = async () => {
            const token = getToken();
            const response = await fetch(`${API_URL}/polls/patient/${currentPoll.id}/comments/${commentId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const result = await parseApiResult(response);
            if (!response.ok || !result.success) {
                const error = new Error(result.message || 'Gagal memproses like');
                error.status = response.status;
                throw error;
            }

            return result;
        };

        try {
            let result;
            try {
                result = await attemptLikeRequest();
            } catch (firstError) {
                if (firstError.status >= 502 && firstError.status <= 504) {
                    result = await attemptLikeRequest();
                } else {
                    throw firstError;
                }
            }

            currentPoll.comments = result.data || [];
            renderVotingCard(currentPoll);
            renderPollContent(currentPoll, false, false);
        } catch (error) {
            await loadActivePoll(false);

            const latestComments = Array.isArray(currentPoll && currentPoll.comments) ? currentPoll.comments : [];
            const latestComment = latestComments.find((comment) => Number(comment.id) === Number(commentId));

            const previousLikedByMe = !!(previousComment && previousComment.liked_by_me);
            const latestLikedByMe = !!(latestComment && latestComment.liked_by_me);
            const previousLikeCount = Number((previousComment && previousComment.like_count) || 0);
            const latestLikeCount = Number((latestComment && latestComment.like_count) || 0);

            const stateChanged = previousLikedByMe !== latestLikedByMe || previousLikeCount !== latestLikeCount;
            if (!stateChanged) {
                alert(error.message || 'Gagal memproses like');
            }
        } finally {
            pendingLikeCommentIds.delete(commentId);
        }
    }

    function setupSocket() {
        if (socket || typeof io === 'undefined') {
            return;
        }

        const socketUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://dokterdibya.com';

        socket = io(socketUrl, {
            transports: ['polling'],
            upgrade: false
        });

        socket.on('poll:created', () => loadActivePoll(true));
        socket.on('poll:voted', () => {
            if (currentPoll && currentPoll.id) {
                loadActivePoll(false);
            }
        });
        socket.on('poll:updated', () => {
            if (currentPoll && currentPoll.id) {
                loadActivePoll(false);
            }
        });
        socket.on('poll:closed', () => loadActivePoll(false));
        socket.on('poll:comment', () => {
            if (currentPoll && currentPoll.id) {
                loadActivePoll(false);
            }
        });
        socket.on('poll:comment-like', () => {
            if (currentPoll && currentPoll.id) {
                loadActivePoll(false);
            }
        });
    }

    function init() {
        if (initialized) {
            loadActivePoll(window.location.hash === '#voting');
            return;
        }

        initialized = true;
        ensureModal();
        setupSocket();

        setTimeout(() => {
            loadActivePoll(window.location.hash === '#voting');
        }, 800);

        window.addEventListener('hashchange', function() {
            if (window.location.hash === '#voting') {
                loadActivePoll(true);
            }
        });

        window.addEventListener('focus', function() {
            loadActivePoll(false);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
