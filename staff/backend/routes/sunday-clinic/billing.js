'use strict';

const controller = require('../sunday-clinic-controller');
const billingPaymentRoutes = require('../billing-payment');
const { createRouteSlice } = require('./route-slice');
const { GROUP_MATCHERS } = require('./route-groups');

const router = createRouteSlice(controller, GROUP_MATCHERS.billing);

// Xendit routes retain their original /billing mount and run after core billing routes.
router.use('/billing', billingPaymentRoutes);

module.exports = router;
