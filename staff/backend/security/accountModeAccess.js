'use strict';

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { accessControlService: defaultAccessControlService } = require('../services/AccessControlService');
const defaultLogger = require('../utils/logger');
const { inventoryRouteDeclarations } = require('./accessRouteInventory');
const { resolveRouteAccess, resolveRequestPathOverride } = require('../config/accessControlRegistry');
const { ROLE_IDS } = require('../constants/roles');

function normalizeMountPath(value) {
    const normalized = `/${String(value || '').replace(/^\/+|\/+$/g, '')}`;
    return normalized === '/' ? '/' : normalized;
}

function joinRoutePaths(mountPath, routePath) {
    const mount = normalizeMountPath(mountPath);
    const route = normalizeMountPath(routePath);
    if (mount === '/') return route;
    if (route === '/') return mount;
    return `${mount}${route}`.replace(/\/{2,}/g, '/');
}

function escapeRegexCharacter(character) {
    return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

function compileRoutePattern(routePath) {
    const value = normalizeMountPath(routePath);
    let pattern = '';
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === ':') {
            index += 1;
            while (index < value.length && /[A-Za-z0-9_$]/.test(value[index])) index += 1;
            if (value.slice(index, index + 3) === '(*)') {
                pattern += '.*';
                index += 2;
            } else {
                pattern += '[^/]+';
                index -= 1;
            }
            continue;
        }
        if (character === '*') {
            pattern += '.*';
            continue;
        }
        pattern += escapeRegexCharacter(character);
    }
    return new RegExp(`^${pattern}/?$`);
}

function routeImports(serverSource) {
    const imports = new Map();
    for (const match of serverSource.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g)) {
        imports.set(match[1], match[2]);
    }
    for (const match of serverSource.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g)) {
        for (const importedName of match[1].split(',').map(value => value.trim()).filter(Boolean)) {
            imports.set(importedName.split(/\s+as\s+/)[0].trim(), match[2]);
        }
    }
    return imports;
}

function inventoryServerMounts(serverFile) {
    const source = fs.readFileSync(serverFile, 'utf8');
    const imports = routeImports(source);
    const mounts = [];
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
        let match = /app\.use\(\s*(['"])([^'"]*)\1\s*,\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/.exec(line);
        if (match) {
            mounts.push({ mountPath: match[2], sourceFile: match[3], order: index });
            return;
        }

        match = /app\.use\(\s*(['"])([^'"]*)\1\s*,\s*([A-Za-z_$][\w$]*)/.exec(line);
        if (match && imports.has(match[3])) {
            mounts.push({ mountPath: match[2], sourceFile: imports.get(match[3]), order: index });
            return;
        }

        match = /app\.use\(\s*(['"])([^'"]*)\1\s*,\s*require\(['"]\.\/routes\/([^'"]+)['"]\)\.([A-Za-z_$][\w$]*)/.exec(line);
        if (match) {
            mounts.push({ mountPath: match[2], sourceFile: match[3], order: index });
            return;
        }

        match = /app\.use\(\s*([A-Za-z_$][\w$]*)\s*\(/.exec(line);
        if (match && imports.has(match[1])) {
            mounts.push({ mountPath: '/', sourceFile: imports.get(match[1]), order: index });
        }
    });
    return mounts;
}

function inventoryNestedRouterMounts(routesDir, parentSource) {
    let parentFile = path.join(routesDir, `${parentSource}.js`);
    let nestedPrefix = '';
    if (!fs.existsSync(parentFile)) {
        parentFile = path.join(routesDir, parentSource, 'index.js');
        nestedPrefix = `${parentSource}/`;
    }
    if (!fs.existsSync(parentFile)) return [];
    const source = fs.readFileSync(parentFile, 'utf8');
    const mounts = [];
    const pattern = /router\.use\(\s*(?:(['"])([^'"]*)\1\s*,\s*)?require\(['"]\.\/([^'"]+)['"]\)\s*\)/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
        mounts.push({
            mountPath: match[2] || '/',
            sourceFile: match[3],
            order: source.slice(0, match.index).split(/\r?\n/).length
        });
    }
    const imports = new Map();
    for (const importMatch of source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(['"]\.\/([^'"]+)['"]\)/g)) {
        imports.set(importMatch[1], `${nestedPrefix}${importMatch[2]}`);
    }
    const variablePattern = /router\.use\(\s*(['"])([^'"]*)\1\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
    while ((match = variablePattern.exec(source)) !== null) {
        if (!imports.has(match[3])) continue;
        mounts.push({
            mountPath: match[2] || '/',
            sourceFile: imports.get(match[3]),
            order: source.slice(0, match.index).split(/\r?\n/).length
        });
    }
    return mounts;
}

function buildRuntimeAccessRules({ serverFile, routesDir }) {
    const mounts = inventoryServerMounts(serverFile);
    const routesBySource = new Map();
    for (const route of inventoryRouteDeclarations(routesDir)) {
        if (!routesBySource.has(route.sourceFile)) routesBySource.set(route.sourceFile, []);
        routesBySource.get(route.sourceFile).push(route);
    }

    return mounts.flatMap(mount => {
        const direct = (routesBySource.get(mount.sourceFile) || []).map(route => ({
            route,
            nestedMountPath: '/',
            nestedOrder: 0
        }));
        const nested = inventoryNestedRouterMounts(routesDir, mount.sourceFile).flatMap(nestedMount => (
            (routesBySource.get(nestedMount.sourceFile) || []).map(route => ({
                route,
                nestedMountPath: nestedMount.mountPath,
                nestedOrder: nestedMount.order
            }))
        ));
        return [...direct, ...nested].map(({ route, nestedMountPath, nestedOrder }) => {
            const nestedPath = joinRoutePaths(nestedMountPath, route.routePath);
            const fullPath = joinRoutePaths(mount.mountPath, nestedPath);
            return {
                method: route.method,
                fullPath,
                matcher: compileRoutePattern(fullPath),
                resolution: resolveRouteAccess(route),
                mountOrder: mount.order,
                routeOrder: (nestedOrder * 10000) + route.line,
                sourceFile: route.sourceFile
            };
        });
    }).sort((left, right) => left.mountOrder - right.mountOrder || left.routeOrder - right.routeOrder);
}

function createRuntimeAccessResolver({
    serverFile = path.resolve(__dirname, '../server.js'),
    routesDir = path.resolve(__dirname, '../routes')
} = {}) {
    const rules = buildRuntimeAccessRules({ serverFile, routesDir });
    return (method, requestPath) => {
        const normalizedMethod = String(method || 'GET').toUpperCase() === 'HEAD' ? 'GET' : String(method || 'GET').toUpperCase();
        const pathname = normalizeMountPath(String(requestPath || '/').split('?')[0]);
        const pathOverride = resolveRequestPathOverride(normalizedMethod, pathname);
        if (pathOverride) return pathOverride;
        const rule = rules.find(candidate => candidate.method === normalizedMethod && candidate.matcher.test(pathname));
        return rule?.resolution || null;
    };
}

function bearerToken(req) {
    const header = req.headers?.authorization || req.headers?.Authorization;
    if (typeof header !== 'string') return null;
    const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
    return match ? match[1] : null;
}

function deny(res, code, message) {
    return res.status(403).json({ success: false, code, message });
}

function createAccountModeAccessBoundary({
    verifyJwt = token => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }),
    accessControlService = defaultAccessControlService,
    resolveRequestAccess = createRuntimeAccessResolver(),
    logger = defaultLogger
} = {}) {
    return async function accountModeAccessBoundary(req, res, next) {
        const token = bearerToken(req);
        if (!token) return next();

        let claims;
        try {
            claims = verifyJwt(token);
        } catch (_) {
            return next();
        }
        if (!claims?.id || claims.user_type === 'patient' || claims.role === 'patient') return next();

        try {
            const account = await accessControlService.getStaffAccountState(claims.id);
            if (!account || account.userType !== 'staff') return next();
            if (!account.isActive) return deny(res, 'ACCOUNT_INACTIVE', 'Akun staff tidak aktif.');
            if (account.isSuperadmin || account.roleId === ROLE_IDS.DOKTER) return next();

            const requestPath = req.originalUrl || req.url || req.path || '/';
            const resolution = resolveRequestAccess(req.method, requestPath);
            if (!resolution) {
                logger.warn('Account-mode request denied because route is not mapped', {
                    requestId: req.context?.requestId || 'unknown',
                    method: req.method,
                    path: String(requestPath).split('?')[0]
                });
                return deny(res, 'ACCESS_DENIED', 'Akses untuk endpoint ini belum diberikan.');
            }
            if (resolution.exemption) return next();

            const access = await accessControlService.getEffectiveAccess(claims.id);
            if (!access.permissions.has(resolution.permission)) {
                logger.warn('Account-mode permission denied', {
                    requestId: req.context?.requestId || 'unknown',
                    method: req.method,
                    path: String(requestPath).split('?')[0],
                    permission: resolution.permission,
                    ruleId: resolution.ruleId
                });
                return deny(res, 'ACCESS_DENIED', 'Anda tidak memiliki izin untuk tindakan ini.');
            }

            req.accountAccess = access;
            req.accountAccessResolution = resolution;
            return next();
        } catch (error) {
            logger.error('Account-mode access check failed', {
                requestId: req.context?.requestId || 'unknown',
                error: error.message
            });
            return res.status(500).json({
                success: false,
                code: 'ACCESS_CHECK_FAILED',
                message: 'Gagal memeriksa akses akun.'
            });
        }
    };
}

module.exports = {
    buildRuntimeAccessRules,
    compileRoutePattern,
    createAccountModeAccessBoundary,
    createRuntimeAccessResolver,
    inventoryServerMounts,
    inventoryNestedRouterMounts,
    joinRoutePaths
};
