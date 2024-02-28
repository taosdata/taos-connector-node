import { WSConfig } from "./config";

export function ReqIDIncrement(reqId: number): number {
    if (reqId == Number.MAX_SAFE_INTEGER) {
        reqId = 0;
    } else {
        reqId += 1;
    }
    return reqId;
}

export function GetUrl(wsConfig:WSConfig):URL {
    let url = new URL(wsConfig.GetUrl())
    if (wsConfig.GetUser()) {
        url.username = wsConfig.GetUser() || '' 
    }
    if (wsConfig.GetPwd()) {
        url.password = wsConfig.GetPwd() || ''
    }
    return url
}