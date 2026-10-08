'use strict';

const fs = require('fs');
const path = require('path');

const ROUTE_DECLARATION = /\b(router|app)\.(get|post|put|patch|delete)\s*\(\s*(['"])([^'"]+)\3\s*,/g;

function declarationPrefix(source, startIndex) {
    const candidate = source.slice(startIndex, startIndex + 1400);
    const handlerMarkers = [
        /,\s*async\s*\(/,
        /,\s*async\s+function\b/,
        /,\s*function\s*\(/,
        /,\s*\([^)]*\)\s*=>/,
        /,\s*[A-Za-z_$][\w$]*\s*=>/
    ];
    let end = candidate.length;
    for (const marker of handlerMarkers) {
        const match = marker.exec(candidate);
        if (match && match.index < end) end = match.index;
    }
    return candidate.slice(0, end);
}

function inventoryRouteFile(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const sourceFile = path.basename(filePath, path.extname(filePath));
    const fileMiddleware = [...source.matchAll(/router\.use\s*\(([^\n;]+)[\n;]?/g)]
        .map(match => match[1])
        .join(' ');
    const routes = [];
    let match;
    ROUTE_DECLARATION.lastIndex = 0;
    while ((match = ROUTE_DECLARATION.exec(source)) !== null) {
        routes.push({
            sourceFile,
            method: match[2].toUpperCase(),
            routePath: match[4],
            handlerPrefix: declarationPrefix(source, match.index),
            fileMiddleware,
            line: source.slice(0, match.index).split(/\r?\n/).length
        });
    }
    return routes;
}

function inventoryRouteDeclarations(routesDir) {
    return fs.readdirSync(routesDir)
        .filter(name => name.endsWith('.js'))
        .sort()
        .flatMap(name => inventoryRouteFile(path.join(routesDir, name)));
}

module.exports = {
    inventoryRouteDeclarations,
    inventoryRouteFile
};
