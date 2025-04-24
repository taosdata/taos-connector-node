"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeDecodeURIComponent = exports.zigzagDecode = exports.getBinarySql = exports.isEmpty = exports.getUrl = void 0;
const wsError_1 = require("./wsError");
function getUrl(wsConfig) {
    let url = new URL(wsConfig.getUrl());
    if (wsConfig.getUser()) {
        url.username = wsConfig.getUser() || '';
    }
    if (wsConfig.getPwd()) {
        url.password = wsConfig.getPwd() || '';
    }
    let token = wsConfig.getToken();
    if (token) {
        url.searchParams.set("token", token);
    }
    url.pathname = '/ws';
    return url;
}
exports.getUrl = getUrl;
function isEmpty(value) {
    if (value === null || value === undefined)
        return true;
    // if (typeof value === 'string' && value.trim() === '') return true;  
    if (Array.isArray(value) && value.length === 0)
        return true;
    // if (typeof value === 'object' && Object.keys(value).length === 0) return true;  
    return false;
}
exports.isEmpty = isEmpty;
function getBinarySql(action, reqId, resultId, sql) {
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
exports.getBinarySql = getBinarySql;
function zigzagDecode(n) {
    return (n >> 1) ^ (-(n & 1));
}
exports.zigzagDecode = zigzagDecode;
function safeDecodeURIComponent(str) {
    // Replace invalid "%" not followed by two hex characters with "%25"
    const cleaned = str.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
    try {
        return decodeURIComponent(cleaned);
    }
    catch (e) {
        throw (new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_INVALID_URL, `Decoding ${str} error: ${e}`));
    }
}
exports.safeDecodeURIComponent = safeDecodeURIComponent;
