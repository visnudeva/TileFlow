import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {computeWindowOrder, orderWithNewOnRight} from '../lib/window-order.js';

function mockWindow(id) {
    return {get_id: () => id};
}

describe('computeWindowOrder', () => {
    it('orders by workspace change time first', () => {
        const a = mockWindow(1);
        const b = mockWindow(2);
        const creationTimes = new Map([[a, 10], [b, 20]]);
        const workspaceChangeTimes = new Map([[a, 200], [b, 100]]);

        assert.deepEqual(
            computeWindowOrder([a, b], creationTimes, workspaceChangeTimes),
            [b, a]
        );
    });

    it('falls back to creation time when workspace change times tie', () => {
        const a = mockWindow(1);
        const b = mockWindow(2);
        const creationTimes = new Map([[a, 50], [b, 10]]);
        const workspaceChangeTimes = new Map([[a, 0], [b, 0]]);

        assert.deepEqual(
            computeWindowOrder([a, b], creationTimes, workspaceChangeTimes),
            [b, a]
        );
    });

    it('falls back to window id when other timestamps tie', () => {
        const a = mockWindow(5);
        const b = mockWindow(2);
        const creationTimes = new Map();
        const workspaceChangeTimes = new Map();

        assert.deepEqual(
            computeWindowOrder([a, b], creationTimes, workspaceChangeTimes),
            [b, a]
        );
    });

    it('does not mutate the input array', () => {
        const windows = [mockWindow(3), mockWindow(1)];
        const original = windows.slice();

        computeWindowOrder(windows, new Map(), new Map());

        assert.deepEqual(windows, original);
    });
});

describe('orderWithNewOnRight', () => {
    it('places the new window on the right when joining one existing window', () => {
        const existing = mockWindow(1);
        const incoming = mockWindow(2);

        assert.deepEqual(
            orderWithNewOnRight([existing, incoming], incoming, new Map(), new Map()),
            [existing, incoming]
        );
    });

    it('falls back to computeWindowOrder for more than two windows', () => {
        const a = mockWindow(1);
        const b = mockWindow(2);
        const c = mockWindow(3);
        const creationTimes = new Map([[a, 10], [b, 20], [c, 30]]);
        const workspaceChangeTimes = new Map([[a, 0], [b, 0], [c, 0]]);

        assert.deepEqual(
            orderWithNewOnRight([a, b, c], c, creationTimes, workspaceChangeTimes),
            computeWindowOrder([a, b, c], creationTimes, workspaceChangeTimes)
        );
    });
});
