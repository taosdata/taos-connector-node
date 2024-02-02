
export function ReqIDIncrement(reqId: number): number {
    if (reqId == Number.MAX_SAFE_INTEGER) {
        reqId = 0;
    } else {
        reqId += 1;
    }
    return reqId;
}