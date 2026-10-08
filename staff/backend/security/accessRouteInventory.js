'use strict';

const fs = require('fs');
const path = require('path');

const ROUTE_DECLARATION = /\b(router|app)\.(get|post|put|patch|delete)\s*\(\s*(['"])([^'"]+)\3\s*,/g;
const INVENTORIED_ROUTE_SUBDIRECTORIES = Object.freeze(['sunday-clinic', 'v1']);

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
    const statementEnd = candidate.indexOf(');');
    if (statementEnd >= 0) end = statementEnd + 2;
    for (const marker of handlerMarkers) {
        const match = marker.exec(candidate);
        if (match && match.index < end) end = match.index;
    }
    return candidate.slice(0, end);
}

function inventoryRouteFile(filePath, options = {}) {
    const source = fs.readFileSync(filePath, 'utf8');
    const sourceFile = options.sourceFile || path.basename(filePath, path.extname(filePath));
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
    const rootRoutes = fs.readdirSync(routesDir)
        .filter(name => name.endsWith('.js'))
        .sort()
        .flatMap(name => inventoryRouteFile(path.join(routesDir, name)));
    const nestedRoutes = INVENTORIED_ROUTE_SUBDIRECTORIES.flatMap(directory => {
        const nestedDir = path.join(routesDir, directory);
        if (!fs.existsSync(nestedDir)) return [];
        return fs.readdirSync(nestedDir)
            .filter(name => name.endsWith('.js') && name !== 'index.js')
            .sort()
            .flatMap(name => inventoryRouteFile(path.join(nestedDir, name), {
                sourceFile: `${directory}/${path.basename(name, path.extname(name))}`
            }));
    });
    return [...rootRoutes, ...nestedRoutes];
}

module.exports = {
    inventoryRouteDeclarations,
    inventoryRouteFile
};
