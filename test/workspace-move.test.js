import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {isManualCrossWorkspaceMove} from '../lib/workspace-move.js';

const WINDOW_TYPE_NORMAL = 0;
const WINDOW_TYPE_DIALOG = 1;

function mockWorkspace(index) {
    return {index: () => index};
}

function mockWindow({
    id = 1,
    type = WINDOW_TYPE_NORMAL,
    workspace = mockWorkspace(0),
    transientFor = null,
    fullscreen = false,
} = {}) {
    return {
        get_id: () => id,
        get_window_type: () => type,
        get_workspace: () => workspace,
        get_transient_for: () => transientFor,
        is_fullscreen: () => fullscreen,
    };
}

function moveContext(state) {
    return {
        pendingManualMoves: state.pendingManualMoves,
        extensionWorkspaceMoves: state.extensionWorkspaceMoves,
        previousWorkspaces: state.previousWorkspaces,
        isTileable: (w) => w.get_window_type() === WINDOW_TYPE_NORMAL
            && !w.get_transient_for?.()
            && !w.is_fullscreen?.(),
        windowTypeNormal: WINDOW_TYPE_NORMAL,
    };
}

function mockState() {
    return {
        ws1: mockWorkspace(1),
        ws2: mockWorkspace(2),
        pendingManualMoves: new Set(),
        extensionWorkspaceMoves: new Set(),
        previousWorkspaces: new Map(),
    };
}

describe('workspace move detection', () => {
    it('detects a pending manual workspace move', () => {
        const state = mockState();
        const window = mockWindow({workspace: state.ws2});
        state.pendingManualMoves.add(window);

        assert.equal(
            isManualCrossWorkspaceMove(window, state.ws2, moveContext(state)),
            true
        );
    });

    it('detects a cross-workspace move from tracked previous workspace state', () => {
        const state = mockState();
        const window = mockWindow({workspace: state.ws2});
        state.previousWorkspaces.set(window, state.ws1);

        assert.equal(
            isManualCrossWorkspaceMove(window, state.ws2, moveContext(state)),
            true
        );
    });

    it('ignores extension-initiated workspace moves', () => {
        const state = mockState();
        const window = mockWindow({workspace: state.ws2});
        state.previousWorkspaces.set(window, state.ws1);
        state.extensionWorkspaceMoves.add(window);

        assert.equal(
            isManualCrossWorkspaceMove(window, state.ws2, moveContext(state)),
            false
        );
    });

    it('ignores non-tileable windows and different destination workspaces', () => {
        const state = mockState();
        const dialog = mockWindow({type: WINDOW_TYPE_DIALOG, workspace: state.ws2});
        const normal = mockWindow({workspace: state.ws2});
        state.previousWorkspaces.set(normal, state.ws1);

        assert.equal(
            isManualCrossWorkspaceMove(dialog, state.ws2, moveContext(state)),
            false
        );
        assert.equal(
            isManualCrossWorkspaceMove(normal, state.ws1, moveContext(state)),
            false
        );
    });
});
