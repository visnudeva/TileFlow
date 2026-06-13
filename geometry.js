const TILE_GAP = 0;
export const GEOMETRY_TOLERANCE = 8;

export function halfTileGeometry(area) {
    const gap = TILE_GAP;
    const halfW = Math.floor((area.width - gap * 3) / 2);
    return {
        gap,
        halfW,
        height: area.height - gap * 2,
        leftX: area.x + gap,
        rightX: area.x + halfW + gap * 2,
        y: area.y + gap,
    };
}

export function detectHalfTileSide(metaWindow, area, tolerance = GEOMETRY_TOLERANCE) {
    const rect = metaWindow.get_frame_rect();
    const {halfW, height, leftX, rightX, y} = halfTileGeometry(area);

    const matchesLeft = Math.abs(rect.x - leftX) <= tolerance
        && Math.abs(rect.y - y) <= tolerance
        && Math.abs(rect.width - halfW) <= tolerance
        && Math.abs(rect.height - height) <= tolerance;

    const matchesRight = Math.abs(rect.x - rightX) <= tolerance
        && Math.abs(rect.y - y) <= tolerance
        && Math.abs(rect.width - halfW) <= tolerance
        && Math.abs(rect.height - height) <= tolerance;

    if (matchesLeft)
        return "left";
    if (matchesRight)
        return "right";
    return null;
}

export function sideFromExpectedGeometry(expected, area, tolerance = GEOMETRY_TOLERANCE) {
    if (!expected || expected.maximized)
        return null;

    const {leftX, rightX} = halfTileGeometry(area);
    if (Math.abs(expected.x - leftX) <= tolerance)
        return "left";
    if (Math.abs(expected.x - rightX) <= tolerance)
        return "right";
    return null;
}

export function sideFromFrameCenter(metaWindow, area) {
    const rect = metaWindow.get_frame_rect();
    const centerX = rect.x + rect.width / 2;
    const midX = area.x + area.width / 2;
    if (centerX < midX)
        return "left";
    if (centerX > midX)
        return "right";
    return null;
}

export function sideFromWorkspaceDirection(newWs, prevWs) {
    if (!newWs || !prevWs)
        return null;

    const newIdx = newWs.index();
    const prevIdx = prevWs.index();
    if (newIdx > prevIdx)
        return "left";
    if (newIdx < prevIdx)
        return "right";
    return null;
}

export function geometryMatches(metaWindow, expected, tolerance = GEOMETRY_TOLERANCE) {
    if (!expected)
        return true;

    const isMaximized = metaWindow.maximized_horizontally && metaWindow.maximized_vertically;
    if (expected.maximized !== isMaximized)
        return false;
    if (expected.maximized)
        return true;

    const rect = metaWindow.get_frame_rect();
    return Math.abs(rect.x - expected.x) <= tolerance
        && Math.abs(rect.y - expected.y) <= tolerance
        && Math.abs(rect.width - expected.width) <= tolerance
        && Math.abs(rect.height - expected.height) <= tolerance;
}
