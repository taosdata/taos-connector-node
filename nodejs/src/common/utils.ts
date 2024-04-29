import { WSConfig } from "./config";

export function getUrl(wsConfig:WSConfig):URL {
    let url = new URL(wsConfig.getUrl())
    if (wsConfig.getUser()) {
        url.username = wsConfig.getUser() || '' 
    }
    if (wsConfig.getPwd()) {
        url.password = wsConfig.getPwd() || ''
    }

    let token = wsConfig.getToken()
    if (token) {
        url.searchParams.set("token", token)
    }
    url.pathname = '/ws'
    return url
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
  

export function isEmpty(value: any): boolean {  
    if (value === null || value === undefined) return true;  
    // if (typeof value === 'string' && value.trim() === '') return true;  
    if (Array.isArray(value) && value.length === 0) return true;  
    // if (typeof value === 'object' && Object.keys(value).length === 0) return true;  
    return false;  
}