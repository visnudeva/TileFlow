import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
    LANIAKEA_RENDERER_ID,
    affectsTilingLayout,
    getWindowIdentifiers,
    isBazaar,
    isBrowser,
    isEphemeralUiWindowType,
    isFirefox,
    isLaniakeaRenderer,
    isLateGeometryApp,
    isLikelyMediaWindow,
    matchesAny,
} from '../lib/window-identification.js';

const WindowType = {
    NORMAL: 0,
    DIALOG: 1,
    MENU: 2,
    DROPDOWN_MENU: 3,
    POPUP_MENU: 4,
    COMBO: 5,
    TOOLTIP: 6,
    NOTIFICATION: 7,
    DND: 8,
    OVERRIDE_REDIRECT: 9,
    UTILITY: 10,
};

function mockWindow({
    wmClass = null,
    wmInstance = null,
    appId = null,
    title = '',
    type = WindowType.NORMAL,
    transientFor = null,
} = {}) {
    return {
        title,
        get_wm_class: () => wmClass,
        get_wm_class_instance: () => wmInstance,
        get_gtk_application_id: () => appId,
        get_window_type: () => type,
        get_transient_for: () => transientFor,
    };
}

describe('window identification', () => {
    it('getWindowIdentifiers collects lowercase wm/app ids', () => {
        const ids = getWindowIdentifiers(mockWindow({
            wmClass: 'Firefox',
            wmInstance: 'Navigator',
            appId: 'org.mozilla.firefox',
        }));

        assert.equal(ids.has('firefox'), true);
        assert.equal(ids.has('navigator'), true);
        assert.equal(ids.has('org.mozilla.firefox'), true);
    });

    it('matchesAny checks against an identifier set', () => {
        const window = mockWindow({wmClass: 'Firefox'});
        assert.equal(matchesAny(window, new Set(['firefox'])), true);
        assert.equal(matchesAny(window, new Set(['chromium'])), false);
    });

    it('isFirefox recognizes firefox windows', () => {
        assert.equal(isFirefox(mockWindow({wmClass: 'Firefox'})), true);
        assert.equal(isFirefox(mockWindow({appId: 'org.mozilla.firefox'})), true);
        assert.equal(isFirefox(mockWindow({wmClass: 'Chromium'})), false);
    });

    it('isBazaar recognizes Bazaar windows', () => {
        assert.equal(isBazaar(mockWindow({wmClass: 'Bazaar'})), true);
        assert.equal(isBazaar(mockWindow({appId: 'io.github.kolunmi.bazaar'})), true);
        assert.equal(isBazaar(mockWindow({wmClass: 'Firefox'})), false);
    });

    it('isLateGeometryApp covers apps with delayed maximize geometry', () => {
        assert.equal(isLateGeometryApp(mockWindow({wmClass: 'Firefox'})), true);
        assert.equal(isLateGeometryApp(mockWindow({appId: 'io.github.kolunmi.bazaar'})), true);
        assert.equal(isLateGeometryApp(mockWindow({wmClass: 'Gnome-terminal'})), false);
    });

    it('isBrowser recognizes common browsers but not terminals', () => {
        assert.equal(isBrowser(mockWindow({wmClass: 'Firefox'})), true);
        assert.equal(isBrowser(mockWindow({wmClass: 'Chromium'})), true);
        assert.equal(isBrowser(mockWindow({wmClass: 'brave'})), true);
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

    it('isLaniakeaRenderer matches title, app id, and wm class', () => {
        assert.equal(
            isLaniakeaRenderer(mockWindow({title: 'Laniakea Renderer'})),
            true
        );
        assert.equal(
            isLaniakeaRenderer(mockWindow({title: LANIAKEA_RENDERER_ID})),
            true
        );
        assert.equal(
            isLaniakeaRenderer(mockWindow({appId: LANIAKEA_RENDERER_ID})),
            true
        );
        assert.equal(
            isLaniakeaRenderer(mockWindow({wmClass: 'LaniakeaRenderer'})),
            true
        );
        assert.equal(
            isLaniakeaRenderer(mockWindow({wmClass: 'Gnome-terminal'})),
            false
        );
    });

    it('isEphemeralUiWindowType covers menus and transient chrome', () => {
        assert.equal(isEphemeralUiWindowType(WindowType.MENU, WindowType), true);
        assert.equal(isEphemeralUiWindowType(WindowType.POPUP_MENU, WindowType), true);
        assert.equal(isEphemeralUiWindowType(WindowType.TOOLTIP, WindowType), true);
        assert.equal(isEphemeralUiWindowType(WindowType.NORMAL, WindowType), false);
        assert.equal(isEphemeralUiWindowType(WindowType.UTILITY, WindowType), false);
    });

    it('affectsTilingLayout only accepts top-level normal non-media windows', () => {
        assert.equal(
            affectsTilingLayout(mockWindow({wmClass: 'Gnome-terminal'}), WindowType),
            true
        );
        assert.equal(
            affectsTilingLayout(mockWindow({type: WindowType.MENU}), WindowType),
            false
        );
        assert.equal(
            affectsTilingLayout(
                mockWindow({wmClass: 'Gnome-terminal', transientFor: {}}),
                WindowType
            ),
            false
        );
        assert.equal(
            affectsTilingLayout(mockWindow({wmClass: 'Vlc'}), WindowType),
            false
        );
        assert.equal(
            affectsTilingLayout(mockWindow({appId: LANIAKEA_RENDERER_ID}), WindowType),
            false
        );
    });
});
