import { getIdToken, hasPermission } from './vps-auth-v2.js';
import { showSuccess, showError, showWarning } from './toast.js';

const API_BASE = window.location.origin.replace(/\/$/, '');
const ENDPOINT = `${API_BASE}/api/email-settings`;

let initialized = false;

function getForm() {
    return document.getElementById('email-settings-form');
}

function getInput(id) {
    return document.getElementById(id);
}

function setFormDisabled(disabled) {
    const form = getForm();
    if (!form) return;

    form.querySelectorAll('input, textarea').forEach(el => {
        el.disabled = disabled;
    });
}

function setSavingState(isSaving, busyLabel = 'Menyimpan...') {
    const form = getForm();
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = isSaving;
        submitBtn.innerHTML = isSaving
            ? `<i class="fas fa-spinner fa-spin mr-2"></i>${busyLabel}`
            : 'Simpan Pengaturan';
    }

    form.querySelectorAll('input, textarea').forEach(el => {
        el.readOnly = isSaving;
    });
}

function collectPayload() {
    return {
        senderName: getInput('sender-name')?.value?.trim() || '',
        templates: {
            verification: {
                subject: getInput('verification-subject')?.value?.trim() || '',
                body: getInput('verification-body')?.value || ''
            },
            password_reset: {
                subject: getInput('reset-subject')?.value?.trim() || '',
                body: getInput('reset-body')?.value || ''
            },
            announcement: {
                subject: getInput('announcement-subject')?.value?.trim() || '',
                body: getInput('announcement-body')?.value || ''
            }
        }
    };
}

function populateForm(data) {
    if (!data) return;

    const { senderName, templates } = data;

    if (senderName !== undefined) {
        const senderInput = getInput('sender-name');
        if (senderInput) senderInput.value = senderName || '';
    }

    if (templates) {
        const verification = templates.verification || {};
        const reset = templates.password_reset || {};
        const announcement = templates.announcement || {};

        const fieldMap = [
            ['verification-subject', verification.subject],
            ['verification-body', verification.body],
            ['reset-subject', reset.subject],
            ['reset-body', reset.body],
            ['announcement-subject', announcement.subject],
            ['announcement-body', announcement.body]
        ];

        fieldMap.forEach(([id, value]) => {
            const input = getInput(id);
            if (input && value !== undefined) {
                input.value = value;
            }
        });
    }
}

async function loadEmailSettings() {
    const token = await getIdToken();
    if (!token) {
        showWarning('Sesi login berakhir. Silakan login ulang.');
        setFormDisabled(true);
        return;
    }

    setSavingState(true, 'Memuat...');

    try {
        const res = await fetch(ENDPOINT, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.status === 403) {
            setFormDisabled(true);
            showWarning('Anda tidak memiliki izin untuk melihat pengaturan email.');
            return;
        }

        if (!res.ok) {
            throw new Error(`Gagal memuat pengaturan email (status ${res.status})`);
        }

        const result = await res.json();
        if (!result.success) {
            throw new Error(result.message || 'Gagal memuat pengaturan email');
        }

        populateForm(result.data);
    } catch (error) {
        console.error('Failed to load email settings:', error);
        showError(error.message || 'Gagal memuat pengaturan email.');
    } finally {
        setSavingState(false);
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    const token = await getIdToken();
    if (!token) {
        showWarning('Sesi login berakhir. Silakan login ulang.');
        return;
    }

    const payload = collectPayload();

    if (!payload.senderName) {
        showWarning('Nama pengirim tidak boleh kosong.');
        return;
    }

    const missingTemplate = Object.entries(payload.templates).find(([, tpl]) => !tpl.subject || !tpl.body.trim());
    if (missingTemplate) {
        showWarning('Semua subject dan body template wajib diisi.');
        return;
    }

    setSavingState(true);

    try {
        const res = await fetch(ENDPOINT, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json().catch(() => ({ success: false, message: 'Gagal menyimpan pengaturan email.' }));

        if (!res.ok || !result.success) {
            throw new Error(result.message || `Gagal menyimpan pengaturan email (status ${res.status})`);
        }

        populateForm(result.data);
        showSuccess('Pengaturan email berhasil disimpan.');
    } catch (error) {
        console.error('Failed to save email settings:', error);
        showError(error.message || 'Gagal menyimpan pengaturan email.');
    } finally {
        setSavingState(false);
    }
}

async function initEmailSettings() {
    if (initialized) return;

    const form = getForm();
    if (!form) return;

    initialized = true;

    form.addEventListener('submit', handleSubmit);

    const allowed = await hasPermission('settings.system');
    if (!allowed) {
        showWarning('Anda tidak memiliki izin untuk mengubah pengaturan email.');
        setFormDisabled(true);
        return;
    }

    await loadEmailSettings();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmailSettings);
} else {
    initEmailSettings();
}
