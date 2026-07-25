import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
    GEOMETRY_TOLERANCE,
    detectHalfTileSide,
    geometryMatches,
    halfTileGeometry,
    sideFromExpectedGeometry,
    sideFromFrameCenter,
    sideFromWorkspaceDirection,
} from '../lib/geometry.js';

const WORK_AREA = {x: 0, y: 32, width: 1920, height: 1048};

function mockWindow({
    x = 0,
    y = 32,
    width = 960,
    height = 1048,
    maximizedHorizontally = false,
    maximizedVertically = false,
} = {}) {
    return {
        get_frame_rect: () => ({x, y, width, height}),
        maximized_horizontally: maximizedHorizontally,
        maximized_vertically: maximizedVertically,
    };
}

function mockWorkspace(index) {
    return {index: () => index};
}

describe('halfTileGeometry', () => {
    it('splits the work area into equal left and right halves', () => {
        const geo = halfTileGeometry(WORK_AREA);
        assert.equal(geo.halfW, 960);
        assert.equal(geo.height, 1048);
        assert.equal(geo.leftX, 0);
        assert.equal(geo.rightX, 960);
        assert.equal(geo.y, 32);
    });
});

describe('detectHalfTileSide', () => {
    it('detects left and right half-tile geometries', () => {
        const {halfW, height, leftX, rightX, y} = halfTileGeometry(WORK_AREA);

        assert.equal(
            detectHalfTileSide(
                mockWindow({x: leftX, y, width: halfW, height}),
                WORK_AREA
            ),
            'left'
        );
        assert.equal(
            detectHalfTileSide(
                mockWindow({x: rightX, y, width: halfW, height}),
                WORK_AREA
            ),
            'right'
        );
        assert.equal(
            detectHalfTileSide(
                mockWindow({x: 100, y: 100, width: 400, height: 400}),
                WORK_AREA
            ),
            null
        );
    });

    it('tolerates small geometry drift', () => {
        const {halfW, height, leftX, y} = halfTileGeometry(WORK_AREA);
        assert.equal(
            detectHalfTileSide(
                mockWindow({
                    x: leftX + GEOMETRY_TOLERANCE,
                    y: y - GEOMETRY_TOLERANCE,
                    width: halfW,
                    height,
                }),
                WORK_AREA
            ),
            'left'
        );
    });
});

describe('side helpers', () => {
    it('sideFromExpectedGeometry reads half-tile expected positions', () => {
        const {leftX, rightX, y, halfW, height} = halfTileGeometry(WORK_AREA);

        assert.equal(
            sideFromExpectedGeometry(
                {x: leftX, y, width: halfW, height, maximized: false},
                WORK_AREA
            ),
            'left'
        );
        assert.equal(
            sideFromExpectedGeometry(
                {x: rightX, y, width: halfW, height, maximized: false},
                WORK_AREA
            ),
            'right'
        );
        assert.equal(
            sideFromExpectedGeometry(
                {x: 0, y: 0, width: 1920, height: 1080, maximized: true},
                WORK_AREA
            ),
            null
        );
    });

    it('sideFromFrameCenter uses the window center relative to the work area', () => {
        assert.equal(
            sideFromFrameCenter(
                mockWindow({x: 0, y: 32, width: 400, height: 800}),
                WORK_AREA
            ),
            'left'
        );
        assert.equal(
            sideFromFrameCenter(
                mockWindow({x: 1400, y: 32, width: 400, height: 800}),
                WORK_AREA
            ),
            'right'
        );
        assert.equal(
            sideFromFrameCenter(
                mockWindow({x: 760, y: 32, width: 400, height: 800}),
                WORK_AREA
            ),
            null
        );
    });

    it('sideFromWorkspaceDirection tiles based on source workspace direction', () => {
        assert.equal(
            sideFromWorkspaceDirection(mockWorkspace(2), mockWorkspace(1)),
            'left'
        );
        assert.equal(
            sideFromWorkspaceDirection(mockWorkspace(1), mockWorkspace(3)),
            'right'
        );
        assert.equal(
            sideFromWorkspaceDirection(mockWorkspace(2), mockWorkspace(2)),
            null
        );
    });
});

describe('geometryMatches', () => {
    it('compares frame rects and maximize state', () => {
        const {halfW, height, leftX, y} = halfTileGeometry(WORK_AREA);
        const expected = {x: leftX, y, width: halfW, height, maximized: false};

        assert.equal(
            geometryMatches(
                mockWindow({x: leftX, y, width: halfW, height}),
                expected
            ),
            true
        );
        assert.equal(
            geometryMatches(
                mockWindow({x: leftX + 40, y, width: halfW, height}),
                expected
            ),
            false
        );
        assert.equal(
            geometryMatches(
                mockWindow({maximizedHorizontally: true, maximizedVertically: true}),
                {maximized: true}
            ),
            true
        );
        assert.equal(
            geometryMatches(
                mockWindow({maximizedHorizontally: true, maximizedVertically: true}),
                expected
            ),
            false
        );
        assert.equal(geometryMatches(mockWindow(), null), true);
    });
});
