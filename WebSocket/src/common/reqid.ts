import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { pid } from 'node:process';

function hexStringToNumber(hexString: string): number {  
    const number = parseInt(hexString, 16);  
    if (isNaN(number)) {  
        throw new Error(`无法将字符串 ${hexString} 转换为数字`);  
    }  
    return number;  
}

function uuidToHash(): number { 
    let uuid = uuidv4(); 
    // 创建一个 SHA-256 哈希实例  
    const hash = createHash('sha256');  
      
    // 更新哈希内容  
    hash.update(uuid);  
      
    // 获取十六进制表示的哈希值  
    const strHex = hash.digest('hex').substring(0, 8);
    
    let hex = hexStringToNumber(strHex)
    console.log("777777777->", strHex, hex.toString(16))
    // return new Uint16Array(hexToBytes(hex)) 

    return hex & 0xff;
}  

export class ReqId {
    // private static _tUUIDHashId:number;
    private static _reqIdHead:number = 0;
    private static _uuid = 0;
    private static _pid = 0
    private static sharedBuffer = new SharedArrayBuffer(4); // 创建一个 4 字节的 SharedArrayBuffer  
    private static int32View = new Int32Array(ReqId.sharedBuffer); // 创建一个 Int32Array 视图来访问 SharedArrayBuffer 
    static {
        this._uuid = uuidToHash();

        if (pid) {
           this._pid = pid & 0xf
        }else{
            this._pid = (Math.floor(Math.random() * 9000) + 1000) & 0xf;
        }
        
    
        Atomics.store(ReqId.int32View, 0, 0); // 初始值设为 0 
    }

    public static getReqID(req_id?:number):number {
        if (req_id) {
            return req_id;
        }
        let no = Atomics.add(ReqId.int32View, 0, 1)
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        let ts = new Date().getTime() >> 8
        view.setUint8(6, this._uuid >> 4);
        view.setUint8(5, (this._uuid & 0x0f) << 4 | this._pid);
        view.setUint8(4, ts >> 16 & 0xff);
        view.setUint16(2, ts & 0xffff, true); 
        view.setUint16(0, no & 0xffff, true)
        let id = view.getBigInt64(0, true)
        console.log(buffer)
        return Number(id);
    }    
}