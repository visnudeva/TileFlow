// -*- coding: utf-8-unix -*-

import GLib from "gi://GLib";
import Meta from "gi://Meta";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";

import {
    detectHalfTileSide,
    GEOMETRY_TOLERANCE,
    geometryMatches,
    halfTileGeometry,
    sideFromExpectedGeometry,
    sideFromFrameCenter,
    sideFromWorkspaceDirection,
} from "./lib/geometry.js";
import {
    buildManualMoveWorkspaceOrder,
    buildNewWindowPairOrder,
    buildOverflowJoinPairOrder,
    resolveTwoWindowOrder,
    resolveWindowOrder,
    shouldMaximizeLoneWindow,
    shouldPreserveLoneWindowGeometry,
} from "./lib/layout.js";
import {isLateGeometryApp, isLikelyMediaWindow} from "./lib/window-identification.js";
import {isManualCrossWorkspaceMove} from "./lib/workspace-move.js";

const PENDING_TILE_TIMEOUT_MS = 200;
const LATE_GEOMETRY_GRACE_MS = 4000;
const UNMAXIMIZE_RETILE_DELAY_MS = 350;
const WORKSPACE_CHANGE_RETILE_DELAY_MS = 120;

export default class TileFlow extends Extension {

    enable() {
        this._pendingWindows = new Map();
        this._windowCreationTimes = new Map();
        this._windowWorkspaceChangeTimes = new Map();
        this._previousWorkspaces = new WeakMap();
        this._workspaceChangeRetileId = null;
        this._pendingWorkspaceRelayouts = new Set();
        this._workspaceOrder = new WeakMap();
        this._manualMoveSide = new WeakMap();
        this._pendingManualWorkspaceMoves = new WeakSet();
        this._manualMovePrevWorkspace = new WeakMap();
        this._extensionWorkspaceMoves = new WeakSet();
        this._expectedGeometries = new WeakMap();
        this._userExpanded = new WeakMap();
        this._unmaximizeRetileIds = new Map();
        this._connectedWindows = new Set();
        this._workspaceChangeWindows = new Set();
        this._tileSignalWindows = new Set();
        this._transientParentTrackers = new Map();
        this._isTiling = false;
        this._retileId = null;
        this._pendingFinalizeIdleIds = new Map();

        global.display.connectObject(
            "window-created", (_d, w) => this._onWindowCreated(w),
            "window-entered-monitor", () => this._scheduleRetile(),
            "window-left-monitor", () => this._scheduleRetile(),
            this);

        global.window_manager.connectObject(
            "destroy", () => this._scheduleRetile(),
            "switch-workspace", () => this._scheduleRetile(),
            this);

        const wsManager = global.workspace_manager;
        const trackWorkspace = (ws) => {
            ws.connectObject(
                "window-added", (_ws, window) => {
                    const isManualMove = this._isManualWorkspaceMove(window, ws);
                    if (window?.get_window_type?.() === Meta.WindowType.NORMAL && !isManualMove)
                        this._resetWorkspaceLayoutState(ws);
                    if (!isManualMove)
                        this._scheduleRetile();
                },
                "window-removed", (_ws, window) => {
                    if (window?.get_window_type?.() === Meta.WindowType.NORMAL)
                        this._resetWorkspaceLayoutState(ws);
                    this._scheduleRetile();
                },
                this);
        };

        for (let i = 0; i < wsManager.get_n_workspaces(); i++)
            trackWorkspace(wsManager.get_workspace_by_index(i));

        wsManager.connectObject("workspace-added", (_wm, ws) => {
            trackWorkspace(ws);
            this._scheduleRetile();
        }, this);

        for (const w of global.display.list_all_windows()) {
            if (w.get_window_type() === Meta.WindowType.NORMAL) {
                this._windowCreationTimes.set(w, w.get_id());
                this._trackWorkspaceChanges(w);
            }
            this._trackWindow(w);
        }
        this._scheduleRetile();
    }

    disable() {
        global.display.disconnectObject(this);
        global.window_manager.disconnectObject(this);

        const wsManager = global.workspace_manager;
        wsManager.disconnectObject(this);
        for (let i = 0; i < wsManager.get_n_workspaces(); i++)
            wsManager.get_workspace_by_index(i).disconnectObject(this);

        for (const [window, info] of this._pendingWindows ?? [])
            this._clearPendingInfo(window, info);

        for (const window of Array.from(this._connectedWindows ?? []))
            this._releaseWindow(window);

        for (const [window, tracker] of Array.from(this._transientParentTrackers?.entries() ?? []))
            window.disconnectObject(tracker);

        for (const id of this._unmaximizeRetileIds?.values() ?? [])
            GLib.source_remove(id);

        if (this._retileId)
            GLib.source_remove(this._retileId);

        for (const id of this._pendingFinalizeIdleIds?.values() ?? [])
            GLib.source_remove(id);

        if (this._workspaceChangeRetileId)
            GLib.source_remove(this._workspaceChangeRetileId);

        this._pendingWindows = null;
        this._windowCreationTimes = null;
        this._windowWorkspaceChangeTimes = null;
        this._previousWorkspaces = null;
        this._workspaceChangeRetileId = null;
        this._pendingWorkspaceRelayouts = null;
        this._workspaceOrder = null;
        this._manualMoveSide = null;
        this._pendingManualWorkspaceMoves = null;
        this._manualMovePrevWorkspace = null;
        this._extensionWorkspaceMoves = null;
        this._expectedGeometries = null;
        this._userExpanded = null;
        this._unmaximizeRetileIds = null;
        this._connectedWindows = null;
        this._workspaceChangeWindows = null;
        this._tileSignalWindows = null;
        this._transientParentTrackers = null;
        this._isTiling = false;
        this._retileId = null;
        this._pendingFinalizeIdleIds = null;
    }

    _runWhileTiling(fn) {
        const wasTiling = this._isTiling;
        this._isTiling = true;
        fn();
        this._isTiling = wasTiling;
    }

    _isWithinOpeningGrace(metaWindow) {
        if (this._pendingWindows?.has(metaWindow))
            return true;

        const created = this._windowCreationTimes?.get(metaWindow);
        if (created == null || created < 1_000_000_000_000)
            return false;

        return Date.now() - created < LATE_GEOMETRY_GRACE_MS;
    }

    _shouldIgnoreLateAppMaximize(metaWindow) {
        return isLateGeometryApp(metaWindow) && this._isWithinOpeningGrace(metaWindow);
    }

    _trackWindow(metaWindow) {
        if (!this._isTileable(metaWindow) || this._tileSignalWindows.has(metaWindow))
            return;

        this._tileSignalWindows.add(metaWindow);
        this._connectedWindows.add(metaWindow);
        if (!this._windowCreationTimes.has(metaWindow))
            this._windowCreationTimes.set(metaWindow, metaWindow.get_id());

        const onMaximizeChange = () => {
            if (this._isTiling)
                return;

            const ws = metaWindow.get_workspace();
            if (!ws)
                return;

            const isMaximized = metaWindow.maximized_horizontally
                && metaWindow.maximized_vertically;
            const isPartiallyMaximized = metaWindow.maximized_horizontally
                || metaWindow.maximized_vertically;
            const multiWindow = this._tileableCount(ws) >= 2;
            const expected = this._expectedGeometries?.get(metaWindow);

            if (isMaximized) {
                this._cancelUnmaximizeRetile(metaWindow);
                if (multiWindow) {
                    // Only block duplicate maximize for apps still opening; manual
                    // maximize of one tiled window is allowed via _userExpanded.
                    if (this._pendingWindows.has(metaWindow)) {
                        const hasMaximizedSibling = this._tileableWindows(
                            metaWindow.get_workspace(), true
                        ).some(w => w !== metaWindow
                            && w.maximized_horizontally
                            && w.maximized_vertically);
                        if (hasMaximizedSibling || this._shouldIgnoreLateAppMaximize(metaWindow)) {
                            metaWindow.unmaximize();
                            this._scheduleRetile();
                            return;
                        }
                    }

                    if (!expected || !expected.maximized) {
                        if (this._shouldIgnoreLateAppMaximize(metaWindow)) {
                            metaWindow.unmaximize();
                            this._scheduleRetile();
                            return;
                        }
                        this._userExpanded.set(metaWindow, true);
                    }
                }
                this._updateExpectedGeometry(metaWindow);
                return;
            }

            // Mark user intent early so a retile during the maximize animation
            // does not snap the window back to a half tile.
            if (multiWindow && isPartiallyMaximized && !this._pendingWindows.has(metaWindow)
                && (!expected || !expected.maximized)
                && !this._shouldIgnoreLateAppMaximize(metaWindow)) {
                this._userExpanded.set(metaWindow, true);
            }

            if (this._isUserExpanded(metaWindow)) {
                this._debounceUnmaximizeRetile(metaWindow);
                return;
            }

            if (!this._isGeometryMatching(metaWindow))
                this._updateExpectedGeometry(metaWindow);
        };

        metaWindow.connectObject(
            "size-changed", () => {
                if (this._isTiling || this._shouldDeferRetile()
                    || this._isUserExpanded(metaWindow)
                    || this._isGeometryMatching(metaWindow))
                    return;
                this._scheduleRetile();
            },
            "notify::maximized-horizontally", onMaximizeChange,
            "notify::maximized-vertically", onMaximizeChange,
            "notify::fullscreen", () => this._scheduleRetile(),
            metaWindow);
    }

    _trackWorkspaceChanges(metaWindow) {
        if (this._workspaceChangeWindows.has(metaWindow))
            return;

        this._workspaceChangeWindows.add(metaWindow);
        this._connectedWindows.add(metaWindow);
        this._previousWorkspaces.set(metaWindow, metaWindow.get_workspace());

        const onWorkspaceChange = () => {
            this._onWindowWorkspaceChanged(metaWindow);
        };

        metaWindow.connectObject(
            "notify::workspace", onWorkspaceChange,
            "workspace-changed", onWorkspaceChange,
            "unmanaged", () => {
                this._releaseWindow(metaWindow);
                this._scheduleRetile();
            },
            metaWindow);
    }

    _onWindowWorkspaceChanged(metaWindow) {
        const newWs = metaWindow.get_workspace();
        const prevWs = this._previousWorkspaces.get(metaWindow);
        this._previousWorkspaces.set(metaWindow, newWs);

        const isExtensionMove = this._extensionWorkspaceMoves?.has(metaWindow);
        const isManualMove = !isExtensionMove
            && this._isTileable(metaWindow)
            && newWs
            && newWs !== prevWs;

        if (isExtensionMove) {
            this._extensionWorkspaceMoves.delete(metaWindow);
        } else if (isManualMove) {
            this._pendingManualWorkspaceMoves.add(metaWindow);
            this._manualMovePrevWorkspace.set(metaWindow, prevWs);
        }

        this._windowWorkspaceChangeTimes.set(metaWindow, Date.now());
        this._cancelUnmaximizeRetile(metaWindow);

        const affected = new Set([newWs, prevWs].filter(Boolean));
        for (const ws of affected)
            this._resetWorkspaceLayoutState(ws);

        if (this._isTileable(metaWindow))
            metaWindow.unmaximize();

        if (isManualMove) {
            this._rememberManualMoveSide(metaWindow, newWs, prevWs);

            if (this._retileId) {
                GLib.source_remove(this._retileId);
                this._retileId = null;
            }

            this._runWhileTiling(() => {
                for (const ws of affected)
                    this._tileWorkspace(ws);
            });
        }

        this._scheduleRetileAfterWorkspaceChange(affected);
    }

    _isManualWorkspaceMove(metaWindow, workspace) {
        return isManualCrossWorkspaceMove(metaWindow, workspace, {
            pendingManualMoves: this._pendingManualWorkspaceMoves,
            extensionWorkspaceMoves: this._extensionWorkspaceMoves,
            previousWorkspaces: this._previousWorkspaces,
            isTileable: (window) => this._isTileable(window),
            windowTypeNormal: Meta.WindowType.NORMAL,
        });
    }

    _resetWorkspaceLayoutState(workspace) {
        if (!workspace)
            return;

        this._workspaceOrder.delete(workspace);

        for (const w of workspace.list_windows()) {
            if (w.get_window_type() !== Meta.WindowType.NORMAL)
                continue;
            this._userExpanded?.delete(w);
            this._expectedGeometries?.delete(w);
        }
    }

    _unmaximizeTileableOnWorkspace(workspace) {
        if (!workspace)
            return;

        for (const w of this._tileableWindows(workspace, true)) {
            if (w.maximized_horizontally || w.maximized_vertically)
                w.unmaximize();
        }
    }

    _scheduleRetileAfterWorkspaceChange(workspaces) {
        for (const ws of workspaces ?? [])
            this._pendingWorkspaceRelayouts.add(ws);

        if (this._workspaceChangeRetileId)
            return;

        this._workspaceChangeRetileId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            WORKSPACE_CHANGE_RETILE_DELAY_MS,
            () => {
                this._workspaceChangeRetileId = null;
                const affected = Array.from(this._pendingWorkspaceRelayouts);
                this._pendingWorkspaceRelayouts.clear();

                if (affected.length === 0)
                    return GLib.SOURCE_REMOVE;

                if (this._shouldDeferRetile()) {
                    for (const ws of affected)
                        this._pendingWorkspaceRelayouts.add(ws);
                    this._scheduleRetileAfterWorkspaceChange([]);
                    return GLib.SOURCE_REMOVE;
                }

                for (const ws of affected)
                    this._unmaximizeTileableOnWorkspace(ws);

                for (const ws of affected) {
                    for (const w of this._tileableWindows(ws, true)) {
                        if (!this._pendingManualWorkspaceMoves?.has(w))
                            continue;
                        this._rememberManualMoveSide(
                            w, ws, this._manualMovePrevWorkspace?.get(w)
                        );
                        this._pendingManualWorkspaceMoves.delete(w);
                        this._manualMovePrevWorkspace.delete(w);
                    }
                }

                this._runWhileTiling(() => {
                    for (const ws of affected)
                        this._tileWorkspace(ws);
                });
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _releaseWindow(metaWindow) {
        this._disconnectTransientParentWatch(metaWindow);
        metaWindow.disconnectObject(metaWindow);
        this._connectedWindows?.delete(metaWindow);
        this._workspaceChangeWindows?.delete(metaWindow);
        this._tileSignalWindows?.delete(metaWindow);
        this._previousWorkspaces?.delete(metaWindow);
        this._userExpanded?.delete(metaWindow);
        this._cancelUnmaximizeRetile(metaWindow);
        this._windowCreationTimes.delete(metaWindow);
        this._windowWorkspaceChangeTimes.delete(metaWindow);
        this._manualMoveSide?.delete(metaWindow);
        this._pendingManualWorkspaceMoves?.delete(metaWindow);
        this._manualMovePrevWorkspace?.delete(metaWindow);
        this._extensionWorkspaceMoves?.delete(metaWindow);

        const info = this._pendingWindows.get(metaWindow);
        if (info) {
            this._clearPendingInfo(metaWindow, info);
            this._pendingWindows.delete(metaWindow);
        }
    }

    _clearPendingInfo(metaWindow, info) {
        metaWindow.disconnectObject(info);
        info.actor?.disconnectObject(info);
        if (info.timeoutId)
            GLib.source_remove(info.timeoutId);
    }

    _getTransientParent(metaWindow) {
        return metaWindow.get_transient_for?.() ?? null;
    }

    _isChildWindow(metaWindow) {
        return !!this._getTransientParent(metaWindow);
    }

    _isTileable(metaWindow) {
        return metaWindow.get_window_type() === Meta.WindowType.NORMAL
            && !this._isChildWindow(metaWindow)
            && !metaWindow.is_fullscreen()
            && !isLikelyMediaWindow(metaWindow);
    }

    _ensureChildOnParentWorkspace(metaWindow, parent) {
        if (!parent || metaWindow.is_destroyed?.())
            return;

        const parentWs = parent.get_workspace();
        if (!parentWs)
            return;

        if (metaWindow.get_workspace() !== parentWs) {
            this._extensionWorkspaceMoves.add(metaWindow);
            metaWindow.change_workspace(parentWs);
        }

        metaWindow.raise();
    }

    _disconnectTransientParentWatch(metaWindow) {
        const tracker = this._transientParentTrackers?.get(metaWindow);
        if (!tracker)
            return;
        metaWindow.disconnectObject(tracker);
        this._transientParentTrackers.delete(metaWindow);
    }

    _watchForTransientParent(metaWindow) {
        if (this._getTransientParent(metaWindow)
            || this._transientParentTrackers?.has(metaWindow))
            return;

        const tracker = {};
        this._transientParentTrackers.set(metaWindow, tracker);
        metaWindow.connectObject("notify::transient-for", () => {
            this._disconnectTransientParentWatch(metaWindow);
            const parent = this._getTransientParent(metaWindow);
            if (parent)
                this._ensureChildOnParentWorkspace(metaWindow, parent);
        }, tracker);
    }

    _tileableWindows(workspace, includePending = false) {
        return workspace.list_windows().filter(w =>
            this._isTileable(w) && (includePending || !this._pendingWindows.has(w))
        );
    }

    _tileableCount(workspace, includePending = false) {
        return this._tileableWindows(workspace, includePending).length;
    }

    _hasPendingTileable(workspace) {
        return workspace.list_windows().some(w =>
            this._isTileable(w) && this._pendingWindows.has(w)
        );
    }

    _finalizeNewWindow(metaWindow) {
        if (metaWindow.is_destroyed?.())
            return;

        const parent = this._getTransientParent(metaWindow);
        if (parent) {
            this._ensureChildOnParentWorkspace(metaWindow, parent);
            return;
        }

        if (!this._isTileable(metaWindow))
            return;

        const ws = metaWindow.get_workspace();
        let joinExistingOnNext = null;

        const existingOnWs = this._tileableWindows(ws).filter(w => w !== metaWindow);
        if (existingOnWs.length === 1) {
            const existing = existingOnWs[0];
            this._workspaceOrder.set(ws, buildNewWindowPairOrder(existing, metaWindow));
            const wasMaximized = metaWindow.maximized_horizontally && metaWindow.maximized_vertically;
            if (wasMaximized)
                metaWindow.unmaximize();
        }

        if (this._tileableCount(ws, true) > 2) {
            const wsManager = global.workspace_manager;
            const nextIndex = ws.index() + 1;
            if (nextIndex < wsManager.get_n_workspaces()) {
                const nextWs = wsManager.get_workspace_by_index(nextIndex);
                const existing = this._tileableWindows(nextWs);
                if (existing.length === 1)
                    joinExistingOnNext = existing[0];
            }

            if (joinExistingOnNext) {
                const destWs = joinExistingOnNext.get_workspace();
                this._extensionWorkspaceMoves.add(metaWindow);
                metaWindow.change_workspace(destWs);
            } else {
                const newWs = wsManager.append_new_workspace(false, global.get_current_time());
                metaWindow.change_workspace(newWs);
                wsManager.reorder_workspace(newWs, nextIndex);
            }
        }

        this._trackWindow(metaWindow);
        this._waitForWindowReady(metaWindow, () => {
            const destWs = metaWindow.get_workspace();
            if (joinExistingOnNext) {
                this._workspaceOrder.set(destWs, buildOverflowJoinPairOrder(joinExistingOnNext, metaWindow));
            }
            this._tileWorkspace(destWs);
        });
    }

    _onWindowCreated(metaWindow) {
        if (metaWindow.get_window_type() !== Meta.WindowType.NORMAL)
            return;
        this._windowCreationTimes.set(metaWindow, Date.now());
        this._trackWorkspaceChanges(metaWindow);
        this._watchForTransientParent(metaWindow);

        // Defer so transient_for is usually set before overflow/workspace logic runs.
        this._cancelPendingFinalize(metaWindow);
        const idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._pendingFinalizeIdleIds.delete(metaWindow);
            this._finalizeNewWindow(metaWindow);
            return GLib.SOURCE_REMOVE;
        });
        this._pendingFinalizeIdleIds.set(metaWindow, idleId);
    }

    _cancelPendingFinalize(metaWindow) {
        const idleId = this._pendingFinalizeIdleIds?.get(metaWindow);
        if (!idleId)
            return;
        GLib.source_remove(idleId);
        this._pendingFinalizeIdleIds.delete(metaWindow);
    }

    _isUserExpanded(metaWindow) {
        return this._userExpanded?.get(metaWindow) === true;
    }

    _workspaceHasUserExpanded(workspace) {
        return this._tileableWindows(workspace).some(w => this._isUserExpanded(w));
    }

    _cancelUnmaximizeRetile(metaWindow) {
        const id = this._unmaximizeRetileIds?.get(metaWindow);
        if (id) {
            GLib.source_remove(id);
            this._unmaximizeRetileIds.delete(metaWindow);
        }
    }

    _debounceUnmaximizeRetile(metaWindow) {
        this._cancelUnmaximizeRetile(metaWindow);
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNMAXIMIZE_RETILE_DELAY_MS, () => {
            this._unmaximizeRetileIds.delete(metaWindow);
            if (metaWindow.maximized_horizontally && metaWindow.maximized_vertically)
                return GLib.SOURCE_REMOVE;
            if (this._shouldDeferRetile()) {
                this._debounceUnmaximizeRetile(metaWindow);
                return GLib.SOURCE_REMOVE;
            }
            this._userExpanded?.delete(metaWindow);
            this._scheduleRetile();
            return GLib.SOURCE_REMOVE;
        });
        this._unmaximizeRetileIds.set(metaWindow, id);
    }

    _waitForWindowReady(metaWindow, callback) {
        const info = {timeoutId: null, actor: null};
        this._pendingWindows.set(metaWindow, info);

        let done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            this._clearPendingInfo(metaWindow, info);
            this._pendingWindows.delete(metaWindow);
            callback();
        };

        info.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PENDING_TILE_TIMEOUT_MS, () => {
            finish();
            return GLib.SOURCE_REMOVE;
        });

        const actor = metaWindow.get_compositor_private();
        if (actor) {
            info.actor = actor;
            actor.connectObject("first-frame", finish, info);
        } else {
            metaWindow.connectObject("shown", () => {
                const act = metaWindow.get_compositor_private();
                if (act && !info.actor) {
                    info.actor = act;
                    act.connectObject("first-frame", finish, info);
                } else {
                    finish();
                }
            }, info);
        }
    }

    _shouldDeferRetile() {
        if (Main.modalCount > 0)
            return true;

        return global.display.list_all_windows().some(w => {
            const type = w.get_window_type();
            return type === Meta.WindowType.MENU
                || type === Meta.WindowType.DROPDOWN_MENU
                || type === Meta.WindowType.POPUP
                || type === Meta.WindowType.COMBO
                || type === Meta.WindowType.TOOLTIP
                || type === Meta.WindowType.UTILITY;
        });
    }

    _scheduleRetile() {
        if (this._shouldDeferRetile())
            return;

        if (this._retileId)
            GLib.source_remove(this._retileId);

        this._retileId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (this._shouldDeferRetile())
                return GLib.SOURCE_REMOVE;
            this._retileId = null;
            this._runWhileTiling(() => {
                const wsManager = global.workspace_manager;
                for (let i = 0; i < wsManager.get_n_workspaces(); i++)
                    this._tileWorkspace(wsManager.get_workspace_by_index(i));
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _getWorkArea() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return null;
        return Main.layoutManager.getWorkAreaForMonitor(monitor.index);
    }

    _rememberManualMoveSide(metaWindow, newWs, prevWs) {
        if (!newWs)
            return;

        const othersOnNew = this._tileableWindows(newWs, true)
            .filter(w => w !== metaWindow);
        if (othersOnNew.length < 1)
            return;

        const area = this._getWorkArea();
        if (!area)
            return;

        const fromOtherWorkspace = prevWs && prevWs !== newWs;
        const side = fromOtherWorkspace
            ? sideFromWorkspaceDirection(newWs, prevWs)
            : (detectHalfTileSide(metaWindow, area)
                ?? sideFromExpectedGeometry(this._expectedGeometries?.get(metaWindow), area)
                ?? sideFromFrameCenter(metaWindow, area));
        if (side) {
            this._manualMoveSide.set(metaWindow, side);
            if (fromOtherWorkspace && othersOnNew.length === 1) {
                this._workspaceOrder.set(
                    newWs,
                    buildManualMoveWorkspaceOrder(metaWindow, othersOnNew[0], side)
                );
            }
        }
    }

    _prepareWindowsForRetile(windows, workspace) {
        const count = windows.length;
        if (count === 0)
            return;

        if (count === 1) {
            const w = windows[0];
            const hasJoiningNormalWindow = workspace.list_windows().some(other =>
                other !== w
                && other.get_window_type() === Meta.WindowType.NORMAL
                && !other.is_destroyed?.());
            if (!this._isUserExpanded(w)
                && !shouldPreserveLoneWindowGeometry({
                    hasPendingTileable: this._hasPendingTileable(workspace),
                    hasJoiningNormalWindow,
                })) {
                w.unmaximize();
            }
            return;
        }

        if (this._workspaceHasUserExpanded(workspace))
            return;

        for (const w of windows) {
            if (!this._isUserExpanded(w))
                w.unmaximize();
        }
    }

    _tileWorkspace(workspace) {
        if (!workspace)
            return;

        const area = this._getWorkArea();
        if (!area)
            return;

        const windows = this._tileableWindows(workspace);
        if (windows.length === 0)
            return;

        for (const w of windows) {
            if (!this._pendingManualWorkspaceMoves?.has(w))
                continue;
            this._rememberManualMoveSide(
                w, workspace, this._manualMovePrevWorkspace?.get(w)
            );
        }

        this._prepareWindowsForRetile(windows, workspace);

        if (this._workspaceHasUserExpanded(workspace)) {
            for (const w of windows) {
                if (this._isUserExpanded(w))
                    this._updateExpectedGeometry(w);
            }
            return;
        }

        this._runWhileTiling(() => {
            if (windows.length === 1) {
                if (shouldMaximizeLoneWindow({
                    tileableCount: windows.length,
                    hasPendingTileable: this._hasPendingTileable(workspace),
                    joiningAnother: workspace.list_windows().some(w =>
                        w !== windows[0]
                        && w.get_window_type() === Meta.WindowType.NORMAL
                        && !w.is_destroyed?.()),
                }))
                    this._maximizeWindow(windows[0], area);
                return;
            }

            let orderedWindows;
            const movedWindow = windows.find(w => this._manualMoveSide?.has(w));
            const side = movedWindow ? this._manualMoveSide.get(movedWindow) : null;
            const orderOptions = {
                creationTimes: this._windowCreationTimes,
                workspaceChangeTimes: this._windowWorkspaceChangeTimes,
                savedOrder: this._workspaceOrder.get(workspace),
            };

            if (movedWindow && side && windows.length === 2) {
                orderedWindows = resolveTwoWindowOrder(windows, {...orderOptions, movedWindow, side});
                this._manualMoveSide.delete(movedWindow);
                this._pendingManualWorkspaceMoves?.delete(movedWindow);
                this._manualMovePrevWorkspace?.delete(movedWindow);
            } else if (windows.length === 2) {
                const newest = windows.reduce((latest, w) => {
                    const latestTime = this._windowCreationTimes.get(latest) ?? latest.get_id();
                    const wTime = this._windowCreationTimes.get(w) ?? w.get_id();
                    return wTime > latestTime ? w : latest;
                });
                orderedWindows = resolveTwoWindowOrder(windows, {...orderOptions, newWindow: newest});
            } else {
                orderedWindows = resolveWindowOrder(windows, orderOptions);
            }

            this._workspaceOrder.set(workspace, orderedWindows);
            this._tileLeft(orderedWindows[0], area);
            this._tileRight(orderedWindows[1], area);
            this._raiseTransients(orderedWindows[0]);
            this._raiseTransients(orderedWindows[1]);
        });
    }

    _raiseTransients(metaWindow) {
        for (const w of global.display.list_all_windows()) {
            if (w.get_transient_for() === metaWindow)
                w.raise();
        }
    }

    _setExpectedGeometry(metaWindow, geometry) {
        if (this._expectedGeometries)
            this._expectedGeometries.set(metaWindow, geometry);
    }

    _maximizeWindow(metaWindow, area) {
        metaWindow.unmaximize();
        metaWindow.move_resize_frame(false, area.x, area.y, area.width, area.height);
        metaWindow.maximize();

        this._setExpectedGeometry(metaWindow, {
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
            maximized: true,
        });
        this._raiseTransients(metaWindow);
    }

    _tileLeft(metaWindow, area) {
        const {halfW, height, leftX, y} = halfTileGeometry(area);
        metaWindow.unmaximize();
        metaWindow.move_resize_frame(false, leftX, y, halfW, height);

        this._setExpectedGeometry(metaWindow, {
            x: leftX,
            y,
            width: halfW,
            height,
            maximized: false,
        });
    }

    _tileRight(metaWindow, area) {
        const {halfW, height, rightX, y} = halfTileGeometry(area);
        metaWindow.unmaximize();
        metaWindow.move_resize_frame(false, rightX, y, halfW, height);

        this._setExpectedGeometry(metaWindow, {
            x: rightX,
            y,
            width: halfW,
            height,
            maximized: false,
        });
    }

    _updateExpectedGeometry(metaWindow) {
        if (!this._expectedGeometries)
            return;

        const area = this._getWorkArea();
        if (!area)
            return;

        const isMaximized = metaWindow.maximized_horizontally && metaWindow.maximized_vertically;
        if (isMaximized) {
            this._setExpectedGeometry(metaWindow, {
                x: area.x,
                y: area.y,
                width: area.width,
                height: area.height,
                maximized: true,
            });
            return;
        }

        const rect = metaWindow.get_frame_rect();
        const {halfW, height, leftX, rightX, y} = halfTileGeometry(area);
        const tol = GEOMETRY_TOLERANCE;

        if (Math.abs(rect.x - leftX) <= tol && Math.abs(rect.y - y) <= tol
            && Math.abs(rect.width - halfW) <= tol && Math.abs(rect.height - height) <= tol) {
            this._setExpectedGeometry(metaWindow, {x: leftX, y, width: halfW, height, maximized: false});
            return;
        }

        if (Math.abs(rect.x - rightX) <= tol && Math.abs(rect.y - y) <= tol
            && Math.abs(rect.width - halfW) <= tol && Math.abs(rect.height - height) <= tol) {
            this._setExpectedGeometry(metaWindow, {x: rightX, y, width: halfW, height, maximized: false});
        }
    }

    _isGeometryMatching(metaWindow) {
        if (!this._expectedGeometries)
            return true;

        return geometryMatches(metaWindow, this._expectedGeometries.get(metaWindow));
    }

}
