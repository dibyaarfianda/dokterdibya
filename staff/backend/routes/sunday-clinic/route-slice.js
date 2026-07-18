'use strict';

const express = require('express');

function createRouteSlice(sourceRouter, acceptsPath) {
    const router = express.Router();
    for (const layer of sourceRouter.stack || []) {
        const path = layer.route && layer.route.path;
        if (typeof path === 'string' && acceptsPath(path, layer)) {
            router.stack.push(layer);
        }
    }
    return router;
}

module.exports = { createRouteSlice };
