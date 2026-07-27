#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const failures = [];

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
}

function check(condition, message) {
    if (!condition) failures.push(message);
}

function checkModuleSyntax(...parts) {
    const file = path.join(repoRoot, ...parts);
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
        input: fs.readFileSync(file, 'utf8'),
        encoding: 'utf8'
    });
    check(result.status === 0, `${parts.join('/')}: ${result.stderr || 'invalid JavaScript syntax'}`);
}

const html = read('staff', 'public', 'index-adminlte.html');
const sw = read('staff', 'public', 'sw.js');
const server = read('staff', 'backend', 'server.js');
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1]));
const inlineChars = inlineScripts.reduce((total, match) => total + match[2].length, 0);
const shellVersion = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
const swVersion = sw.match(/const STAFF_PWA_VERSION = '([^']+)'/)?.[1];

check(Buffer.byteLength(html, 'utf8') < 400000, 'staff shell exceeds 400 KB');
check(inlineChars < 50000, 'staff shell inline JavaScript exceeds 50 KB');
check(shellVersion && shellVersion === swVersion, 'staff shell and service worker cache versions differ');
check(!html.includes('window.showManagePatientsPage = async function()'), 'patient tools leaked back into the HTML shell');
check(!html.includes("import { getIdToken } from './scripts/vps-auth-v2.js';"), 'finance module leaked back into the HTML shell');
check(server.includes('reportOnly: true'), 'report-only CSP is missing');

[
    ['staff', 'public', 'scripts', 'staff-api.js'],
    ['staff', 'public', 'scripts', 'safe-render.js'],
    ['staff', 'public', 'scripts', 'medify-sync.js'],
    ['staff', 'public', 'scripts', 'pages', 'finance-analysis-page.js'],
    ['staff', 'public', 'scripts', 'pages', 'birth-content-page.js'],
    ['staff', 'public', 'scripts', 'pages', 'invoice-history-page.js'],
    ['staff', 'public', 'scripts', 'pages', 'content-moderation-page.js'],
    ['staff', 'public', 'scripts', 'shell', 'bootstrap.js'],
    ['staff', 'public', 'scripts', 'shell', 'feature-loader.js']
].forEach(parts => checkModuleSyntax(...parts));

if (failures.length) {
    console.error(`Staff static checks failed:\n- ${failures.join('\n- ')}`);
    process.exit(1);
}

console.log(`Staff static checks passed (HTML ${Buffer.byteLength(html, 'utf8')} bytes; inline JS ${inlineChars} chars; cache ${shellVersion}).`);
