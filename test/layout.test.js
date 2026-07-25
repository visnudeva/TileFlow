import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
    buildManualMoveWorkspaceOrder,
    buildNewWindowPairOrder,
    buildOverflowJoinPairOrder,
    resolveTwoWindowOrder,
    resolveWindowOrder,
    shouldMaximizeLoneWindow,
    shouldPreserveLoneWindowGeometry,
} from '../lib/layout.js';

function mockWindow(id) {
    return {get_id: () => id};
}

describe('layout', () => {
    it('buildNewWindowPairOrder keeps the existing window on the left', () => {
        const existing = mockWindow(1);
        const incoming = mockWindow(2);

        assert.deepEqual(buildNewWindowPairOrder(existing, incoming), [existing, incoming]);
    });

    it('buildOverflowJoinPairOrder places the overflowing window on the left', () => {
        const existing = mockWindow(1);
        const incoming = mockWindow(2);

        assert.deepEqual(
            buildOverflowJoinPairOrder(existing, incoming),
            [incoming, existing]
        );
    });

    it('buildManualMoveWorkspaceOrder matches manual move sides', () => {
        const moved = mockWindow(1);
        const other = mockWindow(2);

        assert.deepEqual(
            buildManualMoveWorkspaceOrder(moved, other, 'left'),
            [moved, other]
        );
        assert.deepEqual(
            buildManualMoveWorkspaceOrder(moved, other, 'right'),
            [other, moved]
        );
    });

    it('resolveTwoWindowOrder prefers manual move side over saved order', () => {
        const moved = mockWindow(1);
        const other = mockWindow(2);

        assert.deepEqual(
            resolveTwoWindowOrder([moved, other], {
                movedWindow: moved,
                side: 'right',
                savedOrder: [moved, other],
                creationTimes: new Map(),
                workspaceChangeTimes: new Map(),
            }),
            [other, moved]
        );
    });

    it('resolveTwoWindowOrder uses saved order when no manual move is present', () => {
        const left = mockWindow(1);
        const right = mockWindow(2);

        assert.deepEqual(
            resolveTwoWindowOrder([left, right], {
                savedOrder: [left, right],
                creationTimes: new Map(),
                workspaceChangeTimes: new Map(),
            }),
            [left, right]
        );
    });

    it('resolveTwoWindowOrder places the newest window on the right by default', () => {
        const existing = mockWindow(1);
        const incoming = mockWindow(2);
        const creationTimes = new Map([[existing, 10], [incoming, 20]]);

        assert.deepEqual(
            resolveTwoWindowOrder([existing, incoming], {
                newWindow: incoming,
                creationTimes,
                workspaceChangeTimes: new Map(),
            }),
            [existing, incoming]
        );
    });

    it('resolveWindowOrder falls back to computeWindowOrder for more than two windows', () => {
        const a = mockWindow(1);
        const b = mockWindow(2);
        const c = mockWindow(3);
        const creationTimes = new Map([[a, 10], [b, 20], [c, 30]]);

        assert.deepEqual(
            resolveWindowOrder([a, b, c], {
                creationTimes,
                workspaceChangeTimes: new Map(),
            }),
            [a, b, c]
        );
    });

    it('shouldMaximizeLoneWindow only maximizes a solitary ready window', () => {
        assert.equal(
            shouldMaximizeLoneWindow({
                tileableCount: 1,
                hasPendingTileable: false,
                joiningAnother: false,
            }),
            true
        );
        assert.equal(
            shouldMaximizeLoneWindow({
                tileableCount: 1,
                hasPendingTileable: true,
                joiningAnother: false,
            }),
            false
        );
        assert.equal(
            shouldMaximizeLoneWindow({
                tileableCount: 1,
                hasPendingTileable: false,
                joiningAnother: true,
            }),
            false
        );
        assert.equal(
            shouldMaximizeLoneWindow({
                tileableCount: 2,
                hasPendingTileable: false,
                joiningAnother: false,
            }),
            false
        );
    });

    it('shouldPreserveLoneWindowGeometry while pending or joining windows exist', () => {
        assert.equal(
            shouldPreserveLoneWindowGeometry({
                hasPendingTileable: true,
                hasJoiningNormalWindow: false,
            }),
            true
        );
        assert.equal(
            shouldPreserveLoneWindowGeometry({
                hasPendingTileable: false,
                hasJoiningNormalWindow: true,
            }),
            true
        );
        assert.equal(
            shouldPreserveLoneWindowGeometry({
                hasPendingTileable: false,
                hasJoiningNormalWindow: false,
            }),
            false
        );
    });
});
