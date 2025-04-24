"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReqId = void 0;
const crypto_1 = require("crypto");
const uuid_1 = require("uuid");
const node_process_1 = require("node:process");
function hexStringToNumber(hexString) {
    const number = parseInt(hexString, 16);
    if (isNaN(number)) {
        throw new Error(`number ${hexString} parse int fail!`);
    }
    return number;
}
function uuidToHash() {
    let uuid = (0, uuid_1.v4)();
    // create SHA-256 hash  
    const hash = (0, crypto_1.createHash)('sha256');
    // update hash contact  
    hash.update(uuid);
    // get hex hash code  
    const strHex = hash.digest('hex').substring(0, 8);
    let hex = hexStringToNumber(strHex);
    return hex & 0xff;
}
class ReqId {
    static getReqID(req_id) {
        if (req_id) {
            return req_id;
        }
        let no = Atomics.add(_a.int32View, 0, 1);
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        let ts = new Date().getTime() >> 8;
        view.setUint8(6, this._uuid >> 4);
        view.setUint8(5, (this._uuid & 0x0f) << 4 | this._pid);
        view.setUint8(4, ts >> 16 & 0xff);
        view.setUint16(2, ts & 0xffff, true);
        view.setUint16(0, no & 0xffff, true);
        let id = view.getBigInt64(0, true);
        return Number(id);
    }
}
exports.ReqId = ReqId;
_a = ReqId;
ReqId._uuid = 0;
ReqId._pid = 0;
ReqId.sharedBuffer = new SharedArrayBuffer(4);
ReqId.int32View = new Int32Array(_a.sharedBuffer);
(() => {
    _a._uuid = uuidToHash();
    if (node_process_1.pid) {
        _a._pid = node_process_1.pid & 0xf;
    }
    else {
        _a._pid = (Math.floor(Math.random() * 9000) + 1000) & 0xf;
    }
    Atomics.store(_a.int32View, 0, 0);
})();
