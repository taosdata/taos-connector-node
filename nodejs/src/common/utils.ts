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

export function getBinarySql(action:bigint, reqId:bigint, resultId:bigint, sql?:string): ArrayBuffer{
    // construct msg
    
    if (sql) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(sql);
        let messageLen = 30 + buffer.length;
        let sqlBuffer = new ArrayBuffer(messageLen);
        let sqlView = new DataView(sqlBuffer);
        sqlView.setBigUint64(0, reqId, true);
        sqlView.setBigInt64(8, resultId, true);
        sqlView.setBigInt64(16, action, true);
        sqlView.setInt16(24, 1, true);
        sqlView.setInt32(26, buffer.length, true);
        let offset = 30;
        for (let i = 0; i < buffer.length; i++) {
            sqlView.setUint8(offset + i, buffer[i]);
        }
        return sqlBuffer;
    } 
    
    let messageLen = 26;
    let sqlBuffer = new ArrayBuffer(messageLen);
    let sqlView = new DataView(sqlBuffer);
    sqlView.setBigUint64(0, reqId, true);
    sqlView.setBigInt64(8, resultId, true);
    sqlView.setBigInt64(16, action, true);
    sqlView.setInt16(24, 1, true);
    return sqlBuffer;
}

export function zigzagDecode(n: number): number {
	return (n >> 1) ^ (-(n & 1))
}
