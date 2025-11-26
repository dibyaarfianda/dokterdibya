/**
 * USG Ginekologi Component (Shared for gyn_repro & gyn_special)
 * Structured form for gynecological ultrasound examination
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

        return `
            <div class="card mb-3">
                <div class="card-header bg-info text-white d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-venus"></i> Pemeriksaan USG Ginekologi
                    </h5>
                    ${isSaved ? '<span class="badge badge-light"><i class="fas fa-check"></i> Tersimpan</span>' : ''}
                </div>
                <div class="card-body">
                    <!-- Informasi Teknis -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-info border-bottom pb-2 mb-3">
                            <i class="fas fa-cog"></i> Informasi Teknis
                        </h6>
                        <div class="form-group">
                            <label>Jenis Ultrasonografi</label>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="usg-transabdominal"
                                            ${usg.transabdominal ? 'checked' : ''}>
                                        <label class="custom-control-label" for="usg-transabdominal">Transabdominal</label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="usg-transvaginal"
                                            ${usg.transvaginal ? 'checked' : ''}>
                                        <label class="custom-control-label" for="usg-transvaginal">Transvaginal</label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="usg-keduanya"
                                            ${usg.keduanya ? 'checked' : ''}>
                                        <label class="custom-control-label" for="usg-keduanya">Keduanya</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- RAHIM (UTERUS) -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-info border-bottom pb-2 mb-3">
                            <i class="fas fa-circle"></i> RAHIM (Uterus)
                        </h6>
                        <div class="form-group">
                            <label>Posisi</label>
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="custom-control custom-radio">
                                        <input type="radio" class="custom-control-input" name="uterus-posisi" id="posisi-anteverted"
                                            value="anteverted" ${usg.uterus_posisi === 'anteverted' ? 'checked' : ''}>
                                        <label class="custom-control-label" for="posisi-anteverted">Anteverted</label>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="custom-control custom-radio">
                                        <input type="radio" class="custom-control-input" name="uterus-posisi" id="posisi-retroverted"
                                            value="retroverted" ${usg.uterus_posisi === 'retroverted' ? 'checked' : ''}>
                                        <label class="custom-control-label" for="posisi-retroverted">Retroverted</label>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="custom-control custom-radio">
                                        <input type="radio" class="custom-control-input" name="uterus-posisi" id="posisi-anteflexed"
                                            value="anteflexed" ${usg.uterus_posisi === 'anteflexed' ? 'checked' : ''}>
                                        <label class="custom-control-label" for="posisi-anteflexed">Anteflexed</label>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="custom-control custom-radio">
                                        <input type="radio" class="custom-control-input" name="uterus-posisi" id="posisi-retroflexed"
                                            value="retroflexed" ${usg.uterus_posisi === 'retroflexed' ? 'checked' : ''}>
                                        <label class="custom-control-label" for="posisi-retroflexed">Retroflexed</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Ukuran Uterus</label>
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="input-group input-group-sm">
                                        <div class="input-group-prepend"><span class="input-group-text">L</span></div>
                                        <input type="number" step="0.1" class="form-control" id="uterus-length"
                                            placeholder="0.0" value="${usg.uterus_length || ''}">
                                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="input-group input-group-sm">
                                        <div class="input-group-prepend"><span class="input-group-text">W</span></div>
                                        <input type="number" step="0.1" class="form-control" id="uterus-width"
                                            placeholder="0.0" value="${usg.uterus_width || ''}">
                                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="input-group input-group-sm">
                                        <div class="input-group-prepend"><span class="input-group-text">D</span></div>
                                        <input type="number" step="0.1" class="form-control" id="uterus-depth"
                                            placeholder="0.0" value="${usg.uterus_depth || ''}">
                                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="input-group input-group-sm">
                                        <div class="input-group-prepend"><span class="input-group-text">Vol</span></div>
                                        <input type="number" step="0.1" class="form-control" id="uterus-volume"
                                            placeholder="0.0" value="${usg.uterus_volume || ''}">
                                        <div class="input-group-append"><span class="input-group-text">ml</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Mioma</label>
                                    <div class="d-flex">
                                        <div class="custom-control custom-radio mr-3">
                                            <input type="radio" class="custom-control-input" name="mioma" id="mioma-ada"
                                                value="ada" ${usg.mioma === 'ada' ? 'checked' : ''}>
                                            <label class="custom-control-label" for="mioma-ada">Ada</label>
                                        </div>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="mioma" id="mioma-tidak"
                                                value="tidak_ada" ${usg.mioma === 'tidak_ada' ? 'checked' : ''}>
                                            <label class="custom-control-label" for="mioma-tidak">Tidak ada</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Adenomyosis</label>
                                    <div class="d-flex">
                                        <div class="custom-control custom-radio mr-3">
                                            <input type="radio" class="custom-control-input" name="adenomyosis" id="adenomyosis-ada"
                                                value="ada" ${usg.adenomyosis === 'ada' ? 'checked' : ''}>
                                            <label class="custom-control-label" for="adenomyosis-ada">Ada</label>
                                        </div>
                                        <div class="custom-control custom-radio">
                                            <input type="radio" class="custom-control-input" name="adenomyosis" id="adenomyosis-tidak"
                                                value="tidak_ada" ${usg.adenomyosis === 'tidak_ada' ? 'checked' : ''}>
                                            <label class="custom-control-label" for="adenomyosis-tidak">Tidak ada</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Rincian Mioma -->
                        <div class="card bg-light mb-3" id="mioma-detail-section" style="display: ${usg.mioma === 'ada' ? 'block' : 'none'};">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-info-circle"></i> Rincian Mioma (jika ada)</h6>
                                <div class="form-group">
                                    <label>Lokasi</label>
                                    <div class="row">
                                        <div class="col-md-4">
                                            <div class="custom-control custom-checkbox">
                                                <input type="checkbox" class="custom-control-input" id="mioma-submukosa"
                                                    ${usg.mioma_submukosa ? 'checked' : ''}>
                                                <label class="custom-control-label" for="mioma-submukosa">Submukosa</label>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="custom-control custom-checkbox">
                                                <input type="checkbox" class="custom-control-input" id="mioma-intramural"
                                                    ${usg.mioma_intramural ? 'checked' : ''}>
                                                <label class="custom-control-label" for="mioma-intramural">Intramural</label>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="custom-control custom-checkbox">
                                                <input type="checkbox" class="custom-control-input" id="mioma-subserosa"
                                                    ${usg.mioma_subserosa ? 'checked' : ''}>
                                                <label class="custom-control-label" for="mioma-subserosa">Subserosa</label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-8">
                                        <div class="form-group">
                                            <label>Ukuran Mioma</label>
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
                                    </div>
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label>Multiple Myoma</label>
                                            <div class="d-flex">
                                                <div class="custom-control custom-radio mr-3">
                                                    <input type="radio" class="custom-control-input" name="mioma-multiple" id="mioma-multiple-ya"
                                                        value="ya" ${usg.mioma_multiple === 'ya' ? 'checked' : ''}>
                                                    <label class="custom-control-label" for="mioma-multiple-ya">Ya</label>
                                                </div>
                                                <div class="custom-control custom-radio">
                                                    <input type="radio" class="custom-control-input" name="mioma-multiple" id="mioma-multiple-tidak"
                                                        value="tidak" ${usg.mioma_multiple === 'tidak' ? 'checked' : ''}>
                                                    <label class="custom-control-label" for="mioma-multiple-tidak">Tidak</label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- DINDING RAHIM (ENDOMETRIUM) -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-info border-bottom pb-2 mb-3">
                            <i class="fas fa-layer-group"></i> Dinding Rahim (Endometrium)
                        </h6>
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Ketebalan</label>
                                    <div class="input-group input-group-sm">
                                        <input type="number" step="0.1" class="form-control" id="endometrium-thickness"
                                            placeholder="0.0" value="${usg.endometrium_thickness || ''}">
                                        <div class="input-group-append"><span class="input-group-text">mm</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Morfologi</label>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="endo-trilaminar"
                                            ${usg.endo_trilaminar ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-trilaminar">Trilaminar</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="endo-echogenic"
                                            ${usg.endo_echogenic ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-echogenic">Echogenic</label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="endo-irregular"
                                            ${usg.endo_irregular ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-irregular">Tidak teratur</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="endo-normal"
                                            ${usg.endo_normal ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-normal">Normal untuk fase siklus</label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="endo-thick"
                                            ${usg.endo_thick ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-thick">Tebal</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="endo-polyp"
                                            ${usg.endo_polyp ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-polyp">Curiga polip</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="endo-fluid"
                                            ${usg.endo_fluid ? 'checked' : ''}>
                                        <label class="custom-control-label" for="endo-fluid">Tampak Cairan</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- INDUNG TELUR (OVARIUM) -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-info border-bottom pb-2 mb-3">
                            <i class="fas fa-circle-notch"></i> Indung Telur (Ovarium) Kanan/Kiri
                        </h6>
                        <div class="form-group">
                            <label>Teridentifikasi</label>
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
                        <div class="row">
                            <div class="col-md-6">
                                <div class="card bg-light mb-2">
                                    <div class="card-body py-2">
                                        <h6 class="card-title mb-2"><strong>Ovarium KANAN</strong></h6>
                                        <div class="form-group mb-2">
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
                                        <div class="form-group mb-0">
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
                            </div>
                            <div class="col-md-6">
                                <div class="card bg-light mb-2">
                                    <div class="card-body py-2">
                                        <h6 class="card-title mb-2"><strong>Ovarium KIRI</strong></h6>
                                        <div class="form-group mb-2">
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
                                        <div class="form-group mb-0">
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
                            </div>
                        </div>
                        <div class="form-group">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="ovarium-pco"
                                            ${usg.ovarium_pco ? 'checked' : ''}>
                                        <label class="custom-control-label" for="ovarium-pco">Penampakan PCO (Polycystic Ovary)</label>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="ovarium-massa"
                                            ${usg.ovarium_massa ? 'checked' : ''}>
                                        <label class="custom-control-label" for="ovarium-massa">Ada Massa</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Detail Massa -->
                        <div class="card bg-light mb-3" id="massa-detail-section" style="display: ${usg.ovarium_massa ? 'block' : 'none'};">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-info-circle"></i> Detail Massa (jika ada)</h6>
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <label>Ukuran Massa</label>
                                            <div class="input-group input-group-sm">
                                                <input type="number" step="0.1" class="form-control" id="massa-size-1"
                                                    placeholder="0.0" value="${usg.massa_size_1 || ''}">
                                                <div class="input-group-append input-group-prepend"><span class="input-group-text">x</span></div>
                                                <input type="number" step="0.1" class="form-control" id="massa-size-2"
                                                    placeholder="0.0" value="${usg.massa_size_2 || ''}">
                                                <div class="input-group-append"><span class="input-group-text">cm</span></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <label>Jenis</label>
                                            <div class="row">
                                                <div class="col-6">
                                                    <div class="custom-control custom-checkbox mb-1">
                                                        <input type="checkbox" class="custom-control-input" id="massa-kista-sederhana"
                                                            ${usg.massa_kista_sederhana ? 'checked' : ''}>
                                                        <label class="custom-control-label small" for="massa-kista-sederhana">Kista sederhana</label>
                                                    </div>
                                                    <div class="custom-control custom-checkbox">
                                                        <input type="checkbox" class="custom-control-input" id="massa-kista-kompleks"
                                                            ${usg.massa_kista_kompleks ? 'checked' : ''}>
                                                        <label class="custom-control-label small" for="massa-kista-kompleks">Kista kompleks</label>
                                                    </div>
                                                </div>
                                                <div class="col-6">
                                                    <div class="custom-control custom-checkbox mb-1">
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
                                        </div>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label>Internal Echo</label>
                                            <div class="custom-control custom-checkbox mb-1">
                                                <input type="checkbox" class="custom-control-input" id="echo-anekoik"
                                                    ${usg.echo_anekoik ? 'checked' : ''}>
                                                <label class="custom-control-label small" for="echo-anekoik">Anekoik</label>
                                            </div>
                                            <div class="custom-control custom-checkbox mb-1">
                                                <input type="checkbox" class="custom-control-input" id="echo-rendah"
                                                    ${usg.echo_rendah ? 'checked' : ''}>
                                                <label class="custom-control-label small" for="echo-rendah">Tingkat rendah</label>
                                            </div>
                                            <div class="custom-control custom-checkbox">
                                                <input type="checkbox" class="custom-control-input" id="echo-echogenik"
                                                    ${usg.echo_echogenik ? 'checked' : ''}>
                                                <label class="custom-control-label small" for="echo-echogenik">Echogenik</label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label>Bersepta</label>
                                            <div class="custom-control custom-radio mb-1">
                                                <input type="radio" class="custom-control-input" name="septa" id="septa-tidak"
                                                    value="tidak_ada" ${usg.septa === 'tidak_ada' ? 'checked' : ''}>
                                                <label class="custom-control-label small" for="septa-tidak">Tidak ada</label>
                                            </div>
                                            <div class="custom-control custom-radio mb-1">
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
                                    </div>
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label>Dinding</label>
                                            <div class="custom-control custom-radio mb-1">
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
                        </div>
                    </div>

                    <!-- KESAN -->
                    <div class="form-section mb-3">
                        <h6 class="section-title text-info border-bottom pb-2 mb-3">
                            <i class="fas fa-clipboard-check"></i> Kesan / Kesimpulan
                        </h6>
                        <div class="form-group">
                            <textarea id="usg-kesan" class="form-control" rows="3"
                                placeholder="Tuliskan kesan/kesimpulan USG...">${this.escapeHtml(usg.kesan || '')}</textarea>
                        </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <small class="text-muted" id="usg-status">
                            ${isSaved ? `Terakhir disimpan: ${new Date(usg.saved_at).toLocaleString('id-ID')}` : 'Belum disimpan'}
                        </small>
                        <div>
                            <button type="button" class="btn btn-outline-secondary btn-sm mr-2" id="usg-reset">
                                <i class="fas fa-undo"></i> Reset
                            </button>
                            <button type="button" class="btn btn-info" id="usg-save">
                                <i class="fas fa-save"></i> Simpan
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Setup event listeners after render
     */
    afterRender(state) {
        const saveBtn = document.getElementById('usg-save');
        const resetBtn = document.getElementById('usg-reset');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.save());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.reset(state));
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
            mioma_multiple: document.querySelector('input[name="mioma-multiple"]:checked')?.value || '',

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

            saved_at: new Date().toISOString()
        };
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
                    statusEl.textContent = `Terakhir disimpan: ${new Date().toLocaleString('id-ID')}`;
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
     * Reset form to original state
     */
    reset(state) {
        const usg = state.recordData?.usg || {};
        // For simplicity, reload the page section
        location.reload();
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
