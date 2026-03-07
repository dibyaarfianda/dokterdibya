/**
 * Tanya Dokter - Staff Panel JavaScript
 * Handles Q&A management for staff (view all, reply for dokter only)
 */

(function() {
    'use strict';

    // State
    let allQuestions = [];
    let currentFilter = 'all';
    let currentQuestionId = null;

    // ==================== PAGE FUNCTIONS ====================

    /**
     * Show Tanya Dokter page
     */
    window.showTanyaDokterPage = function() {
        if (typeof hideAllPages === 'function') hideAllPages();
        document.getElementById('tanya-dokter-page').classList.remove('d-none');
        if (typeof setActiveNav === 'function') setActiveNav('nav-tanya-dokter');
        if (typeof setPageTitle === 'function') setPageTitle('Tanya Dokter');
        loadTanyaDokterQuestions();
    };

    /**
     * Load all questions from backend
     */
    window.loadTanyaDokterQuestions = async function() {
        const token = getAuthToken();
        if (!token) return;

        const listContainer = document.getElementById('tanya-questions-list');
        listContainer.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                <p>Memuat pertanyaan...</p>
            </div>
        `;

        try {
            const response = await fetch('/api/patient-questions/staff/all', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to load questions');
            }

            const data = await response.json();

            if (data.success) {
                allQuestions = data.questions || [];
                updateTanyaStats();
                renderTanyaQuestions();
            } else {
                throw new Error(data.message || 'Failed to load questions');
            }
        } catch (error) {
            console.error('Error loading questions:', error);
            listContainer.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle mr-2"></i>
                    Gagal memuat pertanyaan: ${error.message}
                </div>
            `;
        }
    };

    /**
     * Update statistics cards
     */
    function updateTanyaStats() {
        const openCount = allQuestions.filter(q => q.status === 'open').length;
        const answeredCount = allQuestions.filter(q => q.status === 'answered').length;
        const closedCount = allQuestions.filter(q => q.status === 'closed').length;

        document.getElementById('tanya-stat-open').textContent = openCount;
        document.getElementById('tanya-stat-answered').textContent = answeredCount;
        document.getElementById('tanya-stat-closed').textContent = closedCount;
        document.getElementById('tanya-stat-total').textContent = allQuestions.length;

        // Update badge on tab
        const openBadge = document.getElementById('tanya-tab-open-badge');
        if (openBadge) {
            openBadge.textContent = openCount;
            openBadge.style.display = openCount > 0 ? 'inline' : 'none';
        }

        // Update sidebar badge
        const sidebarBadge = document.getElementById('badge-tanya-dokter');
        if (sidebarBadge) {
            sidebarBadge.textContent = openCount;
            if (openCount > 0) {
                sidebarBadge.classList.remove('d-none');
            } else {
                sidebarBadge.classList.add('d-none');
            }
        }
    }

    /**
     * Filter questions by status
     */
    window.filterTanyaQuestions = function(filter) {
        currentFilter = filter;

        // Update tab UI
        document.querySelectorAll('#tanya-tabs .nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.filter === filter) {
                link.classList.add('active');
            }
        });

        renderTanyaQuestions();
    };

    /**
     * Render questions list
     */
    function renderTanyaQuestions() {
        const listContainer = document.getElementById('tanya-questions-list');

        // Filter questions
        let filteredQuestions = allQuestions;
        if (currentFilter !== 'all') {
            filteredQuestions = allQuestions.filter(q => q.status === currentFilter);
        }

        if (filteredQuestions.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="fas fa-comments fa-3x mb-3" style="color: #ddd;"></i>
                    <p>Tidak ada pertanyaan ${currentFilter !== 'all' ? 'dengan status ini' : ''}</p>
                </div>
            `;
            return;
        }

        const statusColors = {
            'open': 'warning',
            'answered': 'info',
            'closed': 'success'
        };
        const statusLabels = {
            'open': 'Menunggu Jawaban',
            'answered': 'Sudah Dijawab',
            'closed': 'Selesai'
        };

        listContainer.innerHTML = filteredQuestions.map(q => {
            const date = new Date(q.created_at);
            const dateStr = date.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Show assigned doctor info
            const doctorName = q.doctor_name || 'Belum ditugaskan';
            const doctorSpecialty = q.doctor_specialty_label || '';

            return `
                <div class="card mb-2 tanya-question-card" onclick="openTanyaThreadModal('${q.id}')" style="cursor: pointer; transition: all 0.2s;">
                    <div class="card-body py-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <span class="badge badge-${statusColors[q.status]}">${statusLabels[q.status]}</span>
                                <small class="text-muted ml-2">${dateStr}</small>
                            </div>
                            <div class="text-right">
                                ${q.reply_count > 0 ? `<span class="badge badge-light mr-1"><i class="fas fa-reply"></i> ${q.reply_count}</span>` : ''}
                                <span class="badge badge-purple" style="background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white;" title="${doctorSpecialty}">
                                    <i class="fas fa-user-md"></i> ${escapeHtml(doctorName)}
                                </span>
                            </div>
                        </div>
                        <h6 class="mb-1 font-weight-bold text-primary">${escapeHtml(q.patient_name || 'Pasien')}</h6>
                        <p class="mb-0 text-dark" style="line-height: 1.5;">${escapeHtml(truncateText(q.question_text, 200))}</p>
                        ${q.image_url ? '<small class="text-muted"><i class="fas fa-image"></i> Ada lampiran gambar</small>' : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Open thread modal
     */
    window.openTanyaThreadModal = async function(questionId) {
        currentQuestionId = questionId;
        const token = getAuthToken();

        // Show modal with loading
        $('#tanyaThreadModal').modal('show');
        document.getElementById('tanya-thread-content').innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p class="mt-2">Memuat...</p>
            </div>
        `;
        document.getElementById('tanya-thread-footer').innerHTML = '';

        try {
            const response = await fetch(`/api/patient-questions/staff/${questionId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to load thread');
            }

            const data = await response.json();

            if (data.success) {
                renderThreadModal(data.question, data.question.replies || []);
            } else {
                throw new Error(data.message || 'Failed to load thread');
            }
        } catch (error) {
            console.error('Error loading thread:', error);
            document.getElementById('tanya-thread-content').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle mr-2"></i>
                    Gagal memuat thread: ${error.message}
                </div>
            `;
        }
    };

    /**
     * Render thread modal content
     */
    function renderThreadModal(question, replies) {
        const statusColors = { 'open': 'warning', 'answered': 'info', 'closed': 'success' };
        const statusLabels = { 'open': 'Menunggu Jawaban', 'answered': 'Sudah Dijawab', 'closed': 'Selesai' };

        const date = new Date(question.created_at);
        const dateStr = date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Get doctor name from question
        const doctorName = question.doctor_name || 'Dokter';

        // Build replies HTML with actual sender names
        let repliesHtml = replies.map(r => {
            const rDate = new Date(r.created_at);
            const rDateStr = rDate.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
            const isDoctor = r.sender_type === 'doctor';
            const senderName = r.sender_name || (isDoctor ? doctorName : 'Pasien');

            return `
                <div class="d-flex ${isDoctor ? '' : 'flex-row-reverse'} mb-3">
                    <div class="p-3 rounded" style="max-width: 80%; ${isDoctor ? 'background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white;' : 'background: #f8f9fa;'}">
                        <small class="${isDoctor ? 'text-white-50' : 'text-muted'}">
                            ${isDoctor ? '<i class="fas fa-user-md"></i> ' + escapeHtml(senderName) : '<i class="fas fa-user"></i> Pasien'} - ${rDateStr}
                        </small>
                        <p class="mb-0 mt-1" style="white-space: pre-wrap;">${escapeHtml(r.message)}</p>
                        ${r.image_signed_url ? `<img src="${r.image_signed_url}" class="img-fluid mt-2 rounded" style="max-height: 200px; cursor: pointer;" onclick="window.open('${r.image_signed_url}', '_blank')">` : ''}
                    </div>
                </div>
            `;
        }).join('');

        if (replies.length === 0) {
            repliesHtml = `
                <div class="text-center py-4 text-muted">
                    <i class="fas fa-clock fa-2x mb-2"></i>
                    <p>Belum ada balasan</p>
                </div>
            `;
        }

        // Thread content with assigned doctor info
        const doctorSpecialty = question.doctor_specialty_label || '';
        document.getElementById('tanya-thread-content').innerHTML = `
            <!-- Patient Info -->
            <div class="mb-3 pb-3 border-bottom">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h5 class="mb-1 font-weight-bold">${escapeHtml(question.patient_name || 'Pasien')}</h5>
                        <small class="text-muted">${dateStr}</small>
                    </div>
                    <span class="badge badge-${statusColors[question.status]}">${statusLabels[question.status]}</span>
                </div>
            </div>

            <!-- Assigned Doctor Info -->
            <div class="mb-3 p-2 rounded" style="background: linear-gradient(135deg, rgba(139,92,246,0.1), rgba(109,40,217,0.1)); border: 1px solid rgba(139,92,246,0.3);">
                <small class="text-muted">Ditugaskan ke:</small>
                <div class="d-flex align-items-center mt-1">
                    <i class="fas fa-user-md mr-2" style="color: #8b5cf6;"></i>
                    <strong style="color: #8b5cf6;">${escapeHtml(doctorName)}</strong>
                    ${doctorSpecialty ? `<small class="text-muted ml-2">(${escapeHtml(doctorSpecialty)})</small>` : ''}
                </div>
            </div>

            <!-- Original Question -->
            <div class="p-3 rounded mb-4" style="background: #e3f2fd; border-left: 4px solid #2196f3;">
                <p class="mb-0" style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(question.question_text)}</p>
                ${question.image_signed_url ? `<img src="${question.image_signed_url}" class="img-fluid mt-3 rounded" style="max-height: 300px; cursor: pointer;" onclick="window.open('${question.image_signed_url}', '_blank')">` : ''}
            </div>

            <!-- Replies -->
            <h6 class="text-muted mb-3"><i class="fas fa-comments mr-1"></i> Balasan</h6>
            ${repliesHtml}
        `;

        // Footer with reply form (dokter only)
        const isDokter = window.auth?.currentUser?.role === 'dokter';

        if (question.status === 'closed') {
            document.getElementById('tanya-thread-footer').innerHTML = `
                <div class="text-muted">
                    <i class="fas fa-check-circle text-success"></i> Percakapan ini sudah ditutup
                </div>
            `;
        } else if (isDokter) {
            document.getElementById('tanya-thread-footer').innerHTML = `
                <div class="w-100">
                    <div class="form-group mb-2">
                        <textarea id="tanya-reply-text" class="form-control" rows="3" placeholder="Tulis balasan Anda..."></textarea>
                    </div>
                    <div class="d-flex justify-content-between">
                        <button type="button" class="btn btn-outline-secondary" onclick="closeTanyaThread('${question.id}')">
                            <i class="fas fa-check-circle"></i> Tutup Thread
                        </button>
                        <button type="button" class="btn btn-primary" onclick="sendTanyaReply('${question.id}')">
                            <i class="fas fa-paper-plane"></i> Kirim Balasan
                        </button>
                    </div>
                </div>
            `;
        } else {
            document.getElementById('tanya-thread-footer').innerHTML = `
                <div class="text-muted">
                    <i class="fas fa-info-circle"></i> Hanya dokter yang dapat membalas pertanyaan
                </div>
            `;
        }
    }

    /**
     * Send reply (dokter only)
     */
    window.sendTanyaReply = async function(questionId) {
        const token = getAuthToken();
        const replyText = document.getElementById('tanya-reply-text').value.trim();

        if (!replyText) {
            alert('Silakan tulis balasan');
            return;
        }

        try {
            const response = await fetch(`/api/patient-questions/staff/${questionId}/reply`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: replyText })
            });

            const data = await response.json();

            if (data.success) {
                // Reload thread and questions list
                openTanyaThreadModal(questionId);
                loadTanyaDokterQuestions();
            } else {
                alert(data.message || 'Gagal mengirim balasan');
            }
        } catch (error) {
            console.error('Error sending reply:', error);
            alert('Terjadi kesalahan. Silakan coba lagi.');
        }
    };

    /**
     * Close thread (dokter only)
     */
    window.closeTanyaThread = async function(questionId) {
        if (!confirm('Apakah Anda yakin ingin menutup thread ini?')) {
            return;
        }

        const token = getAuthToken();

        try {
            const response = await fetch(`/api/patient-questions/staff/${questionId}/close`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                $('#tanyaThreadModal').modal('hide');
                loadTanyaDokterQuestions();
                showToast('success', 'Thread berhasil ditutup');
            } else {
                alert(data.message || 'Gagal menutup thread');
            }
        } catch (error) {
            console.error('Error closing thread:', error);
            alert('Terjadi kesalahan. Silakan coba lagi.');
        }
    };

    // ==================== HELPER FUNCTIONS ====================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function showToast(type, message) {
        // Use existing toast system if available
        if (typeof toastr !== 'undefined') {
            toastr[type](message);
        } else {
            alert(message);
        }
    }

    // ==================== INITIALIZATION ====================

    // Load questions count for sidebar badge on page load
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(loadTanyaBadgeCount, 1000);
    });

    async function loadTanyaBadgeCount() {
        const token = getAuthToken();
        if (!token) return;

        try {
            const response = await fetch('/api/patient-questions/staff/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const badge = document.getElementById('badge-tanya-dokter');
                if (badge && data.count > 0) {
                    badge.textContent = data.count;
                    badge.classList.remove('d-none');
                }
            }
        } catch (error) {
            console.error('Error loading tanya badge count:', error);
        }
    }

})();
