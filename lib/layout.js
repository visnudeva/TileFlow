import {computeWindowOrder, orderWithNewOnRight} from "./window-order.js";

function buildPairOrder(movedWindow, otherWindow, side) {
    return side === "left"
        ? [movedWindow, otherWindow]
        : [otherWindow, movedWindow];
}

export function buildNewWindowPairOrder(existingWindow, newWindow) {
    return [existingWindow, newWindow];
}

export function buildOverflowJoinPairOrder(existingWindow, newWindow) {
    return [newWindow, existingWindow];
}

export function buildManualMoveWorkspaceOrder(metaWindow, otherWindow, side) {
    return buildPairOrder(metaWindow, otherWindow, side);
}

export function resolveTwoWindowOrder(windows, options) {
    const {
        savedOrder = null,
        movedWindow = null,
        side = null,
        newWindow = null,
        creationTimes,
        workspaceChangeTimes,
    } = options;

    if (windows.length !== 2)
        throw new Error("resolveTwoWindowOrder expects exactly two windows");

    if (movedWindow && side) {
        const other = windows.find(w => w !== movedWindow);
        return buildPairOrder(movedWindow, other, side);
    }

    if (savedOrder?.length === windows.length
        && savedOrder.every(w => windows.includes(w))) {
        return savedOrder;
    }

    if (newWindow)
        return orderWithNewOnRight(windows, newWindow, creationTimes, workspaceChangeTimes);

    return computeWindowOrder(windows, creationTimes, workspaceChangeTimes);
}

export function resolveWindowOrder(windows, options) {
    if (windows.length === 2)
        return resolveTwoWindowOrder(windows, options);

    const {savedOrder = null, creationTimes, workspaceChangeTimes} = options;
    if (savedOrder?.length === windows.length
        && savedOrder.every(w => windows.includes(w))) {
        return savedOrder;
    }

    return computeWindowOrder(windows, creationTimes, workspaceChangeTimes);
}

export function shouldMaximizeLoneWindow({tileableCount, hasPendingTileable, joiningAnother}) {
    return tileableCount === 1 && !hasPendingTileable && !joiningAnother;
}

export function shouldPreserveLoneWindowGeometry({hasPendingTileable, hasJoiningNormalWindow}) {
    return hasPendingTileable || hasJoiningNormalWindow;
}
