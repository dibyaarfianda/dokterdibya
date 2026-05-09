const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireMenuAccess } = require('../middleware/auth');

// Helper function to generate billing number
// Uses SELECT FOR UPDATE inside a transaction to prevent duplicate numbers under concurrent requests
async function generateBillingNumber(conn) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

  // Lock the row for this date so concurrent calls wait rather than reading the same value
  const [rows] = await conn.query(
    'SELECT last_number FROM billing_sequences WHERE billing_date = CURDATE() FOR UPDATE'
  );

  let nextNumber;
  if (rows.length === 0) {
    // First billing of the day — INSERT with ON DUPLICATE KEY to handle any slim concurrent race
    await conn.query(
      'INSERT INTO billing_sequences (billing_date, last_number) VALUES (CURDATE(), 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1'
    );
    const [[seq]] = await conn.query(
      'SELECT last_number FROM billing_sequences WHERE billing_date = CURDATE()'
    );
    nextNumber = seq.last_number;
  } else {
    // Increment sequence
    await conn.query(
      'UPDATE billing_sequences SET last_number = last_number + 1 WHERE billing_date = CURDATE()'
    );
    nextNumber = rows[0].last_number + 1;
  }

  // Format: INV-YYYYMMDD-XXXX
  const billingNumber = `INV-${dateStr}-${String(nextNumber).padStart(4, '0')}`;
  return billingNumber;
}

// POST /api/billings - Create new billing from patient record
router.post('/', verifyToken, requireMenuAccess('keuangan'), async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      patient_id,
      patient_record_id,
      submission_id,
      items = [], // Array of {item_type, item_code, item_name, description, quantity, unit_price}
      discount_percent = 0,
      tax_percent = 0,
      payment_method = null,
      notes = null
    } = req.body;
    
    // Validate required fields
    if (!patient_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'patient_id is required' 
      });
    }
    
    if (!items || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one billing item is required' 
      });
    }
    
    // Calculate amounts
    let subtotal = 0;
    const billingItems = items.map(item => {
      const itemSubtotal = (item.quantity || 1) * (item.unit_price || 0);
      const itemDiscount = 0; // Item-level discount can be added later
      const itemTotal = itemSubtotal - itemDiscount;
      subtotal += itemTotal;
      
      return {
        ...item,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        subtotal: itemSubtotal,
        discount_amount: itemDiscount,
        total_amount: itemTotal
      };
    });
    
    const discount_amount = subtotal * (discount_percent / 100);
    const subtotal_after_discount = subtotal - discount_amount;
    const tax_amount = subtotal_after_discount * (tax_percent / 100);
    const total_amount = subtotal_after_discount + tax_amount;
    
    // Generate billing number (passes the open connection so FOR UPDATE works in same transaction)
    const billing_number = await generateBillingNumber(connection);
    
    // Insert billing record
    const [result] = await connection.query(
      `INSERT INTO billings (
        billing_number, patient_id, patient_record_id, submission_id,
        billing_date, subtotal, discount_amount, discount_percent,
        tax_amount, tax_percent, total_amount, payment_status,
        payment_method, notes, created_by
      ) VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?)`,
      [
        billing_number,
        patient_id,
        patient_record_id || null,
        submission_id || null,
        subtotal,
        discount_amount,
        discount_percent,
        tax_amount,
        tax_percent,
        total_amount,
        payment_method || null,
        notes || null,
        req.user.id
      ]
    );
    
    const billing_id = result.insertId;
    
    // Insert billing items
    for (const item of billingItems) {
      await connection.query(
        `INSERT INTO billing_items (
          billing_id, item_type, item_code, item_name, description,
          quantity, unit_price, subtotal, discount_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billing_id,
          item.item_type,
          item.item_code || null,
          item.item_name,
          item.description || null,
          item.quantity,
          item.unit_price,
          item.subtotal,
          item.discount_amount,
          item.total_amount
        ]
      );
    }
    
    await connection.commit();
    
    // Fetch created billing with items
    const [billings] = await db.query(
      `SELECT b.*, p.full_name as patient_name, p.whatsapp, p.email
       FROM billings b
       LEFT JOIN patients p ON b.patient_id = p.id
       WHERE b.id = ?`,
      [billing_id]
    );
    
    const [items_result] = await db.query(
      'SELECT * FROM billing_items WHERE billing_id = ? ORDER BY id',
      [billing_id]
    );
    
    res.status(201).json({
      success: true,
      message: 'Billing created successfully',
      data: {
        ...billings[0],
        items: items_result
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating billing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create billing',
      error: error.message 
    });
  } finally {
    connection.release();
  }
});

// GET /api/billings/my-billings - Get billings for authenticated patient (public access)
router.get('/my-billings', async (req, res) => {
  try {
    // Get patient ID from token or session
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    const token = authHeader.substring(7);
    
    // Verify token (basic verification for patient)
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    // Get patient ID from decoded token
    const patientId = decoded.id || decoded.patientId;
    
    if (!patientId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Patient ID not found in token' 
      });
    }
    
    const [billings] = await db.query(
      `SELECT b.*, p.full_name as patient_name
       FROM billings b
       LEFT JOIN patients p ON b.patient_id = p.id
       WHERE b.patient_id = ?
       ORDER BY b.billing_date DESC, b.id DESC`,
      [patientId]
    );
    
    res.json({
      success: true,
      count: billings.length,
      data: billings
    });
    
  } catch (error) {
    console.error('Error fetching patient billings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch patient billings',
      error: error.message 
    });
  }
});

// GET /api/billings/:id/details - Get billing details for patient (public access)
router.get('/:id/details', async (req, res) => {
  try {
    // Get patient ID from token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    const patientId = decoded.id || decoded.patientId;
    
    if (!patientId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Patient ID not found in token' 
      });
    }
    
    // Get billing with patient verification
    const [billings] = await db.query(
      `SELECT b.*, p.full_name as patient_name, p.whatsapp, p.email,
              u.name as created_by_name
       FROM billings b
       LEFT JOIN patients p ON b.patient_id = p.id
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.id = ? AND b.patient_id = ?`,
      [req.params.id, patientId]
    );
    
    if (billings.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Billing not found or access denied' 
      });
    }
    
    const [items] = await db.query(
      'SELECT * FROM billing_items WHERE billing_id = ? ORDER BY id',
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: {
        ...billings[0],
        items
      }
    });
    
  } catch (error) {
    console.error('Error fetching billing details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch billing details',
      error: error.message 
    });
  }
});

// GET /api/billings/:id - Get billing by ID
router.get('/:id', verifyToken, requireMenuAccess('keuangan'), async (req, res) => {
  try {
    const [billings] = await db.query(
      `SELECT b.*, p.full_name as patient_name, p.whatsapp, p.email,
              u.name as created_by_name
       FROM billings b
       LEFT JOIN patients p ON b.patient_id = p.id
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.id = ?`,
      [req.params.id]
    );
    
    if (billings.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Billing not found' 
      });
    }
    
    const [items] = await db.query(
      'SELECT * FROM billing_items WHERE billing_id = ? ORDER BY id',
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: {
        ...billings[0],
        items
      }
    });
    
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch billing',
      error: error.message 
    });
  }
});

// GET /api/billings/patient/:patientId - Get all billings for a patient
router.get('/patient/:patientId', verifyToken, requireMenuAccess('keuangan'), async (req, res) => {
  try {
    const [billings] = await db.query(
      `SELECT b.*, p.full_name as patient_name
       FROM billings b
       LEFT JOIN patients p ON b.patient_id = p.id
       WHERE b.patient_id = ?
       ORDER BY b.billing_date DESC, b.id DESC`,
      [req.params.patientId]
    );
    
    res.json({
      success: true,
      count: billings.length,
      data: billings
    });
    
  } catch (error) {
    console.error('Error fetching patient billings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch patient billings',
      error: error.message 
    });
  }
});

// POST /api/billings/:id/payment - Record payment for billing
router.post('/:id/payment', verifyToken, requireMenuAccess('keuangan'), async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { amount, payment_method, reference_number, notes } = req.body;
    const billing_id = req.params.id;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid payment amount is required' 
      });
    }
    
    if (!payment_method) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment method is required' 
      });
    }
    
    // Lock billing row so concurrent payment submissions cannot both complete
    // stock deduction from the same pre-payment state.
    const [billings] = await connection.query(
      'SELECT * FROM billings WHERE id = ? FOR UPDATE',
      [billing_id]
    );
    
    if (billings.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Billing not found' 
      });
    }
    
    const billing = billings[0];
    const new_paid_amount = parseFloat(billing.paid_amount) + parseFloat(amount);
    const total_amount = parseFloat(billing.total_amount);
    
    // Determine payment status
    let payment_status = 'unpaid';
    if (new_paid_amount >= total_amount) {
      payment_status = 'paid';
    } else if (new_paid_amount > 0) {
      payment_status = 'partial';
    }
    
    // Insert payment transaction
    await connection.query(
      `INSERT INTO payment_transactions (
        billing_id, transaction_date, amount, payment_method,
        reference_number, notes, created_by
      ) VALUES (?, NOW(), ?, ?, ?, ?, ?)`,
      [
        billing_id,
        amount,
        payment_method,
        reference_number || null,
        notes || null,
        req.user.id
      ]
    );
    
    // Update billing
    await connection.query(
      `UPDATE billings
       SET paid_amount = ?, payment_status = ?, payment_method = ?, payment_date = NOW()
       WHERE id = ?`,
      [new_paid_amount, payment_status, payment_method, billing_id]
    );

    // Auto deduct stock when payment is complete (FIFO)
    if (payment_status === 'paid' && billing.payment_status !== 'paid') {
      const InventoryService = require('../services/InventoryService');

      // Get medication items from billing and resolve obat_id strictly.
      const [medicationItemsRaw] = await connection.query(
        `SELECT bi.item_code, bi.item_name, bi.quantity,
                COALESCE(o_code.id, o_id.id) AS obat_id
         FROM billing_items bi
         LEFT JOIN obat o_code ON bi.item_code = o_code.code
         LEFT JOIN obat o_id ON (bi.item_code REGEXP '^[0-9]+$' AND CAST(bi.item_code AS UNSIGNED) = o_id.id)
         WHERE bi.billing_id = ? AND bi.item_type = 'medication'`,
        [billing_id]
      );

      const invalidMedicationItems = medicationItemsRaw.filter(item => !item.obat_id);
      if (invalidMedicationItems.length > 0) {
        throw new Error(
          `Data obat tidak valid pada billing: ${invalidMedicationItems.map(i => i.item_name || i.item_code).join(', ')}`
        );
      }

      // Deduct stock for each medication using FIFO (idempotent per reference+obat).
      // Batch-fetch all existing deductions for this billing in ONE query (avoid N+1).
      const obatIds = medicationItemsRaw.map(i => Number(i.obat_id));
      const [deductionRows] = await connection.query(
        `SELECT obat_id, ABS(COALESCE(SUM(quantity), 0)) AS deducted_qty
         FROM stock_movements
         WHERE reference_type = 'billing'
           AND reference_id = ?
           AND movement_type = 'sale'
           AND obat_id IN (?)
         GROUP BY obat_id`,
        [billing_id, obatIds]
      );
      const deductionMap = new Map(deductionRows.map(r => [Number(r.obat_id), Number(r.deducted_qty)]));

      for (const item of medicationItemsRaw) {
        const requiredQty = parseInt(item.quantity, 10) || 0;

        if (requiredQty <= 0) {
          continue;
        }

        const alreadyDeducted = deductionMap.get(Number(item.obat_id)) || 0;
        const remainingQty = Math.max(0, requiredQty - alreadyDeducted);

        if (remainingQty <= 0) {
          continue;
        }

        await InventoryService.deductStockFIFO(
          Number(item.obat_id),
          remainingQty,
          'billing',
          billing_id,
          req.user?.name || 'system'
        );
      }

      // Auto-complete appointment when payment is marked as paid
      // Only for Klinik Private (other hospitals auto-complete on resume save)
      try {
        const [appointmentCheck] = await connection.query(
          `SELECT id, hospital_location FROM appointments
           WHERE patient_id = ? AND appointment_date = ?
           ORDER BY created_at DESC LIMIT 1`,
          [billing.patient_id, billing.billing_date]
        );

        // Only auto-complete if appointment is for Klinik Private
        if (appointmentCheck.length > 0 &&
            appointmentCheck[0].hospital_location === 'klinik_private') {
          const appointmentScheduler = require('../services/appointmentScheduler');
          await appointmentScheduler.autoCompleteOnPayment(
            appointmentCheck[0].id,
            billing.billing_number
          );
        }
      } catch (appointmentError) {
        console.warn('Appointment auto-complete warning:', appointmentError.message);
        // Don't fail the payment, just log the error
      }
    }

    await connection.commit();
    
    // Fetch updated billing
    const [updated] = await db.query(
      `SELECT b.*, p.full_name as patient_name
       FROM billings b
       LEFT JOIN patients p ON b.patient_id = p.id
       WHERE b.id = ?`,
      [billing_id]
    );
    
    res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: updated[0]
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error recording payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to record payment',
      error: error.message 
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
