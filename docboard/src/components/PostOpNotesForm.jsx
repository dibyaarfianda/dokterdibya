import { useState } from 'preact/hooks';
import { api } from '../services/api';

const KOMPLIKASI_OPTIONS = [
  { value: 'tidak_ada', label: 'Tidak Ada' },
  { value: 'minor', label: 'Minor' },
  { value: 'mayor', label: 'Mayor' }
];

export default function PostOpNotesForm({ surgeryId, existingNotes, onSaved, onCancel }) {
  // Parse existing notes if available
  const parsed = existingNotes ? parseNotes(existingNotes) : {};

  const [prosedur, setProsedur] = useState(parsed.prosedur || '');
  const [temuan, setTemuan] = useState(parsed.temuan || '');
  const [komplikasi, setKomplikasi] = useState(parsed.komplikasi || 'tidak_ada');
  const [komplikasiDetail, setKomplikasiDetail] = useState(parsed.komplikasi_detail || '');
  const [perdarahan, setPerdarahan] = useState(parsed.estimasi_perdarahan || '');
  const [durasi, setDurasi] = useState(parsed.durasi_operasi || '');
  const [catatan, setCatatan] = useState(parsed.catatan_tambahan || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function parseNotes(notes) {
    if (typeof notes === 'object' && notes !== null) return notes;
    if (typeof notes === 'string') {
      try { return JSON.parse(notes); } catch { return {}; }
    }
    return {};
  }

  async function handleSave() {
    if (!prosedur.trim()) {
      setError('Prosedur yang dilakukan wajib diisi');
      return;
    }

    setSaving(true);
    setError(null);

    const notes = {
      prosedur: prosedur.trim(),
      temuan: temuan.trim(),
      komplikasi,
      komplikasi_detail: komplikasi !== 'tidak_ada' ? komplikasiDetail.trim() : '',
      estimasi_perdarahan: perdarahan.trim(),
      durasi_operasi: durasi.trim(),
      catatan_tambahan: catatan.trim()
    };

    try {
      await api.updatePostOpNotes(surgeryId, JSON.stringify(notes));
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        if (onSaved) onSaved();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan catatan post-op');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="detail-card postop-form-card">
      <div class="detail-label">Catatan Post-Op</div>

      {error && <div class="form-error">{error}</div>}
      {success && <div class="postop-success">Catatan post-op berhasil disimpan</div>}

      <div class="form-group">
        <label>Prosedur yang Dilakukan *</label>
        <textarea
          value={prosedur}
          onInput={(e) => setProsedur(e.target.value)}
          placeholder="Deskripsi prosedur operasi yang dilakukan..."
          rows={3}
        />
      </div>

      <div class="form-group">
        <label>Temuan Operasi</label>
        <textarea
          value={temuan}
          onInput={(e) => setTemuan(e.target.value)}
          placeholder="Temuan selama operasi..."
          rows={3}
        />
      </div>

      <div class="form-group">
        <label>Komplikasi</label>
        <select value={komplikasi} onChange={(e) => setKomplikasi(e.target.value)}>
          {KOMPLIKASI_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {komplikasi !== 'tidak_ada' && (
        <div class="form-group">
          <label>Detail Komplikasi</label>
          <textarea
            value={komplikasiDetail}
            onInput={(e) => setKomplikasiDetail(e.target.value)}
            placeholder="Jelaskan komplikasi yang terjadi..."
            rows={2}
          />
        </div>
      )}

      <div class="form-row">
        <div class="form-group">
          <label>Estimasi Perdarahan (ml)</label>
          <input
            type="number"
            value={perdarahan}
            onInput={(e) => setPerdarahan(e.target.value)}
            placeholder="ml"
            min="0"
          />
        </div>
        <div class="form-group">
          <label>Durasi Operasi (menit)</label>
          <input
            type="number"
            value={durasi}
            onInput={(e) => setDurasi(e.target.value)}
            placeholder="menit"
            min="0"
          />
        </div>
      </div>

      <div class="form-group">
        <label>Catatan Tambahan</label>
        <textarea
          value={catatan}
          onInput={(e) => setCatatan(e.target.value)}
          placeholder="Catatan tambahan lainnya..."
          rows={2}
        />
      </div>

      <div class="postop-actions">
        <button class="btn-secondary" onClick={onCancel} disabled={saving}>
          Batal
        </button>
        <button class="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Menyimpan...' : 'Simpan Catatan'}
        </button>
      </div>
    </div>
  );
}
