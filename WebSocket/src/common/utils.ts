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
  

export function IsEmpty(value: any): boolean {  
    if (value === null || value === undefined) return true;  
    // if (typeof value === 'string' && value.trim() === '') return true;  
    if (Array.isArray(value) && value.length === 0) return true;  
    // if (typeof value === 'object' && Object.keys(value).length === 0) return true;  
    return false;  
}