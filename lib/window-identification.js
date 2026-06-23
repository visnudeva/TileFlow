const FIREFOX_IDENTIFIERS = new Set([
    "firefox", "navigator", "org.mozilla.firefox",
]);

const BAZAAR_IDENTIFIERS = new Set([
    "bazaar", "io.github.kolunmi.bazaar",
]);

const BROWSER_IDENTIFIERS = new Set([
    "firefox", "navigator", "org.mozilla.firefox",
    "chromium", "chrome", "google-chrome", "brave", "vivaldi",
    "microsoft-edge", "opera", "org.chromium.chromium",
]);

const MEDIA_KEYWORDS = [
    "player", "mpv", "vlc", "totem", "celluloid", "smplayer", "haruna",
    "dragon", "parole", "qmplay", "clapper", "xine", "mplayer", "media",
    "video", "cinema", "showtime", "strawberry", "kodi", "plex",
    "jellyfin", "ffplay", "gst-play",
];

export function getWindowIdentifiers(metaWindow) {
    const ids = new Set();
    for (const value of [
        metaWindow.get_wm_class?.(),
        metaWindow.get_wm_class_instance?.(),
        metaWindow.get_gtk_application_id?.(),
    ]) {
        if (!value)
            continue;
        for (const part of String(value).toLowerCase().split(/[\s,]+/))
            ids.add(part);
    }
    return ids;
}

export function matchesAny(metaWindow, identifiers) {
    for (const id of getWindowIdentifiers(metaWindow)) {
        if (identifiers.has(id))
            return true;
    }
    return false;
}

export function isFirefox(metaWindow) {
    return matchesAny(metaWindow, FIREFOX_IDENTIFIERS);
}

export function isBazaar(metaWindow) {
    return matchesAny(metaWindow, BAZAAR_IDENTIFIERS);
}

export function isLateGeometryApp(metaWindow) {
    return isFirefox(metaWindow) || isBazaar(metaWindow);
}

export function isBrowser(metaWindow) {
    return matchesAny(metaWindow, BROWSER_IDENTIFIERS);
}

function identifierMatchesKeyword(identifier, keyword) {
    return identifier === keyword
        || identifier.includes(keyword)
        || keyword.includes(identifier);
}

export function isLikelyMediaWindow(metaWindow) {
    if (isBrowser(metaWindow))
        return false;

    for (const id of getWindowIdentifiers(metaWindow)) {
        for (const keyword of MEDIA_KEYWORDS) {
            if (identifierMatchesKeyword(id, keyword))
                return true;
        }
    }
    return false;
}
