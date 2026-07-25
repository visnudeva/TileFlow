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

export const LANIAKEA_RENDERER_ID = "io.github.visnudeva.LaniakeaRenderer";

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

// Live-wallpaper renderer is a NORMAL Wayland toplevel; tiling it during
// map/configure races mutter and can SIGSEGV gnome-shell at login.
export function isLaniakeaRenderer(metaWindow) {
    if (!metaWindow)
        return false;

    const title = metaWindow.title ?? "";
    if (title.includes(LANIAKEA_RENDERER_ID) || title.includes("Laniakea Renderer"))
        return true;

    for (const id of getWindowIdentifiers(metaWindow)) {
        if (id === LANIAKEA_RENDERER_ID.toLowerCase() || id.includes("laniakearenderer"))
            return true;
    }
    return false;
}

export function isEphemeralUiWindowType(type, WindowType) {
    return type === WindowType.MENU
        || type === WindowType.DROPDOWN_MENU
        || type === WindowType.POPUP_MENU
        || type === WindowType.COMBO
        || type === WindowType.TOOLTIP
        || type === WindowType.NOTIFICATION
        || type === WindowType.DND
        || type === WindowType.OVERRIDE_REDIRECT;
}

export function affectsTilingLayout(metaWindow, WindowType) {
    if (!metaWindow?.get_window_type)
        return false;

    const type = metaWindow.get_window_type();
    if (isEphemeralUiWindowType(type, WindowType))
        return false;
    if (metaWindow.get_transient_for?.())
        return false;
    if (isLaniakeaRenderer(metaWindow))
        return false;

    return type === WindowType.NORMAL && !isLikelyMediaWindow(metaWindow);
}
