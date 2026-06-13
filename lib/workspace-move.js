export function isManualCrossWorkspaceMove(metaWindow, workspace, {
    pendingManualMoves,
    extensionWorkspaceMoves,
    previousWorkspaces,
    isTileable,
    windowTypeNormal,
}) {
    if (!metaWindow || metaWindow.get_window_type?.() !== windowTypeNormal)
        return false;

    if (pendingManualMoves?.has(metaWindow))
        return true;

    if (extensionWorkspaceMoves?.has(metaWindow))
        return false;

    if (!isTileable(metaWindow))
        return false;

    const currentWs = metaWindow.get_workspace();
    if (currentWs !== workspace)
        return false;

    const prevWs = previousWorkspaces?.get(metaWindow);
    return !!(prevWs && currentWs && prevWs !== currentWs);
}
