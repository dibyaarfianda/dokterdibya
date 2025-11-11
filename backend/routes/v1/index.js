/**
 * API Version 1 Router
 * Aggregates all v1 routes
 */

const express = require('express');
const router = express.Router();

// Import v1 routes
const authRoutes = require('./auth');
const patientsRoutes = require('./patients');
const obatRoutes = require('./obat');

// Mount routes
router.use('/auth', authRoutes);
router.use('/', patientsRoutes);
router.use('/', obatRoutes);

module.exports = router;
