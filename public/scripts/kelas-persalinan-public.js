(function() {
    const API_BASE = '/api/birth-classes';
    const TOKEN_KEY = 'vps_auth_token';
    let sessionsCache = [];
    let currentProfile = null;

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        return date.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    function formatTime(value) {
        if (!value) return '-';
        return String(value).slice(0, 5);
    }

    function formatRupiah(value) {
        const amount = Number(value || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY) ||
            localStorage.getItem('patient_token') ||
            '';
    }

    function normalizeList(value) {
        const raw = String(value || '').trim();
        if (!raw) return [];
        return raw
            .split(/\n|;|\|/)
            .map(item => item.trim().replace(/^[-*]\s*/, ''))
            .filter(Boolean);
    }

    function listToHtml(value) {
        const items = normalizeList(value);
        if (!items.length) {
            return '<div class="session-meta">-</div>';
        }

        return `<ul class="session-list-items">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }

    function setMessage(text, type) {
        const el = document.getElementById('birth-class-public-message');
        if (!el) return;

        if (!text) {
            el.className = 'alert is-hidden';
            el.textContent = '';
            return;
        }

        el.className = `alert alert-${type || 'info'}`;
        el.textContent = text;
    }

    function setSubmitEnabled(enabled) {
        const submitBtn = document.getElementById('birth-class-public-submit-btn');
        if (!submitBtn) return;
        submitBtn.disabled = !enabled;
    }

    function renderProfileCard() {
        const profileEl = document.getElementById('birth-class-public-profile');
        if (!profileEl) return;

        if (!currentProfile) {
            profileEl.className = 'profile-card is-warning';
            profileEl.innerHTML = `
                <strong>Anda belum login.</strong><br>
                <span class="profile-muted">Silakan login dulu agar pendaftaran otomatis menggunakan data profil pasien.</span>
            `;
            setSubmitEnabled(false);
            return;
        }

        profileEl.className = 'profile-card is-ready';
        profileEl.innerHTML = `
            <strong>Data Profil Untuk Pendaftaran</strong><br>
            Nama: ${escapeHtml(currentProfile.full_name || currentProfile.fullname || '-')}<br>
            HP: ${escapeHtml(currentProfile.phone || '-')}<br>
            Email: ${escapeHtml(currentProfile.email || '-')}
        `;
        setSubmitEnabled(true);
    }

    function renderSessionList() {
        const listEl = document.getElementById('birth-class-session-list');
        if (!listEl) return;

        if (!sessionsCache.length) {
            listEl.innerHTML = '<div class="session-list-empty">Belum ada jadwal kelas yang aktif.</div>';
            return;
        }

        listEl.innerHTML = sessionsCache.map(session => {
            const quotaChip = `<span class="session-chip">Kuota ${session.registered_count}/${session.quota} (sisa ${session.available_slots})</span>`;
            const notesBlock = session.notes
                ? `<div class="session-section-title">Catatan Tambahan</div><div class="session-meta">${escapeHtml(session.notes)}</div>`
                : '';

            return `
                <article class="session-card">
                    <div class="session-card-head">
                        <div>
                            <div class="session-title">${escapeHtml(session.class_title || '-')}</div>
                            <div class="session-meta">${formatDate(session.session_date)} • ${formatTime(session.start_time)}${session.end_time ? ` - ${formatTime(session.end_time)}` : ''}</div>
                            <div class="session-meta">${escapeHtml(session.location || '-')} • ${escapeHtml(session.instructor_name || 'Tim Dokter Dibya')}</div>
                        </div>
                        <div class="session-price">${formatRupiah(session.price)}</div>
                    </div>
                    ${quotaChip}

                    <div class="session-section-title">Apa yang Dipelajari</div>
                    ${listToHtml(session.learning_points)}

                    <div class="session-section-title">Yang Harus Dibawa</div>
                    ${listToHtml(session.items_to_bring)}

                    <div class="session-section-title">Benefit Peserta</div>
                    ${listToHtml(session.benefits)}

                    ${notesBlock}
                </article>
            `;
        }).join('');
    }

    function renderSessionSelect() {
        const select = document.getElementById('birth-class-public-session-id');
        if (!select) return;

        if (!sessionsCache.length) {
            select.innerHTML = '<option value="">Belum ada jadwal tersedia</option>';
            return;
        }

        select.innerHTML = '<option value="">Pilih sesi kelas</option>' + sessionsCache.map(session => {
            const label = `${formatDate(session.session_date)} • ${formatTime(session.start_time)} • ${session.class_title} • ${formatRupiah(session.price)} • sisa ${session.available_slots}`;
            return `<option value="${session.id}">${escapeHtml(label)}</option>`;
        }).join('');
    }

    async function loadProfile() {
        const token = getToken();
        if (!token) {
            currentProfile = null;
            renderProfileCard();
            return;
        }

        try {
            const response = await fetch('/api/patients/profile', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Gagal memuat profil pasien');
            }

            const result = await response.json().catch(() => ({}));
            currentProfile = result.user || result.patient || result.data || null;
        } catch (error) {
            console.error('Error loading patient profile:', error);
            currentProfile = null;
            setMessage('Tidak bisa memuat data profil. Silakan login ulang.', 'warning');
        }

        renderProfileCard();
    }

    async function fetchSessions() {
        const select = document.getElementById('birth-class-public-session-id');
        if (!select) return;

        select.innerHTML = '<option value="">Memuat jadwal...</option>';
        const listEl = document.getElementById('birth-class-session-list');
        if (listEl) {
            listEl.innerHTML = '<div class="session-list-empty">Memuat detail kelas...</div>';
        }

        try {
            const response = await fetch(`${API_BASE}/sessions/public`);
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal memuat jadwal kelas');
            }

            sessionsCache = result.data || [];
            renderSessionList();
            renderSessionSelect();
        } catch (error) {
            console.error('Error loading public sessions:', error);
            select.innerHTML = '<option value="">Gagal memuat jadwal</option>';
            sessionsCache = [];
            renderSessionList();
            setMessage(error.message, 'danger');
        }
    }

    async function submitRegistration(event) {
        event.preventDefault();
        setMessage('', 'info');

        const submitBtn = document.getElementById('birth-class-public-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Mengirim...</span>';
        }

        const token = getToken();
        if (!token) {
            setMessage('Silakan login terlebih dahulu untuk mendaftar kelas.', 'warning');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>Daftar Dengan Data Profil</span>';
            }
            return;
        }

        const payload = {
            session_id: Number(document.getElementById('birth-class-public-session-id')?.value || 0),
            notes: document.getElementById('birth-class-public-notes')?.value?.trim() || null
        };

        if (!payload.session_id) {
            setMessage('Pilih sesi kelas terlebih dahulu.', 'warning');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>Daftar Dengan Data Profil</span>';
            }
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Pendaftaran gagal');
            }

            setMessage(result.message || 'Pendaftaran berhasil.', 'success');
            document.getElementById('birth-class-public-form')?.reset();
            await loadProfile();
            await fetchSessions();
        } catch (error) {
            console.error('Error submitting registration:', error);
            setMessage(error.message, 'danger');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>Daftar Dengan Data Profil</span>';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        loadProfile();
        fetchSessions();
        document.getElementById('birth-class-public-form')?.addEventListener('submit', submitRegistration);
        document.getElementById('birth-class-public-refresh')?.addEventListener('click', function() {
            Promise.all([loadProfile(), fetchSessions()]);
        });
    });
})();
