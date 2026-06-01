/*
 * Profile Photo Cropper
 * One-shot square crop flow for patient profile photos.
 */
(function() {
    'use strict';

    var STYLE_ID = 'profile-photo-cropper-style';
    var CROP_SIZE = 260;
    var OUTPUT_SIZE = 512;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.profile-cropper-backdrop{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px;}',
            '.profile-cropper-card{width:min(420px,100%);background:#fff;border-radius:28px;padding:20px;color:#111;box-shadow:0 28px 80px rgba(0,0,0,.28);font-family:inherit;}',
            '.profile-cropper-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}',
            '.profile-cropper-head h3{margin:0;font-size:22px;line-height:1.1;font-weight:900;}',
            '.profile-cropper-head p{margin:5px 0 0;color:#666;font-size:13px;line-height:1.35;}',
            '.profile-cropper-close{width:38px;height:38px;border:0;border-radius:999px;background:#f1f1f1;color:#111;font-size:22px;line-height:1;cursor:pointer;}',
            '.profile-cropper-stage{width:260px;height:260px;margin:14px auto 16px;position:relative;overflow:hidden;background:#eee;touch-action:none;box-shadow:inset 0 0 0 2px rgba(255,255,255,.9),0 0 0 1px rgba(0,0,0,.12);}',
            '.profile-cropper-stage.is-circle{border-radius:50%;}',
            '.profile-cropper-stage.is-square{border-radius:24px;}',
            '.profile-cropper-stage img{position:absolute;left:0;top:0;max-width:none;user-select:none;-webkit-user-drag:none;touch-action:none;}',
            '.profile-cropper-guide{position:absolute;inset:0;box-shadow:inset 0 0 0 2px rgba(255,255,255,.9);pointer-events:none;}',
            '.profile-cropper-stage.is-circle .profile-cropper-guide{border-radius:50%;}',
            '.profile-cropper-stage.is-square .profile-cropper-guide{border-radius:24px;}',
            '.profile-cropper-control{display:grid;gap:7px;margin:0 0 14px;}',
            '.profile-cropper-control label{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#666;}',
            '.profile-cropper-control input{width:100%;accent-color:#111;}',
            '.profile-cropper-status{min-height:18px;margin:0 0 12px;font-size:13px;color:#666;text-align:center;}',
            '.profile-cropper-actions{display:flex;gap:10px;}',
            '.profile-cropper-actions button{flex:1;border:0;border-radius:999px;padding:13px 15px;font-weight:900;cursor:pointer;}',
            '.profile-cropper-cancel{background:#f0f0f0;color:#111;}',
            '.profile-cropper-save{background:#111;color:#fff;}',
            '.profile-cropper-actions button:disabled{opacity:.58;cursor:not-allowed;}'
        ].join('');
        document.head.appendChild(style);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function openProfilePhotoCropper(options) {
        options = options || {};
        if (!options.file) return;

        ensureStyles();

        var shape = options.shape === 'square' ? 'square' : 'circle';
        var objectUrl = URL.createObjectURL(options.file);
        var backdrop = document.createElement('div');
        backdrop.className = 'profile-cropper-backdrop';
        backdrop.innerHTML =
            '<div class="profile-cropper-card" role="dialog" aria-modal="true" aria-label="Crop foto profil">' +
                '<div class="profile-cropper-head">' +
                    '<div><h3>' + (options.title || 'Atur Foto Profil') + '</h3>' +
                    '<p>Geser foto untuk mengatur posisi. Setelah disimpan, crop tidak bisa diedit lagi kecuali upload ulang.</p></div>' +
                    '<button type="button" class="profile-cropper-close" aria-label="Tutup">&times;</button>' +
                '</div>' +
                '<div class="profile-cropper-stage is-' + shape + '">' +
                    '<img alt="Preview foto">' +
                    '<div class="profile-cropper-guide"></div>' +
                '</div>' +
                '<div class="profile-cropper-control">' +
                    '<label>Zoom</label>' +
                    '<input type="range" min="1" max="3" step="0.01" value="1">' +
                '</div>' +
                '<div class="profile-cropper-status"></div>' +
                '<div class="profile-cropper-actions">' +
                    '<button type="button" class="profile-cropper-cancel">Batal</button>' +
                    '<button type="button" class="profile-cropper-save">Simpan Foto</button>' +
                '</div>' +
            '</div>';

        var img = backdrop.querySelector('img');
        var stage = backdrop.querySelector('.profile-cropper-stage');
        var range = backdrop.querySelector('input[type="range"]');
        var status = backdrop.querySelector('.profile-cropper-status');
        var closeBtn = backdrop.querySelector('.profile-cropper-close');
        var cancelBtn = backdrop.querySelector('.profile-cropper-cancel');
        var saveBtn = backdrop.querySelector('.profile-cropper-save');

        var naturalW = 0;
        var naturalH = 0;
        var baseScale = 1;
        var zoom = 1;
        var x = 0;
        var y = 0;
        var dragging = false;
        var startX = 0;
        var startY = 0;
        var startImgX = 0;
        var startImgY = 0;
        var saving = false;

        function setStatus(message) {
            status.textContent = message || '';
        }

        function scaledW() {
            return naturalW * baseScale * zoom;
        }

        function scaledH() {
            return naturalH * baseScale * zoom;
        }

        function clampPosition() {
            x = clamp(x, CROP_SIZE - scaledW(), 0);
            y = clamp(y, CROP_SIZE - scaledH(), 0);
        }

        function renderImage() {
            clampPosition();
            img.style.width = scaledW() + 'px';
            img.style.height = scaledH() + 'px';
            img.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        }

        function closeModal() {
            if (saving) return;
            URL.revokeObjectURL(objectUrl);
            backdrop.remove();
            document.body.style.overflow = '';
            if (typeof options.onCancel === 'function') options.onCancel();
        }

        img.onload = function() {
            naturalW = img.naturalWidth;
            naturalH = img.naturalHeight;
            baseScale = Math.max(CROP_SIZE / naturalW, CROP_SIZE / naturalH);
            x = (CROP_SIZE - scaledW()) / 2;
            y = (CROP_SIZE - scaledH()) / 2;
            renderImage();
        };
        img.src = objectUrl;

        range.addEventListener('input', function() {
            var oldZoom = zoom;
            var centerX = CROP_SIZE / 2;
            var centerY = CROP_SIZE / 2;
            var relX = (centerX - x) / oldZoom;
            var relY = (centerY - y) / oldZoom;

            zoom = parseFloat(range.value) || 1;
            x = centerX - relX * zoom;
            y = centerY - relY * zoom;
            renderImage();
        });

        stage.addEventListener('pointerdown', function(event) {
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            startImgX = x;
            startImgY = y;
            stage.setPointerCapture(event.pointerId);
        });

        stage.addEventListener('pointermove', function(event) {
            if (!dragging) return;
            x = startImgX + (event.clientX - startX);
            y = startImgY + (event.clientY - startY);
            renderImage();
        });

        stage.addEventListener('pointerup', function(event) {
            dragging = false;
            try { stage.releasePointerCapture(event.pointerId); } catch (error) {}
        });

        stage.addEventListener('pointercancel', function() {
            dragging = false;
        });

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        saveBtn.addEventListener('click', function() {
            if (saving || !naturalW || !naturalH) return;

            saving = true;
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            closeBtn.disabled = true;
            setStatus('Menyimpan foto...');

            var canvas = document.createElement('canvas');
            canvas.width = OUTPUT_SIZE;
            canvas.height = OUTPUT_SIZE;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

            var scale = baseScale * zoom;
            var sourceX = -x / scale;
            var sourceY = -y / scale;
            var sourceSize = CROP_SIZE / scale;
            ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

            canvas.toBlob(function(blob) {
                if (!blob) {
                    saving = false;
                    saveBtn.disabled = false;
                    cancelBtn.disabled = false;
                    closeBtn.disabled = false;
                    setStatus('Gagal memproses foto. Coba pilih foto lain.');
                    return;
                }

                Promise.resolve(typeof options.onSave === 'function' ? options.onSave(blob) : true)
                    .then(function(result) {
                        if (result === false) {
                            saving = false;
                            saveBtn.disabled = false;
                            cancelBtn.disabled = false;
                            closeBtn.disabled = false;
                            setStatus('');
                            return;
                        }
                        URL.revokeObjectURL(objectUrl);
                        backdrop.remove();
                        document.body.style.overflow = '';
                    })
                    .catch(function(error) {
                        saving = false;
                        saveBtn.disabled = false;
                        cancelBtn.disabled = false;
                        closeBtn.disabled = false;
                        setStatus(error && error.message ? error.message : 'Upload gagal. Coba lagi.');
                    });
            }, 'image/jpeg', 0.9);
        });

        document.body.appendChild(backdrop);
        document.body.style.overflow = 'hidden';
    }

    window.openProfilePhotoCropper = openProfilePhotoCropper;
})();
