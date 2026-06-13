import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
    detectHalfTileSide,
    geometryMatches,
    halfTileGeometry,
    sideFromExpectedGeometry,
    sideFromFrameCenter,
    sideFromWorkspaceDirection,
} from '../lib/geometry.js';

const WORK_AREA = {x: 0, y: 32, width: 1920, height: 1048};

function mockWindow(rect, maximize = {horizontal: false, vertical: false}) {
    return {
        get_frame_rect: () => rect,
        maximized_horizontally: maximize.horizontal,
        maximized_vertically: maximize.vertical,
    };
}

function mockWorkspace(index) {
    return {index: () => index};
}

describe('geometry', () => {
    it('halfTileGeometry splits the work area into left and right halves', () => {
        const geom = halfTileGeometry(WORK_AREA);

        assert.equal(geom.gap, 0);
        assert.equal(geom.halfW, 960);
        assert.equal(geom.height, 1048);
        assert.equal(geom.leftX, 0);
        assert.equal(geom.rightX, 960);
        assert.equal(geom.y, 32);
    });

    it('detectHalfTileSide identifies left and right tile positions', () => {
        const geom = halfTileGeometry(WORK_AREA);

        assert.equal(
            detectHalfTileSide(
                mockWindow({x: geom.leftX, y: geom.y, width: geom.halfW, height: geom.height}),
                WORK_AREA
            ),
            'left'
        );

        assert.equal(
            detectHalfTileSide(
                mockWindow({x: geom.rightX, y: geom.y, width: geom.halfW, height: geom.height}),
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

    it('sideFromExpectedGeometry reads tile side from stored geometry', () => {
        const geom = halfTileGeometry(WORK_AREA);

        assert.equal(
            sideFromExpectedGeometry({x: geom.leftX, maximized: false}, WORK_AREA),
            'left'
        );
        assert.equal(
            sideFromExpectedGeometry({x: geom.rightX, maximized: false}, WORK_AREA),
            'right'
        );
        assert.equal(
            sideFromExpectedGeometry({x: geom.leftX, maximized: true}, WORK_AREA),
            null
        );
    });

    it('sideFromFrameCenter picks side from window center', () => {
        assert.equal(
            sideFromFrameCenter(
                mockWindow({x: 0, y: 32, width: 400, height: 800}),
                WORK_AREA
            ),
            'left'
        );
        assert.equal(
            sideFromFrameCenter(
                mockWindow({x: 1500, y: 32, width: 400, height: 800}),
                WORK_AREA
            ),
            'right'
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

    it('sideFromFrameCenter returns null when the window is centered', () => {
        assert.equal(
            sideFromFrameCenter(
                mockWindow({x: 760, y: 32, width: 400, height: 800}),
                WORK_AREA
            ),
            null
        );
    });

    it('geometryMatches compares frame rects and maximize state', () => {
        const expected = {x: 0, y: 32, width: 960, height: 1048, maximized: false};
        const matching = mockWindow({x: 2, y: 34, width: 958, height: 1046});
        const mismatching = mockWindow({x: 500, y: 32, width: 960, height: 1048});

        assert.equal(geometryMatches(matching, expected), true);
        assert.equal(geometryMatches(mismatching, expected), false);
        assert.equal(geometryMatches(matching, null), true);

        const maximized = mockWindow(WORK_AREA, {horizontal: true, vertical: true});
        assert.equal(
            geometryMatches(maximized, {...WORK_AREA, maximized: true}),
            true
        );
        assert.equal(
            geometryMatches(maximized, {...WORK_AREA, maximized: false}),
            false
        );
    });
});
