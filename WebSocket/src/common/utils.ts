import { WSConfig } from "./config";

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

export function Sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  