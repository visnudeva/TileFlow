import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {computeWindowOrder, orderWithNewOnRight} from '../lib/window-order.js';

function mockWindow(id) {
    return {get_id: () => id};
}

describe('computeWindowOrder', () => {
    it('orders by workspace-change time, then creation time, then id', () => {
        const a = mockWindow(1);
        const b = mockWindow(2);
        const c = mockWindow(3);

        const creationTimes = new Map([[a, 30], [b, 10], [c, 20]]);
        const workspaceChangeTimes = new Map([[a, 2], [b, 1], [c, 1]]);

        assert.deepEqual(
            computeWindowOrder([a, b, c], creationTimes, workspaceChangeTimes),
            [b, c, a]
        );
    });

    it('falls back to window ids when timestamps are missing', () => {
        const a = mockWindow(3);
        const b = mockWindow(1);
        const c = mockWindow(2);

        assert.deepEqual(
            computeWindowOrder([a, b, c], new Map(), new Map()),
            [b, c, a]
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
