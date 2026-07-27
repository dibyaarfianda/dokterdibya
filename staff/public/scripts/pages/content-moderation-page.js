import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml, escapeAttribute } from '../safe-render.js';

const requestScopes = new Map();
const patientStoryCategoryLabels = {
    kehamilan: 'Kehamilan',
    kesuburan: 'Kesuburan',
    penyakit_kandungan: 'Penyakit kandungan'
};
const patientStoryStatusLabels = {
    pending: 'Pending',
    published: 'Published',
    rejected: 'Rejected',
    archived: 'Archived'
};

let patientStoriesAdminCache = [];
let previewTimeout = null;

function startRequestScope(key) {
    requestScopes.get(key)?.abort('Request replaced');
    const scope = createPageRequestScope();
    requestScopes.set(key, scope);
    return scope;
}

function abortRequestScopes() {
    requestScopes.forEach(scope => scope.abort());
    requestScopes.clear();
}

function isAbortError(error) {
    return error?.name === 'AbortError';
}

function showModal(selector, action) {
    window.jQuery?.(selector)?.modal(action);
}

function notify(message, type = 'success') {
    if (window.toastr && typeof window.toastr[type] === 'function') {
        window.toastr[type](message);
    }
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function getPatientStoryStatusBadge(status) {
    const classes = {
        pending: 'badge-warning',
        published: 'badge-success',
        rejected: 'badge-danger',
        archived: 'badge-secondary'
    };
    return `<span class="badge ${classes[status] || 'badge-light'}">${escapeHtml(patientStoryStatusLabels[status] || status || '-')}</span>`;
}

async function ensureMarkdownFeature() {
    if (typeof window.ensureStaffFeature === 'function') {
        await window.ensureStaffFeature('markdown');
    }
}

export async function showArtikelKesehatanPage() {
    await ensureMarkdownFeature();
    await window.activateRegisteredStaffPage?.('artikel-kesehatan');
    initArticleMarkdownPreview();
    await loadArticlesAdmin();
}

export async function showRuangCeritaPage() {
    await window.activateRegisteredStaffPage?.('ruang-cerita');
    await loadPatientStoriesAdmin();
}

export async function loadArticlesAdmin() {
    const tbody = document.getElementById('articles-admin-tbody');
    if (!tbody) return;

    const category = document.getElementById('article-filter-category')?.value || 'all';
    const status = document.getElementById('article-filter-status')?.value || 'all';
    const params = new URLSearchParams({ category, status, limit: 100 });
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';

    const scope = startRequestScope('articles-list');
    try {
        const result = await scope.request(`/api/articles/admin/all?${params}`);
        const articles = Array.isArray(result?.data) ? result.data : [];
        if (articles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Belum ada artikel. Klik "Tambah Artikel" untuk membuat.</td></tr>';
            return;
        }

        tbody.innerHTML = articles.map(article => {
            const articleId = String(article.id ?? '');
            const published = Boolean(article.is_published);
            const summary = article.summary
                ? `<br><small class="text-muted">${escapeHtml(String(article.summary).substring(0, 60))}${String(article.summary).length > 60 ? '...' : ''}</small>`
                : '';
            return `
                <tr>
                    <td><strong>${escapeHtml(article.title)}</strong>${summary}</td>
                    <td><span class="badge badge-info">${escapeHtml(article.category || 'Kehamilan')}</span></td>
                    <td>${published ? '<span class="badge badge-success">Published</span>' : '<span class="badge badge-secondary">Draft</span>'}</td>
                    <td>${Number(article.view_count || 0)}</td>
                    <td><i class="fas fa-thumbs-up text-primary"></i> ${Number(article.like_count || 0)}</td>
                    <td><small>${escapeHtml(formatDate(article.updated_at))}</small></td>
                    <td>
                        <button type="button" class="btn btn-sm btn-info" data-action="article-edit" data-article-id="${escapeAttribute(articleId)}" title="Edit"><i class="fas fa-edit"></i></button>
                        <button type="button" class="btn btn-sm ${published ? 'btn-warning' : 'btn-success'}" data-action="article-publish" data-article-id="${escapeAttribute(articleId)}" data-publish="${published ? 'false' : 'true'}" title="${published ? 'Unpublish' : 'Publish'}"><i class="fas ${published ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
                        <button type="button" class="btn btn-sm btn-danger" data-action="article-delete" data-article-id="${escapeAttribute(articleId)}" title="Hapus"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        }).join('');
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error loading articles:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Gagal memuat artikel</td></tr>';
    }
}

export async function showAddArticleModal() {
    await ensureMarkdownFeature();
    const form = document.getElementById('articleForm');
    if (!form) return;
    document.getElementById('articleModalTitle').textContent = 'Tambah Artikel Baru';
    form.reset();
    document.getElementById('article-id').value = '';
    document.getElementById('article-color').value = '#28a7e9';
    const preview = document.getElementById('article-preview');
    if (preview) preview.innerHTML = '<p class="text-muted"><i>Preview akan muncul di sini...</i></p>';
    initArticleMarkdownPreview();
    showModal('#articleModal', 'show');
}

export async function editArticle(id) {
    await ensureMarkdownFeature();
    const scope = startRequestScope('article-detail');
    try {
        const result = await scope.request(`/api/articles/${encodeURIComponent(id)}`);
        const article = result?.data;
        if (!article) throw new Error('Artikel tidak ditemukan');

        document.getElementById('articleModalTitle').textContent = 'Edit Artikel';
        document.getElementById('article-id').value = article.id;
        document.getElementById('article-title').value = article.title || '';
        document.getElementById('article-summary').value = article.summary || '';
        document.getElementById('article-content').value = article.content || '';
        document.getElementById('article-category').value = article.category || 'Kehamilan';
        document.getElementById('article-source').value = article.source || '';
        document.getElementById('article-icon').value = typeof article.icon === 'string' ? article.icon : 'fa-heartbeat';
        document.getElementById('article-color').value = article.color || '#28a7e9';
        document.getElementById('article-published').checked = article.is_published === 1 || article.is_published === true;
        initArticleMarkdownPreview();
        showModal('#articleModal', 'show');
        updateArticlePreview();
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error fetching article:', error);
        window.alert('Gagal memuat artikel');
    }
}

export async function saveArticle() {
    const id = document.getElementById('article-id')?.value || '';
    const data = {
        title: document.getElementById('article-title')?.value.trim() || '',
        summary: document.getElementById('article-summary')?.value.trim() || '',
        content: document.getElementById('article-content')?.value || '',
        category: document.getElementById('article-category')?.value || 'Kehamilan',
        source: document.getElementById('article-source')?.value.trim() || '',
        icon: document.getElementById('article-icon')?.value || '',
        color: document.getElementById('article-color')?.value || '#28a7e9',
        is_published: Boolean(document.getElementById('article-published')?.checked)
    };
    if (!data.title) {
        window.alert('Judul artikel wajib diisi');
        return;
    }

    const scope = startRequestScope('article-save');
    try {
        await scope.request(id ? `/api/articles/${encodeURIComponent(id)}` : '/api/articles', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(data)
        });
        showModal('#articleModal', 'hide');
        await loadArticlesAdmin();
        notify(id ? 'Artikel berhasil diupdate' : 'Artikel berhasil dibuat');
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error saving article:', error);
        window.alert('Gagal menyimpan artikel');
    }
}

export async function togglePublishArticle(id, publish) {
    const scope = startRequestScope('article-publish');
    try {
        await scope.request(`/api/articles/${encodeURIComponent(id)}/publish`, {
            method: 'PATCH',
            body: JSON.stringify({ is_published: Boolean(publish) })
        });
        await loadArticlesAdmin();
        notify(publish ? 'Artikel dipublish' : 'Artikel di-unpublish');
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error toggling publish:', error);
        window.alert('Gagal mengubah status publish');
    }
}

export async function deleteArticle(id) {
    if (!window.confirm('Yakin ingin menghapus artikel ini?')) return;
    const scope = startRequestScope('article-delete');
    try {
        await scope.request(`/api/articles/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await loadArticlesAdmin();
        notify('Artikel berhasil dihapus');
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error deleting article:', error);
        window.alert('Gagal menghapus artikel');
    }
}

export async function loadPatientStoriesAdmin() {
    const tbody = document.getElementById('patient-stories-admin-tbody');
    if (!tbody) return;

    const status = document.getElementById('story-filter-status')?.value || '';
    const category = document.getElementById('story-filter-category')?.value || '';
    const params = new URLSearchParams({ limit: 100 });
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';

    const scope = startRequestScope('stories-list');
    try {
        const result = await scope.request(`/api/patient-stories/admin/all?${params}`);
        if (!result?.success) throw new Error(result?.message || 'Gagal memuat cerita');
        patientStoriesAdminCache = Array.isArray(result.data) ? result.data : [];
        if (patientStoriesAdminCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Belum ada cerita pasien.</td></tr>';
            return;
        }

        tbody.innerHTML = patientStoriesAdminCache.map(story => {
            const storyId = String(story.id ?? '');
            const preview = String(story.body || '').substring(0, 90);
            const actionButton = (action, className, icon, title) =>
                `<button type="button" class="btn btn-sm ${className}" data-action="story-moderate" data-story-id="${escapeAttribute(storyId)}" data-moderation="${action}" title="${title}"><i class="fas ${icon}"></i></button>`;
            return `
                <tr>
                    <td>
                        <strong>${escapeHtml(story.title)}</strong>
                        <br><small class="text-muted">${escapeHtml(preview)}${String(story.body || '').length > 90 ? '...' : ''}</small>
                    </td>
                    <td><span class="badge badge-info">${escapeHtml(patientStoryCategoryLabels[story.category] || story.category || '-')}</span></td>
                    <td>${escapeHtml(story.author_display_name || '-')}</td>
                    <td>${getPatientStoryStatusBadge(story.status)}</td>
                    <td><i class="fas fa-heart text-danger"></i> ${Number(story.like_count || 0)}</td>
                    <td><i class="fas fa-flag text-warning"></i> ${Number(story.report_count || 0)}</td>
                    <td><small>${escapeHtml(formatDate(story.created_at))}</small></td>
                    <td>
                        <button type="button" class="btn btn-sm btn-info" data-action="story-preview" data-story-id="${escapeAttribute(storyId)}" title="Preview"><i class="fas fa-eye"></i></button>
                        ${story.status !== 'published' ? actionButton('approve', 'btn-success', 'fa-check', 'Approve') : ''}
                        ${story.status !== 'rejected' ? actionButton('reject', 'btn-warning', 'fa-times', 'Reject') : ''}
                        ${story.status !== 'archived' ? actionButton('archive', 'btn-secondary', 'fa-archive', 'Archive') : ''}
                    </td>
                </tr>`;
        }).join('');
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error loading patient stories:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Gagal memuat cerita pasien</td></tr>';
    }
}

export function previewPatientStory(id) {
    const story = patientStoriesAdminCache.find(item => Number(item.id) === Number(id));
    if (!story) return;

    document.getElementById('patientStoryPreviewTitle').textContent = story.title || 'Preview Cerita';
    document.getElementById('patientStoryPreviewMeta').textContent = [
        patientStoryCategoryLabels[story.category] || story.category || '-',
        story.author_display_name || '-',
        patientStoryStatusLabels[story.status] || story.status || '-'
    ].join(' · ');
    document.getElementById('patientStoryPreviewBody').textContent = story.body || '';

    const actions = document.getElementById('patientStoryPreviewActions');
    if (actions) {
        const storyId = escapeAttribute(story.id);
        const button = (action, className, icon, label) =>
            `<button type="button" class="btn ${className}" data-action="story-moderate" data-story-id="${storyId}" data-moderation="${action}"><i class="fas ${icon} mr-1"></i>${label}</button>`;
        actions.innerHTML = `
            ${story.status !== 'published' ? button('approve', 'btn-success', 'fa-check', 'Approve') : ''}
            ${story.status !== 'rejected' ? button('reject', 'btn-warning', 'fa-times', 'Reject') : ''}
            ${story.status !== 'archived' ? button('archive', 'btn-secondary', 'fa-archive', 'Archive') : ''}
            <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">Tutup</button>`;
    }
    showModal('#patientStoryPreviewModal', 'show');
}

export async function moderatePatientStory(id, action) {
    const allowedActions = new Set(['approve', 'reject', 'archive']);
    if (!allowedActions.has(action)) return;
    const note = action === 'reject' || action === 'archive'
        ? window.prompt('Catatan moderation (opsional, terlihat oleh penulis):') || ''
        : '';

    const scope = startRequestScope('story-moderate');
    try {
        const result = await scope.request(`/api/patient-stories/admin/${encodeURIComponent(id)}/${action}`, {
            method: 'PATCH',
            body: JSON.stringify({ note })
        });
        if (!result?.success) throw new Error(result?.message || 'Gagal mengubah status cerita');
        showModal('#patientStoryPreviewModal', 'hide');
        await loadPatientStoriesAdmin();
        notify(result.message || 'Status cerita diperbarui');
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error moderating patient story:', error);
        window.alert(error.message || 'Gagal mengubah status cerita');
    }
}

function initArticleMarkdownPreview() {
    const contentTextarea = document.getElementById('article-content');
    const previewTab = document.querySelector('#artikel-kesehatan-page a[href="#preview-tab"]');
    if (!contentTextarea || !previewTab) return;

    if (previewTab.dataset.previewBound !== 'true') {
        previewTab.dataset.previewBound = 'true';
        previewTab.addEventListener('shown.bs.tab', updateArticlePreview);
    }
    if (contentTextarea.dataset.previewBound !== 'true') {
        contentTextarea.dataset.previewBound = 'true';
        contentTextarea.addEventListener('input', () => {
            window.clearTimeout(previewTimeout);
            previewTimeout = window.setTimeout(updateArticlePreview, 500);
        });
    }
}

function updateArticlePreview() {
    const contentTextarea = document.getElementById('article-content');
    const previewDiv = document.getElementById('article-preview');
    if (!contentTextarea || !previewDiv) return;

    const markdownContent = contentTextarea.value.trim();
    if (!markdownContent) {
        previewDiv.innerHTML = '<p class="text-muted"><i>Preview akan muncul di sini...</i></p>';
        return;
    }

    const marked = window.marked;
    const DOMPurify = window.DOMPurify;
    if (!marked || !DOMPurify) {
        previewDiv.innerHTML = '<p class="text-danger"><i>Library preview Markdown tidak tersedia</i></p>';
        return;
    }

    try {
        previewDiv.innerHTML = DOMPurify.sanitize(marked.parse(markdownContent));
    } catch (error) {
        console.error('Error parsing Markdown:', error);
        previewDiv.innerHTML = `<p class="text-danger"><i>Error: ${escapeHtml(error.message)}</i></p>`;
    }
}

document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (!action?.startsWith('article-') && !action?.startsWith('story-')) return;
    event.preventDefault();

    if (action === 'article-add') showAddArticleModal();
    if (action === 'article-refresh') loadArticlesAdmin();
    if (action === 'article-save') saveArticle();
    if (action === 'article-edit') editArticle(target.dataset.articleId);
    if (action === 'article-publish') togglePublishArticle(target.dataset.articleId, target.dataset.publish === 'true');
    if (action === 'article-delete') deleteArticle(target.dataset.articleId);
    if (action === 'story-refresh') loadPatientStoriesAdmin();
    if (action === 'story-preview') previewPatientStory(target.dataset.storyId);
    if (action === 'story-moderate') moderatePatientStory(target.dataset.storyId, target.dataset.moderation);
});

document.addEventListener('change', event => {
    if (event.target?.dataset.action === 'article-filter') loadArticlesAdmin();
    if (event.target?.dataset.action === 'story-filter') loadPatientStoriesAdmin();
});

document.addEventListener('page:changed', () => {
    abortRequestScopes();
});

Object.assign(window, {
    showArtikelKesehatanPage,
    loadArticlesAdmin,
    showAddArticleModal,
    editArticle,
    saveArticle,
    togglePublishArticle,
    deleteArticle,
    showRuangCeritaPage,
    loadPatientStoriesAdmin,
    previewPatientStory,
    moderatePatientStory
});
