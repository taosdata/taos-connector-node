import { WSConfig } from "./config";
import { ErrorCode, TDWebSocketClientError } from "./wsError";

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

export function safeDecodeURIComponent(str: string) {
    // Replace invalid "%" not followed by two hex characters with "%25"
    const cleaned = str.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
    try {
        return decodeURIComponent(cleaned);
    } catch (e) {
        throw(new TDWebSocketClientError(ErrorCode.ERR_INVALID_URL, `Decoding ${str} error: ${e}`))
    }
}

/**
 * 比较两个语义化版本号
 * @param v1 版本号1 (e.g., "3.3.6.3-alpha")
 * @param v2 版本号2 (e.g., "3.3.6.2")
 * @returns 
 *   - 1 如果 v1 > v2
 *   - -1 如果 v1 < v2
 *   - 0 如果相等
 */
export function compareVersions(v1: string, v2: string): number {
  // 解析版本号的核心部分和预发布标签
  const [main1, pre1] = splitVersion(v1);
  const [main2, pre2] = splitVersion(v2);

  // 比较主版本号部分
  const mainComparison = compareMainVersions(main1, main2);
  if (mainComparison !== 0) return mainComparison;

  // 主版本相同的情况下比较预发布标签
  return comparePreReleases(pre1, pre2);
}

/**
 * 分割版本号为主版本和预发布标签
 */
function splitVersion(version: string): [number[], string | null] {
  // 分割主版本和预发布标签
  const parts = version.split('-');
  const main = parts[0];
  const prerelease = parts.length > 1 ? parts[1] : null;

  // 将主版本分割为数字数组
  const mainParts = main.split('.').map(Number);
  
  return [mainParts, prerelease];
}

/**
 * 比较主版本号部分
 */
function compareMainVersions(v1: number[], v2: number[]): number {
  const maxLength = Math.max(v1.length, v2.length);
  
  for (let i = 0; i < maxLength; i++) {
    // 如果部分缺失则视为0
    const part1 = v1[i] || 0;
    const part2 = v2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  
  return 0; // 所有部分相等
}

/**
 * 比较预发布标签
 */
function comparePreReleases(pre1: string | null, pre2: string | null): number {
  // 都没有预发布标签 → 相等
  if (pre1 === null && pre2 === null) return 0;
  
  // 有预发布标签的版本优先级较低
  if (pre1 === null) return 1;   // v1 是稳定版 > v2
  if (pre2 === null) return -1;  // v2 是稳定版 > v1
  
  // 比较预发布标签字符串
  return pre1.localeCompare(pre2);
}


