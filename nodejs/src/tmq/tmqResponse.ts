import { WSQueryResponse } from "../client/wsResponse";
import { ColumnsBlockType, TDengineTypeLength } from "../common/constant";
import { MessageResp, TaosResult, _isVarType, readBinary, readNchar, readSolidDataToArray, readVarchar } from "../common/taosResult";
import { WebSocketInterfaceError, ErrorCode } from "../common/wsError";

export class WsPollResponse {
    code: number;
    message: string;
    action: string;
    req_id: number;
    have_message: boolean;
    topic: string;
    database: string;
    vgroup_id:number;
    message_id: number;
    id: bigint;
    message_type:number;
    totalTime:number;
        
    constructor(resp:MessageResp) {
        this.totalTime = resp.totalTime
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.action = resp.msg.action;
        this.req_id = resp.msg.req_id;
        this.have_message = resp.msg.have_message;
        this.topic = resp.msg.topic;
        this.database = resp.msg.database;
        this.vgroup_id = resp.msg.vgroup_id;
        this.message_id = resp.msg.message_id;
        this.message_type = resp.msg.message_type;
        if (resp.msg.id) {
            this.id = BigInt(resp.msg.id);
        }else{
            this.id = BigInt(0)
        }
    }
}

//  resp: {"code":0,"message":"","action":"fetch","req_id":4,"message_id":1,"completed":false,"table_name":"ct2","rows":1,"fields_count":4,"fields_names":["ts","c1","c2","c3"],"fields_types":[9,4,6,8],"fields_lengths":[8,4,4,10],"precision":0}
export class WsTmqQueryResponse extends WSQueryResponse{
    completed: boolean;
    table_name: string;
    rows:number;
    message_id:number;   


    constructor(resp:MessageResp) {
        super(resp);
        this.completed = resp.msg.completed;
        this.table_name = resp.msg.table_name;
        this.rows = resp.msg.rows;
        this.message_id = resp.msg.message_id;
    }
}

export class TaosTmqResult extends TaosResult {
    topic: string;
    database: string;
    vgroup_id:number;
    table_name:string;
    constructor(resp: WsTmqQueryResponse, pollResp:WsPollResponse) {
        super(resp);
        this.table_name = resp.table_name;
        // this._affectRows = resp.rows;
        this.topic = pollResp.topic;
        this.database = pollResp.database;
        this.vgroup_id = pollResp.vgroup_id;

    }
}

export class WSTmqFetchBlockResponse {
    totalTime : number;
    blockData : ArrayBuffer;
    constructor(resp:MessageResp) {
        this.totalTime = resp.totalTime
        this.blockData = resp.msg
    }
}
export class AssignmentResp{
    req_id: number;
    code: number;
    message: string;
    action: string;
    totalTime: number;
    timing:bigint;
    topicPartition:TopicPartition[];
    constructor(resp:MessageResp, topic:string) {
        this.timing = BigInt(resp.msg.timing);
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.req_id = resp.msg.req_id;
        this.action = resp.msg.action;
        this.totalTime = resp.totalTime;
        this.topicPartition = resp.msg.assignment;
        for (let i in this.topicPartition) {
            this.topicPartition[i].topic = topic;
        }
    }    
}
export class SubscriptionResp{
    req_id: number;
    code: number;
    message: string;
    action: string;
    totalTime: number;
    timing:bigint;
    topics:string[];
    constructor(resp:MessageResp) {
        this.timing = BigInt(resp.msg.timing);
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.req_id = resp.msg.req_id;
        this.action = resp.msg.action;
        this.totalTime = resp.totalTime;
        this.topics = resp.msg.topics;
    }      
}

export class PartitionsResp{
    req_id: number;
    code: number;
    message: string;
    action: string;
    totalTime: number;
    timing:bigint;
    positions:number[];
    constructor(resp:MessageResp) {
        this.timing = BigInt(resp.msg.timing);
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.req_id = resp.msg.req_id;
        this.action = resp.msg.action;
        this.totalTime = resp.totalTime;
        this.positions = resp.msg.position;
    }

    setTopicPartitions(topicPartitions:TopicPartition[]):TopicPartition[] {
        if (topicPartitions.length != this.positions.length) {
            throw new WebSocketInterfaceError(ErrorCode.ERR_PARTITIONS_TOPIC_VGROUP_LENGTH_NOT_EQUAL, 'TopicPartitions and positions are not equal in length');
        }
        for (let i in this.positions) {
            topicPartitions[i].offset = this.positions[i]
        }
        return topicPartitions;
    } 
    
}

export class CommittedResp extends PartitionsResp {
    constructor(resp:MessageResp) {
        super(resp);
        this.positions = resp.msg.committed
    }
}

export class TopicPartition {
    topic       :string;
    vgroup_id   :number;
    offset      ?:number;
    begin       ?:number;
    end         ?:number;
    constructor(msg:any) {
        this.vgroup_id = msg.vgroup_id;
        this.offset = msg.offset;
        this.begin = msg.begin;
        this.end = msg.end;
        this.topic = ''
    }
}

export function parseTmqBlock(rows:number, resp: WSTmqFetchBlockResponse, taosResult: TaosResult): TaosResult {
    let dataList:any[][] = new Array(rows);
    if (!resp || !taosResult) {
        return taosResult;
    }

    let metaList = taosResult.getTaosMeta()
    let taosdata = taosResult.getData()
    if (metaList && rows && taosdata) {
        //get bitmap length
        let bitMapOffset:number = getBitmapLen(rows);
        //skip data head
        let bufferOffset = 24 + 28 + 5 * metaList.length
        
        let dataBuffer:ArrayBuffer = resp.blockData.slice(bufferOffset);
        let metaLens:number[]= []
        for (let i = 0; i< metaList.length; i++) {
            //get data len
            metaLens.push(new DataView(dataBuffer, i*4, 4).getInt32(0, true)) 
        }
        bufferOffset = metaList.length * 4;
        
        for (let i = 0; i < metaList.length; i++) {
            let data:any[] = [];
            //get type code
            let isVarType = _isVarType(metaList[i])
            //fixed length type 
            if (isVarType == ColumnsBlockType.SOLID) {
                let bitMapArr = dataBuffer.slice(bufferOffset, bufferOffset + bitMapOffset);
                bufferOffset += bitMapOffset;
                //decode column data, data is array
                data = readSolidDataToArray(dataBuffer, bufferOffset, rows, metaList[i], bitMapArr);
            } else {  
                //Variable length type   
                let offset = bufferOffset;
                let offsets:number[]= [];
                for (let i = 0; i< rows; i++, offset += TDengineTypeLength['INT']) {
                    //get data length, -1 is null
                    offsets.push(new DataView(dataBuffer, offset, 4).getInt32(0, true)) 
                }
                let start = offset
                for (let i = 0; i< rows; i++) {
                    let value:any = ''
                    if (-1 == offsets[i]) {
                        value = null
                    }else{
                        let header = start + offsets[i];
                        let dataLength = new DataView(dataBuffer, header, 2).getInt16(0, true) & 0xFFFF;
                        if (isVarType == ColumnsBlockType.VARCHAR) {
                            //decode var char
                            value = readVarchar(dataBuffer, header + 2, dataLength)
                        } else if(isVarType == ColumnsBlockType.GEOMETRY || isVarType == ColumnsBlockType.VARBINARY) {
                            //decode binary
                            value = readBinary(dataBuffer, header + 2, dataLength)
                        } else {
                            //decode nchar
                            value = readNchar(dataBuffer, header + 2, dataLength)
                        }
                        
                    }
                    data.push(value);
                }
                bufferOffset += rows * 4
            }
            bufferOffset += metaLens[i]
            //column data to row data
            for (let row = 0; row < data.length; row++) {
                if (dataList[row] == null) {
                    dataList[row] = []
                }
                dataList[row].push(data[row])
            }
        }
        taosdata.push(...dataList);
    }
    

    return taosResult;
}

function getBitmapLen(n:number) {
    return (n + 0x7) >> 3;
}
