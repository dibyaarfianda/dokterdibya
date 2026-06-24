/**
 * Penunjang Component (Shared)
 * Supporting tests: Lab results, imaging, etc.
 * Used across all 3 templates (Obstetri, Gyn Repro, Gyn Special)
 * (Formerly known as "Laboratorium")
 *
 * Sections:
 * 1. Laboratory Tests
 * 2. Imaging Results
 * 3. Other Supporting Tests
 */

export default {
    /**
     * Render the Penunjang form
     */
    async render(state) {
        const penunjang = state.recordData?.penunjang || {};
        const labTests = penunjang.lab_tests || [];
        const imagingTests = penunjang.imaging || [];
        const otherTests = penunjang.other_tests || [];

        return `
            <div class="card mb-3">
                <div class="card-header bg-success text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-flask"></i> Penunjang (Lab & Imaging)
                    </h5>
                </div>
                <div class="card-body">
                    <!-- Laboratory Tests Section -->
                    ${this.renderLaboratoryTests(labTests)}

                    <hr>

                    <!-- Imaging Results Section -->
                    ${this.renderImagingResults(imagingTests)}

                    <hr>

                    <!-- Other Supporting Tests -->
                    ${this.renderOtherTests(otherTests)}
                </div>
            </div>

            <script>
                window.labTestCounter = ${labTests.length};
                window.imagingTestCounter = ${imagingTests.length};
                window.otherTestCounter = ${otherTests.length};

                // Add Lab Test
                window.addLabTest = function() {
                    const index = window.labTestCounter++;
                    const html = \`
                        <div class="lab-test-item border rounded p-3 mb-3" data-index="\${index}">
                            <div class="row">
                                <div class="col-md-11">
                                    <div class="row">
                                        <div class="col-md-4">
                                            <div class="form-group">
                                                <label>Jenis Pemeriksaan:</label>
                                                <input type="text" class="form-control" name="lab_tests[\${index}][test_name]"
                                                       placeholder="Contoh: Hemoglobin, Leukosit, dll" required>
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="form-group">
                                                <label>Hasil:</label>
                                                <input type="text" class="form-control" name="lab_tests[\${index}][result]"
                                                       placeholder="Nilai hasil">
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="form-group">
                                                <label>Nilai Normal:</label>
                                                <input type="text" class="form-control" name="lab_tests[\${index}][normal_range]"
                                                       placeholder="Rentang normal">
                                            </div>
                                        </div>
                                        <div class="col-md-2">
                                            <div class="form-group">
                                                <label>Satuan:</label>
                                                <input type="text" class="form-control" name="lab_tests[\${index}][unit]"
                                                       placeholder="g/dL, dll">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Catatan:</label>
                                        <input type="text" class="form-control" name="lab_tests[\${index}][notes]"
                                               placeholder="Catatan atau interpretasi hasil">
                                    </div>
                                </div>
                                <div class="col-md-1 text-right">
                                    <button type="button" class="btn btn-danger btn-sm mt-4"
                                            onclick="window.removeLabTest(\${index})">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    \`;
                    document.getElementById('lab-tests-list').insertAdjacentHTML('beforeend', html);
                };

                window.removeLabTest = function(index) {
                    const item = document.querySelector(\`.lab-test-item[data-index="\${index}"]\`);
                    if (item) item.remove();
                };

                // Add Imaging Test
                window.addImagingTest = function() {
                    const index = window.imagingTestCounter++;
                    const html = \`
                        <div class="imaging-test-item border rounded p-3 mb-3" data-index="\${index}">
                            <div class="row">
                                <div class="col-md-11">
                                    <div class="row">
                                        <div class="col-md-4">
                                            <div class="form-group">
                                                <label>Jenis Pemeriksaan:</label>
                                                <select class="form-control" name="imaging[\${index}][imaging_type]">
                                                    <option value="">-- Pilih --</option>
                                                    <option value="xray">X-Ray / Rontgen</option>
                                                    <option value="ct_scan">CT Scan</option>
                                                    <option value="mri">MRI</option>
                                                    <option value="mammography">Mammografi</option>
                                                    <option value="other">Lainnya</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="form-group">
                                                <label>Area / Lokasi:</label>
                                                <input type="text" class="form-control" name="imaging[\${index}][area]"
                                                       placeholder="Contoh: Thorax AP, Abdomen, dll">
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="form-group">
                                                <label>Tanggal:</label>
                                                <input type="date" class="form-control" name="imaging[\${index}][date]">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Hasil / Interpretasi:</label>
                                        <textarea class="form-control" name="imaging[\${index}][result]" rows="2"
                                                  placeholder="Hasil bacaan radiologi..."></textarea>
                                    </div>
                                </div>
                                <div class="col-md-1 text-right">
                                    <button type="button" class="btn btn-danger btn-sm mt-4"
                                            onclick="window.removeImagingTest(\${index})">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    \`;
                    document.getElementById('imaging-tests-list').insertAdjacentHTML('beforeend', html);
                };

                window.removeImagingTest = function(index) {
                    const item = document.querySelector(\`.imaging-test-item[data-index="\${index}"]\`);
                    if (item) item.remove();
                };

                // Add Other Test
                window.addOtherTest = function() {
                    const index = window.otherTestCounter++;
                    const html = \`
                        <div class="other-test-item border rounded p-3 mb-3" data-index="\${index}">
                            <div class="row">
                                <div class="col-md-11">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="form-group">
                                                <label>Jenis Pemeriksaan:</label>
                                                <input type="text" class="form-control" name="other_tests[\${index}][test_name]"
                                                       placeholder="Contoh: EKG, HSG, PAP Smear, dll">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group">
                                                <label>Tanggal:</label>
                                                <input type="date" class="form-control" name="other_tests[\${index}][date]">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Hasil:</label>
                                        <textarea class="form-control" name="other_tests[\${index}][result]" rows="2"
                                                  placeholder="Hasil pemeriksaan..."></textarea>
                                    </div>
                                </div>
                                <div class="col-md-1 text-right">
                                    <button type="button" class="btn btn-danger btn-sm mt-4"
                                            onclick="window.removeOtherTest(\${index})">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    \`;
                    document.getElementById('other-tests-list').insertAdjacentHTML('beforeend', html);
                };

                window.removeOtherTest = function(index) {
                    const item = document.querySelector(\`.other-test-item[data-index="\${index}"]\`);
                    if (item) item.remove();
                };
            </script>
        `;
    },

    /**
     * Render Laboratory Tests section
     */
    renderLaboratoryTests(labTests) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-microscope"></i> Pemeriksaan Laboratorium
                </h6>

                <div id="lab-tests-list">
                    ${this.renderLabTestsList(labTests)}
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.addLabTest()">
                    <i class="fas fa-plus"></i> Tambah Pemeriksaan Lab
                </button>

                <div class="mt-3">
                    <small class="text-muted">
                        <strong>Contoh pemeriksaan lab yang umum:</strong>
                        Darah lengkap (Hb, Leukosit, Trombosit, Hematokrit),
                        Gula darah, Fungsi hati (SGOT/SGPT), Fungsi ginjal (Ureum/Creatinin),
                        Hormone (β-hCG, Prolaktin, FSH, LH, Estradiol, Progesteron, TSH),
                        Urinalisis, dll.
                    </small>
                </div>
            </div>
        `;
    },

    /**
     * Render Lab Tests list
     */
    renderLabTestsList(labTests) {
        if (!labTests || labTests.length === 0) {
            return '<p class="text-muted">Belum ada pemeriksaan lab yang ditambahkan.</p>';
        }

        return labTests.map((test, index) => `
            <div class="lab-test-item border rounded p-3 mb-3" data-index="${index}">
                <div class="row">
                    <div class="col-md-11">
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Jenis Pemeriksaan:</label>
                                    <input type="text" class="form-control" name="lab_tests[${index}][test_name]"
                                           value="${test.test_name || ''}"
                                           placeholder="Contoh: Hemoglobin, Leukosit, dll" required>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Hasil:</label>
                                    <input type="text" class="form-control" name="lab_tests[${index}][result]"
                                           value="${test.result || ''}"
                                           placeholder="Nilai hasil">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Nilai Normal:</label>
                                    <input type="text" class="form-control" name="lab_tests[${index}][normal_range]"
                                           value="${test.normal_range || ''}"
                                           placeholder="Rentang normal">
                                </div>
                            </div>
                            <div class="col-md-2">
                                <div class="form-group">
                                    <label>Satuan:</label>
                                    <input type="text" class="form-control" name="lab_tests[${index}][unit]"
                                           value="${test.unit || ''}"
                                           placeholder="g/dL, dll">
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Catatan:</label>
                            <input type="text" class="form-control" name="lab_tests[${index}][notes]"
                                   value="${test.notes || ''}"
                                   placeholder="Catatan atau interpretasi hasil">
                        </div>
                    </div>
                    <div class="col-md-1 text-right">
                        <button type="button" class="btn btn-danger btn-sm mt-4"
                                onclick="window.removeLabTest(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Render Imaging Results section
     */
    renderImagingResults(imagingTests) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-x-ray"></i> Pemeriksaan Radiologi / Imaging
                </h6>

                <div id="imaging-tests-list">
                    ${this.renderImagingTestsList(imagingTests)}
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.addImagingTest()">
                    <i class="fas fa-plus"></i> Tambah Pemeriksaan Imaging
                </button>

                <div class="mt-3">
                    <small class="text-muted">
                        <strong>Note:</strong> USG Obstetri dan USG Ginekologi memiliki form tersendiri di section USG.
                        Section ini untuk imaging tambahan seperti X-Ray, CT Scan, MRI, Mammografi, dll.
                    </small>
                </div>
            </div>
        `;
    },

    /**
     * Render Imaging Tests list
     */
    renderImagingTestsList(imagingTests) {
        if (!imagingTests || imagingTests.length === 0) {
            return '<p class="text-muted">Belum ada pemeriksaan imaging yang ditambahkan.</p>';
        }

        return imagingTests.map((test, index) => `
            <div class="imaging-test-item border rounded p-3 mb-3" data-index="${index}">
                <div class="row">
                    <div class="col-md-11">
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Jenis Pemeriksaan:</label>
                                    <select class="form-control" name="imaging[${index}][imaging_type]">
                                        <option value="">-- Pilih --</option>
                                        <option value="xray" ${test.imaging_type === 'xray' ? 'selected' : ''}>X-Ray / Rontgen</option>
                                        <option value="ct_scan" ${test.imaging_type === 'ct_scan' ? 'selected' : ''}>CT Scan</option>
                                        <option value="mri" ${test.imaging_type === 'mri' ? 'selected' : ''}>MRI</option>
                                        <option value="mammography" ${test.imaging_type === 'mammography' ? 'selected' : ''}>Mammografi</option>
                                        <option value="other" ${test.imaging_type === 'other' ? 'selected' : ''}>Lainnya</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Area / Lokasi:</label>
                                    <input type="text" class="form-control" name="imaging[${index}][area]"
                                           value="${test.area || ''}"
                                           placeholder="Contoh: Thorax AP, Abdomen, dll">
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Tanggal:</label>
                                    <input type="date" class="form-control" name="imaging[${index}][date]"
                                           value="${test.date || ''}">
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Hasil / Interpretasi:</label>
                            <textarea class="form-control" name="imaging[${index}][result]" rows="2"
                                      placeholder="Hasil bacaan radiologi...">${test.result || ''}</textarea>
                        </div>
                    </div>
                    <div class="col-md-1 text-right">
                        <button type="button" class="btn btn-danger btn-sm mt-4"
                                onclick="window.removeImagingTest(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Render Other Tests section
     */
    renderOtherTests(otherTests) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-clipboard-check"></i> Pemeriksaan Penunjang Lainnya
                </h6>

                <div id="other-tests-list">
                    ${this.renderOtherTestsList(otherTests)}
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.addOtherTest()">
                    <i class="fas fa-plus"></i> Tambah Pemeriksaan Lainnya
                </button>

                <div class="mt-3">
                    <small class="text-muted">
                        <strong>Contoh pemeriksaan lainnya:</strong>
                        EKG, HSG (Hysterosalpingography), PAP Smear, Kolposkopi,
                        Biopsy, Endometrial sampling, dll.
                    </small>
                </div>
            </div>
        `;
    },

    /**
     * Render Other Tests list
     */
    renderOtherTestsList(otherTests) {
        if (!otherTests || otherTests.length === 0) {
            return '<p class="text-muted">Belum ada pemeriksaan lain yang ditambahkan.</p>';
        }

        return otherTests.map((test, index) => `
            <div class="other-test-item border rounded p-3 mb-3" data-index="${index}">
                <div class="row">
                    <div class="col-md-11">
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Jenis Pemeriksaan:</label>
                                    <input type="text" class="form-control" name="other_tests[${index}][test_name]"
                                           value="${test.test_name || ''}"
                                           placeholder="Contoh: EKG, HSG, PAP Smear, dll">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Tanggal:</label>
                                    <input type="date" class="form-control" name="other_tests[${index}][date]"
                                           value="${test.date || ''}">
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Hasil:</label>
                            <textarea class="form-control" name="other_tests[${index}][result]" rows="2"
                                      placeholder="Hasil pemeriksaan...">${test.result || ''}</textarea>
                        </div>
                    </div>
                    <div class="col-md-1 text-right">
                        <button type="button" class="btn btn-danger btn-sm mt-4"
                                onclick="window.removeOtherTest(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Save penunjang data
     */
    async save(state) {
        try {
            const data = {
                lab_tests: this.collectLabTestsData(),
                imaging: this.collectImagingData(),
                other_tests: this.collectOtherTestsData()
            };

            console.log('[Penunjang] Saving data:', data);

            // In production, this would call the API
            // const response = await apiClient.savePenunjang(state.currentMrId, data);

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('[Penunjang] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Collect Lab Tests data
     */
    collectLabTestsData() {
        const tests = [];
        document.querySelectorAll('.lab-test-item').forEach(item => {
            const index = item.dataset.index;
            const testName = document.querySelector(`[name="lab_tests[${index}][test_name]"]`)?.value;
            const result = document.querySelector(`[name="lab_tests[${index}][result]"]`)?.value;
            const normalRange = document.querySelector(`[name="lab_tests[${index}][normal_range]"]`)?.value;
            const unit = document.querySelector(`[name="lab_tests[${index}][unit]"]`)?.value;
            const notes = document.querySelector(`[name="lab_tests[${index}][notes]"]`)?.value;

            if (testName) {
                tests.push({ test_name: testName, result, normal_range: normalRange, unit, notes });
            }
        });

        return tests;
    },

    /**
     * Collect Imaging data
     */
    collectImagingData() {
        const tests = [];
        document.querySelectorAll('.imaging-test-item').forEach(item => {
            const index = item.dataset.index;
            const imagingType = document.querySelector(`[name="imaging[${index}][imaging_type]"]`)?.value;
            const area = document.querySelector(`[name="imaging[${index}][area]"]`)?.value;
            const date = document.querySelector(`[name="imaging[${index}][date]"]`)?.value;
            const result = document.querySelector(`[name="imaging[${index}][result]"]`)?.value;

            if (imagingType || area) {
                tests.push({ imaging_type: imagingType, area, date, result });
            }
        });

        return tests;
    },

    /**
     * Collect Other Tests data
     */
    collectOtherTestsData() {
        const tests = [];
        document.querySelectorAll('.other-test-item').forEach(item => {
            const index = item.dataset.index;
            const testName = document.querySelector(`[name="other_tests[${index}][test_name]"]`)?.value;
            const date = document.querySelector(`[name="other_tests[${index}][date]"]`)?.value;
            const result = document.querySelector(`[name="other_tests[${index}][result]"]`)?.value;

            if (testName) {
                tests.push({ test_name: testName, date, result });
            }
        });

        return tests;
    }
};
