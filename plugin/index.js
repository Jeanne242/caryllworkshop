// SillyTavern server plugin: reads/writes prompt-cache settings in config.yaml
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import yaml from 'yaml';

export const info = {
    id: 'cache-control',
    name: 'Cache Control',
    description: 'Read and edit prompt-caching settings in config.yaml from the UI.',
};

// Keys we always show, even if missing from config.yaml
const KNOWN = {
    'claude.enableSystemPromptCache': false,
    'claude.cachingAtDepth': -1,
    'claude.extendedTTL': false,
};
const MATCH = /cach|ttl/i;                         // auto-discover any cache-ish key
const EXCLUDE = /^(cacheBuster|performance)\./i;   // browser/disk caches, not prompt caches
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

function configPath() {
    const args = globalThis.COMMAND_LINE_ARGS;
    if (args?.configPath) return path.resolve(args.configPath);
    return path.join(process.cwd(), 'config.yaml');
}

function readDoc() {
    const p = configPath();
    return { p, doc: yaml.parseDocument(fs.readFileSync(p, 'utf8')) };
}

function collect(obj, prefix = '', out = []) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) collect(v, key, out);
        else if (MATCH.test(key) && !EXCLUDE.test(key) && ['boolean', 'number', 'string'].includes(typeof v)) {
            out.push({ key, value: v, type: typeof v, missing: false });
        }
    }
    return out;
}

function isAdmin(req) {
    // With user accounts on, only admins may edit the global config.
    return !(req.user?.profile && req.user.profile.admin === false);
}

function validValue(v) {
    if (typeof v === 'boolean') return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'string') return v.length <= 200;
    return false;
}

// Try to update SillyTavern's in-memory config so changes apply without restart.
async function applyLive(changes) {
    try {
        const url = pathToFileURL(path.join(process.cwd(), 'src', 'util.js')).href;
        const util = await import(url);
        if (typeof util.getConfig !== 'function') return false;
        const cfg = util.getConfig();
        if (!cfg || typeof cfg !== 'object') return false;
        for (const { key, value } of changes) {
            const parts = key.split('.');
            let o = cfg;
            for (const p of parts.slice(0, -1)) {
                if (typeof o[p] !== 'object' || o[p] === null) o[p] = {};
                o = o[p];
            }
            o[parts.at(-1)] = value;
        }
        return true;
    } catch {
        return false;
    }
}

export async function init(router) {
    router.use(express.json());

    router.get('/config', (req, res) => {
        try {
            const { p, doc } = readDoc();
            const keys = collect(doc.toJS());
            for (const [key, def] of Object.entries(KNOWN)) {
                if (!keys.some(k => k.key === key)) keys.push({ key, value: def, type: typeof def, missing: true });
            }
            keys.sort((a, b) => a.key.localeCompare(b.key));
            res.json({ path: p, admin: isAdmin(req), keys });
        } catch (e) {
            console.error('[cache-control]', e);
            res.status(500).json({ error: String(e.message || e) });
        }
    });

    router.post('/set', async (req, res) => {
        try {
            if (!isAdmin(req)) return res.status(403).json({ error: 'Only admins can edit config.yaml' });
            const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
            if (!changes.length) return res.status(400).json({ error: 'No changes' });
            for (const c of changes) {
                if (typeof c?.key !== 'string' || !KEY_RE.test(c.key) || c.key.split('.').some(s => FORBIDDEN.has(s))) {
                    return res.status(400).json({ error: `Invalid key: ${c?.key}` });
                }
                if (!validValue(c.value)) return res.status(400).json({ error: `Invalid value for ${c.key}` });
            }
            const { p, doc } = readDoc();
            const backup = `${p}.cache-control.bak`;
            if (!fs.existsSync(backup)) fs.copyFileSync(p, backup);
            for (const { key, value } of changes) doc.setIn(key.split('.'), value);
            fs.writeFileSync(p, doc.toString(), 'utf8');
            const live = await applyLive(changes);
            console.log(`[cache-control] Updated ${changes.length} key(s) in ${p} (live: ${live})`);
            res.json({ ok: true, live, backup });
        } catch (e) {
            console.error('[cache-control]', e);
            res.status(500).json({ error: String(e.message || e) });
        }
    });

    console.log('[cache-control] Plugin loaded');
}

export async function exit() {}
