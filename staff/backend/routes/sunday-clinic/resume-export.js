'use strict';

const controller = require('../sunday-clinic-controller');
const { createRouteSlice } = require('./route-slice');
const { GROUP_MATCHERS } = require('./route-groups');

module.exports = createRouteSlice(controller, GROUP_MATCHERS.resumeExport);
