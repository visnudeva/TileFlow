export function computeWindowOrder(windows, creationTimes, workspaceChangeTimes) {
    return windows.slice().sort((a, b) => {
        const wsTimeA = workspaceChangeTimes.get(a) ?? 0;
        const wsTimeB = workspaceChangeTimes.get(b) ?? 0;
        if (wsTimeA !== wsTimeB)
            return wsTimeA - wsTimeB;

        const timeA = creationTimes.get(a) ?? a.get_id();
        const timeB = creationTimes.get(b) ?? b.get_id();
        if (timeA !== timeB)
            return timeA - timeB;

        return a.get_id() - b.get_id();
    });
}

export function orderWithNewOnRight(windows, newWindow, creationTimes, workspaceChangeTimes) {
    const others = windows.filter(w => w !== newWindow);
    if (windows.length === 2 && others.length === 1)
        return [others[0], newWindow];

    return computeWindowOrder(windows, creationTimes, workspaceChangeTimes);
}
