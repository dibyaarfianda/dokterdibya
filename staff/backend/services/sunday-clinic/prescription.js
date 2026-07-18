'use strict';

const {
    db,
    parsePrescriptionTemplateItems,
    normalizePrescriptionTemplateItems,
    getPrescriptionTemplateActor
} = require('./shared');

async function getPrescriptionTemplates(req, res, next) {
    try {
        const [rows] = await db.query(
            `SELECT id, name, items, created_by, updated_by, created_at, updated_at
             FROM sunday_clinic_prescription_templates
             WHERE is_active = 1
             ORDER BY updated_at DESC, name ASC`
        );

        res.json({
            success: true,
            data: rows.map((row) => ({
                ...row,
                items: parsePrescriptionTemplateItems(row.items)
            }))
        });
    } catch (error) {
        next(error);
    }
}

async function postPrescriptionTemplates(req, res, next) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const items = normalizePrescriptionTemplateItems(req.body.items);

    if (!name) {
        return res.status(400).json({ success: false, message: 'Nama template wajib diisi.' });
    }

    if (!items) {
        return res.status(400).json({ success: false, message: 'Template harus berisi minimal satu obat.' });
    }

    try {
        const actor = getPrescriptionTemplateActor(req);
        const [result] = await db.query(
            `INSERT INTO sunday_clinic_prescription_templates
             (name, items, created_by, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [name, JSON.stringify(items), actor, actor]
        );

        res.status(201).json({
            success: true,
            message: 'Template obat berhasil disimpan',
            data: {
                id: result.insertId,
                name,
                items
            }
        });
    } catch (error) {
        next(error);
    }
}

async function putPrescriptionTemplatesById(req, res, next) {
    const templateId = Number(req.params.id);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const items = normalizePrescriptionTemplateItems(req.body.items);

    if (!Number.isInteger(templateId) || templateId <= 0) {
        return res.status(400).json({ success: false, message: 'ID template tidak valid.' });
    }

    if (!name) {
        return res.status(400).json({ success: false, message: 'Nama template wajib diisi.' });
    }

    if (!items) {
        return res.status(400).json({ success: false, message: 'Template harus berisi minimal satu obat.' });
    }

    try {
        const [result] = await db.query(
            `UPDATE sunday_clinic_prescription_templates
             SET name = ?, items = ?, updated_by = ?, updated_at = NOW()
             WHERE id = ? AND is_active = 1`,
            [name, JSON.stringify(items), getPrescriptionTemplateActor(req), templateId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Template obat tidak ditemukan.' });
        }

        res.json({
            success: true,
            message: 'Template obat berhasil diperbarui',
            data: {
                id: templateId,
                name,
                items
            }
        });
    } catch (error) {
        next(error);
    }
}

async function deletePrescriptionTemplatesById(req, res, next) {
    const templateId = Number(req.params.id);

    if (!Number.isInteger(templateId) || templateId <= 0) {
        return res.status(400).json({ success: false, message: 'ID template tidak valid.' });
    }

    try {
        const [result] = await db.query(
            `UPDATE sunday_clinic_prescription_templates
             SET is_active = 0, updated_by = ?, updated_at = NOW()
             WHERE id = ? AND is_active = 1`,
            [getPrescriptionTemplateActor(req), templateId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Template obat tidak ditemukan.' });
        }

        res.json({ success: true, message: 'Template obat berhasil dihapus' });
    } catch (error) {
        next(error);
    }
}
module.exports = {
    getPrescriptionTemplates,
    postPrescriptionTemplates,
    putPrescriptionTemplatesById,
    deletePrescriptionTemplatesById
};
