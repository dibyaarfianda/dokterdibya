import { useMemo, useState } from 'preact/hooks';
import { addSpaceDocument, listSpaceDocuments } from '../services/api';
import { formatDateDisplay } from '../utils/date';

const spaces = {
  ilmiah: {
    eyebrow: 'Ruang ilmiah',
    title: 'Library referensi ilmiah',
    description: 'Simpan jurnal, guideline, ringkasan artikel, bahan seminar, dan draft edukasi ilmiah dalam ruang yang terpisah dari jadwal operasi.',
    action: 'Tambah referensi',
    titlePlaceholder: 'Judul jurnal, guideline, atau materi',
    summaryPlaceholder: 'Ringkasan poin penting...',
    tagPlaceholder: 'guideline, obgyn, usg',
  },
  pribadi: {
    eyebrow: 'Ruang pribadi',
    title: 'Catatan pribadi dokter',
    description: 'Kumpulkan memo, ide konten, catatan pengembangan praktik, dan draft pribadi yang tidak otomatis dibagikan ke tim.',
    action: 'Tambah catatan',
    titlePlaceholder: 'Judul catatan pribadi',
    summaryPlaceholder: 'Isi memo singkat...',
    tagPlaceholder: 'ide, memo, konten',
  },
};

function normalizeTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function KnowledgeSpace({ space = 'ilmiah' }) {
  const config = spaces[space] || spaces.ilmiah;
  const [documents, setDocuments] = useState(() => listSpaceDocuments(space));
  const [form, setForm] = useState({ title: '', summary: '', tags: '' });

  const featuredTags = useMemo(() => {
    const tags = documents.flatMap((document) => document.tags || []);
    return [...new Set(tags)].slice(0, 6);
  }, [documents]);

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.currentTarget.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const document = addSpaceDocument(space, {
      title: form.title.trim(),
      summary: form.summary.trim(),
      tags: normalizeTags(form.tags),
    });
    setDocuments((current) => [document, ...current]);
    setForm({ title: '', summary: '', tags: '' });
  };

  return (
    <div className="page stack">
      <section className={`hero-card knowledge-hero ${space}`}>
        <div>
          <span className="eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <a href={space === 'ilmiah' ? '/docboard/personal' : '/docboard/scientific'} className="secondary-action">
          Buka {space === 'ilmiah' ? 'Pribadi' : 'Ilmiah'}
        </a>
      </section>

      <section className="split-layout knowledge-layout">
        <form className="panel stack knowledge-form" onSubmit={handleSubmit}>
          <div className="section-title">
            <div>
              <span>{config.action}</span>
              <h2>Simpan cepat</h2>
            </div>
          </div>
          <label className="field">
            <span>Judul</span>
            <input
              value={form.title}
              onInput={handleChange('title')}
              placeholder={config.titlePlaceholder}
              required
            />
          </label>
          <label className="field">
            <span>Ringkasan</span>
            <textarea
              value={form.summary}
              onInput={handleChange('summary')}
              placeholder={config.summaryPlaceholder}
              required
            />
          </label>
          <label className="field">
            <span>Tag</span>
            <input
              value={form.tags}
              onInput={handleChange('tags')}
              placeholder={config.tagPlaceholder}
            />
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit">{config.action}</button>
          </div>
        </form>

        <div className="panel stack">
          <div className="section-title">
            <div>
              <span>Koleksi</span>
              <h2>{documents.length} dokumen</h2>
            </div>
          </div>
          {featuredTags.length > 0 && (
            <div className="tag-cloud">
              {featuredTags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
          <div className="document-list">
            {documents.map((document) => (
              <article className="document-card" key={document.id}>
                <div>
                  <strong>{document.title}</strong>
                  <small>{formatDateDisplay(document.updatedAt)}</small>
                </div>
                <p>{document.summary}</p>
                <div className="document-tags">
                  {(document.tags || []).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
