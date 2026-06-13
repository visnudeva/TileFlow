import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
    getWindowIdentifiers,
    isBrowser,
    isFirefox,
    isLikelyMediaWindow,
    matchesAny,
} from '../lib/window-identification.js';

function mockWindow(fields = {}) {
    return {
        get_wm_class: () => fields.wmClass ?? null,
        get_wm_class_instance: () => fields.wmClassInstance ?? null,
        get_gtk_application_id: () => fields.appId ?? null,
    };
}

describe('window identification', () => {
    it('getWindowIdentifiers collects normalized class and app id tokens', () => {
        const window = mockWindow({
            wmClass: 'Firefox',
            wmClassInstance: 'Navigator',
            appId: 'org.mozilla.firefox',
        });

        assert.deepEqual(
            [...getWindowIdentifiers(window)].sort(),
            ['firefox', 'navigator', 'org.mozilla.firefox']
        );
    });

    it('matchesAny detects known browser identifiers', () => {
        assert.equal(
            matchesAny(mockWindow({wmClass: 'Google-chrome'}), new Set(['google-chrome'])),
            true
        );
        assert.equal(
            matchesAny(mockWindow({wmClass: 'Gnome-terminal'}), new Set(['google-chrome'])),
            false
        );
    });

    it('isFirefox recognizes firefox windows', () => {
        assert.equal(isFirefox(mockWindow({wmClass: 'Firefox'})), true);
        assert.equal(isFirefox(mockWindow({appId: 'org.mozilla.firefox'})), true);
        assert.equal(isFirefox(mockWindow({wmClass: 'Chromium'})), false);
    });

    it('isBrowser recognizes common browsers but not terminals', () => {
        assert.equal(isBrowser(mockWindow({wmClass: 'Brave'})), true);
        assert.equal(isBrowser(mockWindow({wmClass: 'Gnome-terminal'})), false);
    });

    it('isLikelyMediaWindow detects media players but excludes browsers', () => {
        assert.equal(isLikelyMediaWindow(mockWindow({wmClass: 'Vlc'})), true);
        assert.equal(isLikelyMediaWindow(mockWindow({wmClass: 'Celluloid'})), true);
        assert.equal(isLikelyMediaWindow(mockWindow({wmClass: 'Totem'})), true);
        assert.equal(isLikelyMediaWindow(mockWindow({appId: 'org.gnome.Totem'})), true);
        assert.equal(isLikelyMediaWindow(mockWindow({appId: 'io.github.celluloid_player.Celluloid'})), true);
        assert.equal(isLikelyMediaWindow(mockWindow({wmClass: 'mpv'})), true);
        assert.equal(isLikelyMediaWindow(mockWindow({wmClass: 'Firefox'})), false);
        assert.equal(isLikelyMediaWindow(mockWindow({wmClass: 'Chromium'})), false);
        assert.equal(isLikelyMediaWindow(mockWindow({wmClass: 'Gnome-terminal'})), false);
    });
});
