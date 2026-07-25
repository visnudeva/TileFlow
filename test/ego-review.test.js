import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extensionSrc = readFileSync(join(root, 'extension.js'), 'utf8');
const metadata = JSON.parse(readFileSync(join(root, 'metadata.json'), 'utf8'));

function collectJs(dir = root, acc = []) {
    for (const name of readdirSync(dir)) {
        if (['test', 'node_modules'].includes(name))
            continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory())
            collectJs(full, acc);
        else if (name.endsWith('.js'))
            acc.push(full);
    }
    return acc;
}

const allSource = collectJs().map(f => readFileSync(f, 'utf8')).join('\n');

describe('EGO review compliance', () => {
    it('does not declare preferences in metadata.json', () => {
        assert.equal('preferences' in metadata, false);
    });

    it('uses the donations object format', () => {
        assert.equal(typeof metadata.donations, 'object');
        assert.equal(metadata.donations.kofi, 'visnu_deva');
        assert.equal('donate' in metadata, false);
    });

    it('does not include SweetTooth _generated metadata', () => {
        assert.equal('_generated' in metadata, false);
    });

    it('does not use this._enabled', () => {
        assert.doesNotMatch(allSource, /\bthis\._enabled\b/);
    });

    it('does not wrap logic in try-catch', () => {
        assert.doesNotMatch(allSource, /\btry\s*\{/);
        assert.doesNotMatch(allSource, /\bcatch\s*(\(|\{)/);
    });

    it('does not call getSettings() (no settings schema)', () => {
        assert.doesNotMatch(allSource, /\bgetSettings\s*\(/);
    });

    it('uses INSTANCE.connectObject / disconnectObject patterns', () => {
        assert.match(extensionSrc, /global\.display\.connectObject\(/);
        assert.match(extensionSrc, /global\.display\.disconnectObject\(this\)/);
        assert.match(extensionSrc, /global\.window_manager\.connectObject\(/);
        assert.match(extensionSrc, /global\.window_manager\.disconnectObject\(this\)/);
        assert.match(extensionSrc, /wsManager\.connectObject\(/);
        assert.match(extensionSrc, /wsManager\.disconnectObject\(this\)/);
        assert.match(extensionSrc, /ws\.connectObject\(/);
        assert.match(extensionSrc, /metaWindow\.connectObject\(/);
        assert.match(extensionSrc, /metaWindow\.disconnectObject\(metaWindow\)/);

        assert.doesNotMatch(extensionSrc, /\bthis\.connectObject\s*\(/);
        assert.doesNotMatch(extensionSrc, /\bthis\.disconnectObject\s*\(/);
        assert.doesNotMatch(extensionSrc, /\.connect\s*\(/);
        assert.doesNotMatch(extensionSrc, /\.disconnect\s*\(/);
    });

    it('removes GLib timeouts/idles on disable and before recreating', () => {
        assert.match(extensionSrc, /_scheduleRetile\(\)\s*\{[\s\S]*?if \(this\._retileId\)\s*GLib\.source_remove\(this\._retileId\)/);
        assert.match(extensionSrc, /_debounceUnmaximizeRetile\([\s\S]*?_cancelUnmaximizeRetile\(/);
        assert.match(extensionSrc, /disable\(\)\s*\{[\s\S]*?GLib\.source_remove\(this\._retileId\)/);
        assert.match(extensionSrc, /disable\(\)\s*\{[\s\S]*?_workspaceChangeRetileId[\s\S]*?GLib\.source_remove/);
        assert.match(extensionSrc, /disable\(\)\s*\{[\s\S]*?_unmaximizeRetileIds[\s\S]*?GLib\.source_remove/);
        assert.match(extensionSrc, /disable\(\)\s*\{[\s\S]*?_pendingFinalizeIdleIds[\s\S]*?GLib\.source_remove/);
    });

    it('does not spawn processes', () => {
        assert.doesNotMatch(allSource, /\bGLib\.spawn/);
        assert.doesNotMatch(allSource, /\bGio\.Subprocess/);
    });

    it('has no prefs.js using connectObject', () => {
        assert.equal(existsSync(join(root, 'prefs.js')), false);
    });

    it('has no debug logging helpers', () => {
        assert.doesNotMatch(allSource, /\bconsole\.(log|debug|info|warn|error)\b/);
        assert.doesNotMatch(allSource, /\bdebugLog\b/);
        assert.equal(existsSync(join(root, 'lib/debug-log.js')), false);
    });

    it('excludes Laniakea renderer from tiling paths', () => {
        assert.match(extensionSrc, /isLaniakeaRenderer/);
        assert.match(extensionSrc, /affectsTilingLayout/);
    });
});
