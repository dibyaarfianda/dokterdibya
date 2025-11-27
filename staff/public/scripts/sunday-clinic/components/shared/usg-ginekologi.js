/**
 * USG Ginekologi Component (Shared for gyn_repro & gyn_special)
 * Structured form for gynecological ultrasound examination
 * Using obstetri-style CSS (sc-section, sc-grid, sc-card)
 */

import stateManager from '../../utils/state-manager.js';
import apiClient from '../../utils/api-client.js';

export default {
    /**
     * Render the USG Ginekologi form
     */
    async render(state) {
        const usg = state.recordData?.usg || {};
        const isSaved = !!usg.saved_at;

        // Get metadata context for display
        let metaHtml = '';
        try {
            const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
            const context = getMedicalRecordContext(state, 'usg');
            if (context) {
                metaHtml = renderRecordMeta(context, 'usg');
            }
        } catch (error) {
            console.error('[USGGinekologi] Failed to load metadata:', error);
        }

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Pemeriksaan USG Ginekologi</h3>
                    <button class="btn btn-primary btn-sm" id="usg-save">
                        <i class="fas fa-save"></i> Simpan
                    </button>
                </div>
                ${metaHtml}

                <div class="sc-grid two">
                    <div class="sc-card">
                        <h4>Informasi Teknis & Uterus</h4>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Jenis USG</label>
                            <div class="row">
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="usg-transabdominal"
                                            ${usg.transabdominal ? 'checked' : ''}>
                                        <label class="custom-control-label" for="usg-transabdominal">Transabdominal</label>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="usg-transvaginal"
                                            ${usg.transvaginal ? 'checked' : ''}>
                                        <label class="custom-control-label" for="usg-transvaginal">Transvaginal</label>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="usg-keduanya"
                                            ${usg.keduanya ? 'checked' : ''}>
                                        <label class="custom-control-label" for="usg-keduanya">Keduanya</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h4>Rahim (Uterus)</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Posisi</label>
                            <div class="row">
                                <div class="col-6">
                                    <div class="custom-control custom-radio">
                                        <input type="radio" class="custom-control-input" name="uterus-posisi" id="posisi-anteverted"
                                            value="anteverted" ${usg.uterus_posisi === 'anteverted' ? 'checked' : ''}>
                                        <label class="custom-control-label" for="posisi-anteverted">Anteverted</label>
                                    </div>
                                    <div class="custom-control custom-radio">
                                        <input type="radio" class="custom-control-input" name="uterus-posisi" id="posisi-retroverted"
                                            value="retroverted" ${usg.uterus_posisi === 'retroverted' ? 'checked' : ''}>
                                        <label class="custom-control-label" for="posisi-retroverted">Retroverted</label>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="custom-control custom-radio">
                                        <input type="radio" class="custom-control-input" name="uterus-posisi" id="posisi-anteflexed"
                                            value="anteflexed" ${usg.uterus_posisi === 'anteflexed' ? 'checked' : ''}>
                                        <label class="custom-control-label" for="posisi-anteflexed">Anteflexed</label>
                                    </div>
                                    <div class="custom-control custom-radio">
                                        <input type="radio" class="custom-control-input" name="uterus-posisi" id="posisi-retroflexed"
                                            value="retroflexed" ${usg.uterus_posisi === 'retroflexed' ? 'checked' : ''}>
                                        <label class="custom-control-label" for="posisi-retroflexed">Retroflexed</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Ukuran Uterus</label>
                            <div class="row">
                                <div class="col-3">
                                    <div class="input-group input-group-sm">
                                        <div class="input-group-prepend"><span class="input-group-text">L</span></div>
                                        <input type="number" step="0.1" class="form-control" id="uterus-length"
                                            placeholder="0.0" value="${usg.uterus_length || ''}">
                                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                    </div>
                                </div>
                                <div class="col-3">
                                    <div class="input-group input-group-sm">
                                        <div class="input-group-prepend"><span class="input-group-text">W</span></div>
                                        <input type="number" step="0.1" class="form-control" id="uterus-width"
                                            placeholder="0.0" value="${usg.uterus_width || ''}">
                                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                    </div>
                                </div>
                                <div class="col-3">
                                    <div class="input-group input-group-sm">
                                        <div class="input-group-prepend"><span class="input-group-text">D</span></div>
                                        <input type="number" step="0.1" class="form-control" id="uterus-depth"
                                            placeholder="0.0" value="${usg.uterus_depth || ''}">
                                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                    </div>
                                </div>
                                <div class="col-3">
                                    <div class="input-group input-group-sm">
                                        <div class="input-group-prepend"><span class="input-group-text">V</span></div>
                                        <input type="number" step="0.1" class="form-control" id="uterus-volume"
                                            placeholder="0.0" value="${usg.uterus_volume || ''}">
                                        <div class="input-group-append"><span class="input-group-text">ml</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Mioma</label>
                                    <div class="d-flex">
                                        <div class="custom-control custom-radio mr-3">
                                            <input type="radio" class="custom-control-input" name="mioma" id="mioma-ada"
                                                value="ada" ${usg.mioma === 'ada' ? 'checked' : ''}>
                                            <label class="custom-control-label" for="mioma-ada">Ada</label>
                                        </div>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="mioma" id="mioma-tidak"
                                                value="tidak_ada" ${usg.mioma === 'tidak_ada' ? 'checked' : ''}>
                                            <label class="custom-control-label" for="mioma-tidak">Tidak</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Adenomyosis</label>
                                    <div class="d-flex">
                                        <div class="custom-control custom-radio mr-3">
                                            <input type="radio" class="custom-control-input" name="adenomyosis" id="adenomyosis-ada"
                                                value="ada" ${usg.adenomyosis === 'ada' ? 'checked' : ''}>
                                            <label class="custom-control-label" for="adenomyosis-ada">Ada</label>
                                        </div>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="adenomyosis" id="adenomyosis-tidak"
                                                value="tidak_ada" ${usg.adenomyosis === 'tidak_ada' ? 'checked' : ''}>
                                            <label class="custom-control-label" for="adenomyosis-tidak">Tidak</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Mioma Detail -->
                        <div id="mioma-detail-section" style="display: ${usg.mioma === 'ada' ? 'block' : 'none'};">
                            <div class="alert alert-light border">
                                <strong>Detail Mioma:</strong>
                                <div class="row mt-2">
                                    <div class="col-4">
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="mioma-submukosa"
                                                ${usg.mioma_submukosa ? 'checked' : ''}>
                                            <label class="custom-control-label" for="mioma-submukosa">Submukosa</label>
                                        </div>
                                    </div>
                                    <div class="col-4">
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="mioma-intramural"
                                                ${usg.mioma_intramural ? 'checked' : ''}>
                                            <label class="custom-control-label" for="mioma-intramural">Intramural</label>
                                        </div>
                                    </div>
                                    <div class="col-4">
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="mioma-subserosa"
                                                ${usg.mioma_subserosa ? 'checked' : ''}>
                                            <label class="custom-control-label" for="mioma-subserosa">Subserosa</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="row mt-2">
                                    <div class="col-9">
                                        <label class="small">Ukuran</label>
                                        <div class="input-group input-group-sm">
                                            <input type="number" step="0.1" class="form-control" id="mioma-size-1"
                                                placeholder="0.0" value="${usg.mioma_size_1 || ''}">
                                            <div class="input-group-append input-group-prepend"><span class="input-group-text">x</span></div>
                                            <input type="number" step="0.1" class="form-control" id="mioma-size-2"
                                                placeholder="0.0" value="${usg.mioma_size_2 || ''}">
                                            <div class="input-group-append input-group-prepend"><span class="input-group-text">x</span></div>
                                            <input type="number" step="0.1" class="form-control" id="mioma-size-3"
                                                placeholder="0.0" value="${usg.mioma_size_3 || ''}">
                                            <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                        </div>
                                    </div>
                                    <div class="col-3">
                                        <label class="small">Multiple</label>
                                        <select class="form-control form-control-sm" id="mioma-multiple">
                                            <option value="">-</option>
                                            <option value="ya" ${usg.mioma_multiple === 'ya' ? 'selected' : ''}>Ya</option>
                                            <option value="tidak" ${usg.mioma_multiple === 'tidak' ? 'selected' : ''}>Tidak</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h4>Endometrium</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Ketebalan</label>
                            <div class="input-group" style="max-width: 150px;">
                                <input type="number" step="0.1" class="form-control" id="endometrium-thickness"
                                    placeholder="0.0" value="${usg.endometrium_thickness || ''}">
                                <div class="input-group-append"><span class="input-group-text">mm</span></div>
                            </div>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Morfologi</label>
                            <div class="row">
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox mb-1">
                                        <input type="checkbox" class="custom-control-input" id="endo-trilaminar"
                                            ${usg.endo_trilaminar ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-trilaminar">Trilaminar</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-1">
                                        <input type="checkbox" class="custom-control-input" id="endo-echogenic"
                                            ${usg.endo_echogenic ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-echogenic">Echogenic</label>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox mb-1">
                                        <input type="checkbox" class="custom-control-input" id="endo-irregular"
                                            ${usg.endo_irregular ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-irregular">Tidak teratur</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-1">
                                        <input type="checkbox" class="custom-control-input" id="endo-normal"
                                            ${usg.endo_normal ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-normal">Normal</label>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox mb-1">
                                        <input type="checkbox" class="custom-control-input" id="endo-thick"
                                            ${usg.endo_thick ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-thick">Tebal</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-1">
                                        <input type="checkbox" class="custom-control-input" id="endo-polyp"
                                            ${usg.endo_polyp ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-polyp">Polip</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-1">
                                        <input type="checkbox" class="custom-control-input" id="endo-fluid"
                                            ${usg.endo_fluid ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-fluid">Cairan</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="sc-card">
                        <h4>Ovarium (Indung Telur)</h4>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Teridentifikasi</label>
                            <div class="d-flex">
                                <div class="custom-control custom-checkbox mr-4">
                                    <input type="checkbox" class="custom-control-input" id="ovarium-kanan-visible"
                                        ${usg.ovarium_kanan_visible ? 'checked' : ''}>
                                    <label class="custom-control-label" for="ovarium-kanan-visible">Kanan</label>
                                </div>
                                <div class="custom-control custom-checkbox">
                                    <input type="checkbox" class="custom-control-input" id="ovarium-kiri-visible"
                                        ${usg.ovarium_kiri_visible ? 'checked' : ''}>
                                    <label class="custom-control-label" for="ovarium-kiri-visible">Kiri</label>
                                </div>
                            </div>
                        </div>

                        <div class="alert alert-light border mb-3">
                            <strong>Ovarium KANAN</strong>
                            <div class="row mt-2">
                                <div class="col-12">
                                    <label class="small">Ukuran</label>
                                    <div class="input-group input-group-sm">
                                        <input type="number" step="0.1" class="form-control" id="ovarium-kanan-1"
                                            placeholder="0.0" value="${usg.ovarium_kanan_1 || ''}">
                                        <div class="input-group-append input-group-prepend"><span class="input-group-text">x</span></div>
                                        <input type="number" step="0.1" class="form-control" id="ovarium-kanan-2"
                                            placeholder="0.0" value="${usg.ovarium_kanan_2 || ''}">
                                        <div class="input-group-append input-group-prepend"><span class="input-group-text">x</span></div>
                                        <input type="number" step="0.1" class="form-control" id="ovarium-kanan-3"
                                            placeholder="0.0" value="${usg.ovarium_kanan_3 || ''}">
                                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                    </div>
                                </div>
                            </div>
                            <div class="row mt-2">
                                <div class="col-12">
                                    <label class="small">Folikel</label>
                                    <div class="input-group input-group-sm">
                                        <input type="number" step="0.1" class="form-control" id="folikel-kanan-min"
                                            placeholder="min" value="${usg.folikel_kanan_min || ''}">
                                        <div class="input-group-append input-group-prepend"><span class="input-group-text">-</span></div>
                                        <input type="number" step="0.1" class="form-control" id="folikel-kanan-max"
                                            placeholder="max" value="${usg.folikel_kanan_max || ''}">
                                        <div class="input-group-append"><span class="input-group-text">mm</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="alert alert-light border mb-3">
                            <strong>Ovarium KIRI</strong>
                            <div class="row mt-2">
                                <div class="col-12">
                                    <label class="small">Ukuran</label>
                                    <div class="input-group input-group-sm">
                                        <input type="number" step="0.1" class="form-control" id="ovarium-kiri-1"
                                            placeholder="0.0" value="${usg.ovarium_kiri_1 || ''}">
                                        <div class="input-group-append input-group-prepend"><span class="input-group-text">x</span></div>
                                        <input type="number" step="0.1" class="form-control" id="ovarium-kiri-2"
                                            placeholder="0.0" value="${usg.ovarium_kiri_2 || ''}">
                                        <div class="input-group-append input-group-prepend"><span class="input-group-text">x</span></div>
                                        <input type="number" step="0.1" class="form-control" id="ovarium-kiri-3"
                                            placeholder="0.0" value="${usg.ovarium_kiri_3 || ''}">
                                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                    </div>
                                </div>
                            </div>
                            <div class="row mt-2">
                                <div class="col-12">
                                    <label class="small">Folikel</label>
                                    <div class="input-group input-group-sm">
                                        <input type="number" step="0.1" class="form-control" id="folikel-kiri-min"
                                            placeholder="min" value="${usg.folikel_kiri_min || ''}">
                                        <div class="input-group-append input-group-prepend"><span class="input-group-text">-</span></div>
                                        <input type="number" step="0.1" class="form-control" id="folikel-kiri-max"
                                            placeholder="max" value="${usg.folikel_kiri_max || ''}">
                                        <div class="input-group-append"><span class="input-group-text">mm</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group mb-3">
                            <div class="row">
                                <div class="col-6">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="ovarium-pco"
                                            ${usg.ovarium_pco ? 'checked' : ''}>
                                        <label class="custom-control-label" for="ovarium-pco">PCO (Polycystic)</label>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="ovarium-massa"
                                            ${usg.ovarium_massa ? 'checked' : ''}>
                                        <label class="custom-control-label" for="ovarium-massa">Ada Massa</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Massa Detail -->
                        <div id="massa-detail-section" style="display: ${usg.ovarium_massa ? 'block' : 'none'};">
                            <div class="alert alert-warning border">
                                <strong>Detail Massa:</strong>
                                <div class="row mt-2">
                                    <div class="col-6">
                                        <label class="small">Ukuran</label>
                                        <div class="input-group input-group-sm">
                                            <input type="number" step="0.1" class="form-control" id="massa-size-1"
                                                placeholder="0.0" value="${usg.massa_size_1 || ''}">
                                            <div class="input-group-append input-group-prepend"><span class="input-group-text">x</span></div>
                                            <input type="number" step="0.1" class="form-control" id="massa-size-2"
                                                placeholder="0.0" value="${usg.massa_size_2 || ''}">
                                            <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <label class="small">Jenis</label>
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="massa-kista-sederhana"
                                                ${usg.massa_kista_sederhana ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="massa-kista-sederhana">Kista sederhana</label>
                                        </div>
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="massa-kista-kompleks"
                                                ${usg.massa_kista_kompleks ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="massa-kista-kompleks">Kista kompleks</label>
                                        </div>
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="massa-padat"
                                                ${usg.massa_padat ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="massa-padat">Padat</label>
                                        </div>
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="massa-campuran"
                                                ${usg.massa_campuran ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="massa-campuran">Campuran</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="row mt-2">
                                    <div class="col-4">
                                        <label class="small">Internal Echo</label>
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="echo-anekoik"
                                                ${usg.echo_anekoik ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="echo-anekoik">Anekoik</label>
                                        </div>
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="echo-rendah"
                                                ${usg.echo_rendah ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="echo-rendah">Rendah</label>
                                        </div>
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="echo-echogenik"
                                                ${usg.echo_echogenik ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="echo-echogenik">Echogenik</label>
                                        </div>
                                    </div>
                                    <div class="col-4">
                                        <label class="small">Septa</label>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="septa" id="septa-tidak"
                                                value="tidak_ada" ${usg.septa === 'tidak_ada' ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="septa-tidak">Tidak ada</label>
                                        </div>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="septa" id="septa-tipis"
                                                value="tipis" ${usg.septa === 'tipis' ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="septa-tipis">Tipis</label>
                                        </div>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="septa" id="septa-tebal"
                                                value="tebal" ${usg.septa === 'tebal' ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="septa-tebal">Tebal</label>
                                        </div>
                                    </div>
                                    <div class="col-4">
                                        <label class="small">Dinding</label>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="dinding" id="dinding-halus"
                                                value="halus" ${usg.dinding === 'halus' ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="dinding-halus">Halus</label>
                                        </div>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="dinding" id="dinding-irregular"
                                                value="tidak_teratur" ${usg.dinding === 'tidak_teratur' ? 'checked' : ''}>
                                            <label class="custom-control-label small" for="dinding-irregular">Tidak teratur</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h4>Kesan / Kesimpulan</h4>
                        <div class="form-group mb-3">
                            <textarea id="usg-kesan" class="form-control" rows="4"
                                placeholder="Tuliskan kesan/kesimpulan USG...">${this.escapeHtml(usg.kesan || '')}</textarea>
                        </div>
                    </div>
                </div>

                <!-- USG Photos Section -->
                <div class="sc-card mt-3">
                    <h4><i class="fas fa-camera text-info"></i> Foto USG</h4>
                    <div class="form-group">
                        <div class="custom-file mb-3">
                            <input
                                type="file"
                                class="custom-file-input"
                                id="usg-photo-upload"
                                accept="image/*"
                                multiple
                            >
                            <label class="custom-file-label" for="usg-photo-upload">
                                Pilih foto USG...
                            </label>
                        </div>
                        <small class="form-text text-muted">
                            Format: JPG, PNG. Maksimal 10MB per file. Bisa upload multiple foto.
                        </small>
                    </div>

                    <!-- Uploaded Photos Grid -->
                    <div id="usg-photos-grid" class="row">
                        ${this.renderPhotosGrid(usg.photos || [])}
                    </div>

                    <!-- Hidden field to store photo data -->
                    <input
                        type="hidden"
                        id="usg-photos-data"
                        value="${JSON.stringify(usg.photos || []).replace(/"/g, '&quot;')}"
                    >
                </div>

                <div class="mt-3 text-muted small" id="usg-status">
                    ${isSaved ? `<i class="fas fa-check text-success"></i> Terakhir disimpan: ${new Date(usg.saved_at).toLocaleString('id-ID')}` : '<i class="fas fa-info-circle"></i> Belum disimpan'}
                </div>
            </div>
        `;
    },

    /**
     * Setup event listeners after render
     */
    afterRender(state) {
        const saveBtn = document.getElementById('usg-save');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.save());
        }

        // Toggle mioma detail section
        document.querySelectorAll('input[name="mioma"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const section = document.getElementById('mioma-detail-section');
                if (section) {
                    section.style.display = e.target.value === 'ada' ? 'block' : 'none';
                }
            });
        });

        // Toggle massa detail section
        const massaCheckbox = document.getElementById('ovarium-massa');
        if (massaCheckbox) {
            massaCheckbox.addEventListener('change', (e) => {
                const section = document.getElementById('massa-detail-section');
                if (section) {
                    section.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }

        // Photo upload handler
        const photoInput = document.getElementById('usg-photo-upload');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => this.handlePhotoUpload(e));

            // Custom file input label update
            photoInput.addEventListener('change', function() {
                const fileName = this.files.length > 1
                    ? `${this.files.length} foto dipilih`
                    : (this.files[0]?.name || 'Pilih foto USG...');
                const label = this.nextElementSibling;
                if (label && !label.textContent.includes('upload')) {
                    label.textContent = fileName;
                }
            });
        }

        // Initialize photo remove handlers
        this.initPhotoRemoveHandlers();
    },

    /**
     * Collect form data
     */
    collectFormData() {
        return {
            // Informasi Teknis
            transabdominal: document.getElementById('usg-transabdominal')?.checked || false,
            transvaginal: document.getElementById('usg-transvaginal')?.checked || false,
            keduanya: document.getElementById('usg-keduanya')?.checked || false,

            // Uterus
            uterus_posisi: document.querySelector('input[name="uterus-posisi"]:checked')?.value || '',
            uterus_length: document.getElementById('uterus-length')?.value || '',
            uterus_width: document.getElementById('uterus-width')?.value || '',
            uterus_depth: document.getElementById('uterus-depth')?.value || '',
            uterus_volume: document.getElementById('uterus-volume')?.value || '',
            mioma: document.querySelector('input[name="mioma"]:checked')?.value || '',
            adenomyosis: document.querySelector('input[name="adenomyosis"]:checked')?.value || '',

            // Mioma Detail
            mioma_submukosa: document.getElementById('mioma-submukosa')?.checked || false,
            mioma_intramural: document.getElementById('mioma-intramural')?.checked || false,
            mioma_subserosa: document.getElementById('mioma-subserosa')?.checked || false,
            mioma_size_1: document.getElementById('mioma-size-1')?.value || '',
            mioma_size_2: document.getElementById('mioma-size-2')?.value || '',
            mioma_size_3: document.getElementById('mioma-size-3')?.value || '',
            mioma_multiple: document.getElementById('mioma-multiple')?.value || '',

            // Endometrium
            endometrium_thickness: document.getElementById('endometrium-thickness')?.value || '',
            endo_trilaminar: document.getElementById('endo-trilaminar')?.checked || false,
            endo_echogenic: document.getElementById('endo-echogenic')?.checked || false,
            endo_irregular: document.getElementById('endo-irregular')?.checked || false,
            endo_normal: document.getElementById('endo-normal')?.checked || false,
            endo_thick: document.getElementById('endo-thick')?.checked || false,
            endo_polyp: document.getElementById('endo-polyp')?.checked || false,
            endo_fluid: document.getElementById('endo-fluid')?.checked || false,

            // Ovarium
            ovarium_kanan_visible: document.getElementById('ovarium-kanan-visible')?.checked || false,
            ovarium_kiri_visible: document.getElementById('ovarium-kiri-visible')?.checked || false,
            ovarium_kanan_1: document.getElementById('ovarium-kanan-1')?.value || '',
            ovarium_kanan_2: document.getElementById('ovarium-kanan-2')?.value || '',
            ovarium_kanan_3: document.getElementById('ovarium-kanan-3')?.value || '',
            folikel_kanan_min: document.getElementById('folikel-kanan-min')?.value || '',
            folikel_kanan_max: document.getElementById('folikel-kanan-max')?.value || '',
            ovarium_kiri_1: document.getElementById('ovarium-kiri-1')?.value || '',
            ovarium_kiri_2: document.getElementById('ovarium-kiri-2')?.value || '',
            ovarium_kiri_3: document.getElementById('ovarium-kiri-3')?.value || '',
            folikel_kiri_min: document.getElementById('folikel-kiri-min')?.value || '',
            folikel_kiri_max: document.getElementById('folikel-kiri-max')?.value || '',
            ovarium_pco: document.getElementById('ovarium-pco')?.checked || false,
            ovarium_massa: document.getElementById('ovarium-massa')?.checked || false,

            // Massa Detail
            massa_size_1: document.getElementById('massa-size-1')?.value || '',
            massa_size_2: document.getElementById('massa-size-2')?.value || '',
            massa_kista_sederhana: document.getElementById('massa-kista-sederhana')?.checked || false,
            massa_kista_kompleks: document.getElementById('massa-kista-kompleks')?.checked || false,
            massa_padat: document.getElementById('massa-padat')?.checked || false,
            massa_campuran: document.getElementById('massa-campuran')?.checked || false,
            echo_anekoik: document.getElementById('echo-anekoik')?.checked || false,
            echo_rendah: document.getElementById('echo-rendah')?.checked || false,
            echo_echogenik: document.getElementById('echo-echogenik')?.checked || false,
            septa: document.querySelector('input[name="septa"]:checked')?.value || '',
            dinding: document.querySelector('input[name="dinding"]:checked')?.value || '',

            // Kesan
            kesan: document.getElementById('usg-kesan')?.value || '',

            // Photos
            photos: this.getPhotosFromHiddenField(),

            saved_at: new Date().toISOString()
        };
    },

    /**
     * Get photos from hidden field
     */
    getPhotosFromHiddenField() {
        const photosData = document.getElementById('usg-photos-data');
        if (!photosData || !photosData.value) return [];
        try {
            return JSON.parse(photosData.value.replace(/&quot;/g, '"') || '[]');
        } catch (e) {
            return [];
        }
    },

    /**
     * Save USG data
     */
    async save() {
        const state = stateManager.getState();
        const mrId = state.currentMrId ||
                     state.recordData?.mrId ||
                     state.recordData?.mr_id ||
                     state.recordData?.record?.mrId ||
                     state.recordData?.record?.mr_id;

        if (!mrId) {
            console.error('[USGGinekologi] MR ID not found in state:', state);
            alert('Error: MR ID tidak ditemukan');
            return { success: false };
        }

        const saveBtn = document.getElementById('usg-save');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        }

        try {
            const data = this.collectFormData();

            const response = await apiClient.saveSection(mrId, 'usg', data);

            if (response.success) {
                // Update state
                stateManager.updateSectionData('usg', data);

                // Update UI
                const statusEl = document.getElementById('usg-status');
                if (statusEl) {
                    statusEl.innerHTML = `<i class="fas fa-check text-success"></i> Terakhir disimpan: ${new Date().toLocaleString('id-ID')}`;
                }

                // Show success feedback
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> Tersimpan!';
                    setTimeout(() => {
                        saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
                        saveBtn.disabled = false;
                    }, 2000);
                }
            } else {
                throw new Error(response.message || 'Gagal menyimpan');
            }

            return response;
        } catch (error) {
            console.error('Error saving USG ginekologi:', error);
            alert('Gagal menyimpan: ' + error.message);

            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
                saveBtn.disabled = false;
            }

            return { success: false, error: error.message };
        }
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Render photos grid
     */
    renderPhotosGrid(photos) {
        if (!photos || photos.length === 0) {
            return '<div class="col-12"><p class="text-muted">Belum ada foto USG yang diupload</p></div>';
        }

        return photos.map((photo, index) => `
            <div class="col-md-3 col-sm-4 col-6 mb-3">
                <div class="card h-100">
                    <a href="${photo.url}" target="_blank">
                        <img src="${photo.url}" class="card-img-top" alt="${photo.name}"
                            style="height: 150px; object-fit: cover;">
                    </a>
                    <div class="card-body p-2">
                        <small class="text-truncate d-block">${photo.name}</small>
                        <button type="button" class="btn btn-sm btn-danger mt-1 usg-remove-photo"
                            data-index="${index}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Handle photo upload
     */
    async handlePhotoUpload(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        // Validate file size (10MB max per file)
        const maxSize = 10 * 1024 * 1024;
        for (const file of files) {
            if (file.size > maxSize) {
                alert(`File ${file.name} terlalu besar. Maksimal 10MB.`);
                return;
            }
        }

        // Show loading
        const label = event.target.nextElementSibling;
        const originalLabel = label.textContent;
        label.textContent = 'Mengupload...';

        try {
            const formData = new FormData();
            files.forEach(file => formData.append('files', file));

            const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
            const response = await fetch('/api/usg-photos/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();

            // Get current photos from hidden field
            const photosData = document.getElementById('usg-photos-data');
            let currentPhotos = [];
            try {
                currentPhotos = JSON.parse(photosData.value.replace(/&quot;/g, '"') || '[]');
            } catch (e) {
                currentPhotos = [];
            }

            // Merge new photos with existing
            const updatedPhotos = [...currentPhotos, ...result.files];

            // Update hidden field
            photosData.value = JSON.stringify(updatedPhotos).replace(/"/g, '&quot;');

            // Update state
            const state = stateManager.getState();
            const recordData = state.recordData || {};
            const usg = recordData.usg || {};
            usg.photos = updatedPhotos;
            recordData.usg = usg;
            stateManager.setState({ recordData });

            // Refresh photos grid
            const grid = document.getElementById('usg-photos-grid');
            if (grid) {
                grid.innerHTML = this.renderPhotosGrid(updatedPhotos);
                this.initPhotoRemoveHandlers();
            }

            // Save to database immediately
            await this.savePhotosToDatabase(updatedPhotos);

            // Reset file input
            event.target.value = '';
            label.textContent = originalLabel;

            alert(`${result.files.length} foto berhasil diupload!`);
        } catch (error) {
            console.error('Upload error:', error);
            alert('Gagal upload foto. Silakan coba lagi.');
            label.textContent = originalLabel;
        }
    },

    /**
     * Save photos to database
     */
    async savePhotosToDatabase(photos) {
        try {
            const state = stateManager.getState();
            const patientId = state.derived?.patientId ||
                             state.recordData?.patientId ||
                             state.patientData?.id;
            const mrId = state.currentMrId ||
                        state.recordData?.mrId ||
                        state.recordData?.mr_id;

            if (!patientId || !mrId) {
                console.warn('[USG] Patient ID or MR ID not found, skipping database save');
                return;
            }

            const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
            if (!token) {
                console.warn('[USG] No auth token, skipping database save');
                return;
            }

            // Get current USG data from state
            const usg = state.recordData?.usg || {};

            const response = await fetch('/api/medical-records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    patientId: patientId,
                    visitId: mrId,
                    type: 'usg',
                    data: {
                        ...usg,
                        photos: photos
                    },
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[USG] Failed to save photos to database:', errText);
            } else {
                console.log('[USG] Photos saved to database successfully');
            }
        } catch (error) {
            console.error('[USG] Error saving photos to database:', error);
        }
    },

    /**
     * Remove photo
     */
    async removePhoto(index) {
        if (!confirm('Hapus foto ini?')) return;

        // Get current photos
        const photosData = document.getElementById('usg-photos-data');
        let photos = [];
        try {
            photos = JSON.parse(photosData.value.replace(/&quot;/g, '"') || '[]');
        } catch (e) {
            photos = [];
        }

        // Remove photo at index
        photos.splice(index, 1);

        // Update hidden field
        photosData.value = JSON.stringify(photos).replace(/"/g, '&quot;');

        // Update state
        const state = stateManager.getState();
        const recordData = state.recordData || {};
        const usg = recordData.usg || {};
        usg.photos = photos;
        recordData.usg = usg;
        stateManager.setState({ recordData });

        // Refresh photos grid
        const grid = document.getElementById('usg-photos-grid');
        if (grid) {
            grid.innerHTML = this.renderPhotosGrid(photos);
            this.initPhotoRemoveHandlers();
        }

        // Save to database
        await this.savePhotosToDatabase(photos);
    },

    /**
     * Initialize photo remove handlers
     */
    initPhotoRemoveHandlers() {
        document.querySelectorAll('.usg-remove-photo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.removePhoto(index);
            });
        });
    }
};
