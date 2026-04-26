(function() {
    const API_BASE = '/api/birth-classes';

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

    function setMessage(text, type) {
        const el = document.getElementById('birth-class-public-message');
        if (!el) return;

        if (!text) {
            el.style.display = 'none';
            el.className = 'alert';
            el.textContent = '';
            return;
        }

        el.style.display = '';
        el.className = `alert alert-${type || 'info'}`;
        el.textContent = text;
    }

    async function fetchSessions() {
        const select = document.getElementById('birth-class-public-session-id');
        if (!select) return;

        select.innerHTML = '<option value="">Memuat jadwal...</option>';

        try {
            const response = await fetch(`${API_BASE}/sessions/public`);
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal memuat jadwal kelas');
            }

            const sessions = result.data || [];
            if (!sessions.length) {
                select.innerHTML = '<option value="">Belum ada jadwal tersedia</option>';
                return;
            }

            select.innerHTML = '<option value="">Pilih sesi kelas</option>' + sessions.map(session => {
                const label = `${formatDate(session.session_date)} • ${String(session.start_time || '').slice(0, 5)} • ${session.class_title} • Sisa ${session.available_slots}`;
                return `<option value="${session.id}">${escapeHtml(label)}</option>`;
            }).join('');
        } catch (error) {
            console.error('Error loading public sessions:', error);
            select.innerHTML = '<option value="">Gagal memuat jadwal</option>';
            setMessage(error.message, 'danger');
        }
    }

    async function submitRegistration(event) {
        event.preventDefault();
        setMessage('', 'info');

        const submitBtn = document.getElementById('birth-class-public-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengirim...';
        }

        const payload = {
            session_id: Number(document.getElementById('birth-class-public-session-id')?.value || 0),
            patient_name: document.getElementById('birth-class-public-name')?.value?.trim(),
            phone: document.getElementById('birth-class-public-phone')?.value?.trim(),
            email: document.getElementById('birth-class-public-email')?.value?.trim() || null,
            due_date: document.getElementById('birth-class-public-due-date')?.value || null,
            gestational_weeks: document.getElementById('birth-class-public-weeks')?.value || null,
            notes: document.getElementById('birth-class-public-notes')?.value?.trim() || null
        };

        if (!payload.session_id || !payload.patient_name || !payload.phone) {
            setMessage('Pilih sesi, isi nama, dan nomor HP terlebih dahulu.', 'warning');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa fa-paper-plane"></i> Daftar Sekarang';
            }
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Pendaftaran gagal');
            }

            setMessage(result.message || 'Pendaftaran berhasil.', 'success');
            document.getElementById('birth-class-public-form')?.reset();
            await fetchSessions();
        } catch (error) {
            console.error('Error submitting registration:', error);
            setMessage(error.message, 'danger');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa fa-paper-plane"></i> Daftar Sekarang';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        fetchSessions();
        document.getElementById('birth-class-public-form')?.addEventListener('submit', submitRegistration);
        document.getElementById('birth-class-public-refresh')?.addEventListener('click', function() {
            fetchSessions();
        });
    });
})();
