"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopicPartition = exports.CommittedResp = exports.PartitionsResp = exports.SubscriptionResp = exports.AssignmentResp = exports.WSTmqFetchBlockInfo = exports.TaosTmqResult = exports.WsTmqQueryResponse = exports.WsPollResponse = void 0;
const wsResponse_1 = require("../client/wsResponse");
const constant_1 = require("../common/constant");
const taosResult_1 = require("../common/taosResult");
const wsError_1 = require("../common/wsError");
const constant_2 = require("./constant");
const utils_1 = require("../common/utils");
const log_1 = __importDefault(require("../common/log"));
class WsPollResponse {
    constructor(resp) {
        this.totalTime = resp.totalTime;
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
        }
        else {
            this.id = BigInt(0);
        }
    }
}
exports.WsPollResponse = WsPollResponse;
//  resp: {"code":0,"message":"","action":"fetch","req_id":4,"message_id":1,"completed":false,"table_name":"ct2","rows":1,"fields_count":4,"fields_names":["ts","c1","c2","c3"],"fields_types":[9,4,6,8],"fields_lengths":[8,4,4,10],"precision":0}
class WsTmqQueryResponse extends wsResponse_1.WSQueryResponse {
    constructor(resp) {
        super(resp);
        this.completed = resp.msg.completed;
        this.table_name = resp.msg.table_name;
        this.rows = resp.msg.rows;
        this.message_id = resp.msg.message_id;
    }
}
exports.WsTmqQueryResponse = WsTmqQueryResponse;
class TaosTmqResult extends taosResult_1.TaosResult {
    constructor(pollResp) {
        super();
        this.setTopic(pollResp.topic);
        this.database = pollResp.database;
        this.vgroup_id = pollResp.vgroup_id;
    }
}
exports.TaosTmqResult = TaosTmqResult;
class WSTmqFetchBlockInfo {
    constructor(dataView, taosResult) {
        // this.totalTime = resp.totalTime
        // this.blockData = resp.msg
        this.textDecoder = new TextDecoder();
        this.taosResult = taosResult;
        this.schema = [];
        this.schemaLen = 0;
        let blockDataView = this.skipHead(dataView);
        this.rows = this.parseBlockInfos(blockDataView);
    }
    getRows() {
        return this.rows;
    }
    skipHead(dataView) {
        let v = dataView.getUint8(0);
        if (v >= 100) {
            let skip = dataView.getUint32(1, true);
            return new DataView(dataView.buffer, dataView.byteOffset + skip + 5);
        }
        let skip1 = this.getTypeSkip(v);
        v = dataView.getUint8(1 + skip1);
        let skip2 = this.getTypeSkip(v);
        return new DataView(dataView.buffer, dataView.byteOffset + skip1 + 2 + skip2);
    }
    getTypeSkip(v) {
        switch (v) {
            case 1:
                return 8;
            case 2:
            case 3:
                return 16;
            default:
                throw (new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_INVALID_FETCH_MESSAGE_DATA, `FetchBlockRawResp getTypeSkip error, type: ${v}`));
        }
    }
    parseBlockInfos(dataView) {
        let blockNum = dataView.getUint32(0, true);
        if (blockNum == 0) {
            return 0;
        }
        this.withTableName = dataView.getUint8(4) == 1 ? true : false;
        this.withSchema = dataView.getUint8(5) == 1 ? true : false;
        // let dataBuffer = dataView.buffer.slice(6)
        let dataBuffer = new DataView(dataView.buffer, dataView.byteOffset + 6);
        let rows = 0;
        // const parseStartTime = new Date().getTime();
        // console.log("parseBlockInfos blockNum="+ blockNum)
        for (let i = 0; i < blockNum; i++) {
            let variableInfo = this.parseVariableByteInteger(dataBuffer);
            this.taosResult.setPrecision(variableInfo[1].getUint8(17));
            dataView = new DataView(variableInfo[1].buffer, variableInfo[1].byteOffset + 17);
            let offset = variableInfo[0] - 17;
            dataBuffer = this.parseSchemaInfo(dataView, offset);
            rows += this.parseTmqBlock(dataView, 1);
        }
        // const parseEndTime = new Date().getTime();
        // console.log("------------->", parseEndTime- parseStartTime, rows);
        log_1.default.info("parseBlockInfos blockNum=" + blockNum + ", withTableName=" + this.withTableName + ", withSchema=" + this.withSchema + ", rows=" + rows);
        return rows;
    }
    parseSchemaInfo(dataBuffer, offset) {
        if (this.withSchema) {
            let isSkip = this.schema.length > 0;
            if (!isSkip) {
                dataBuffer = new DataView(dataBuffer.buffer, dataBuffer.byteOffset + offset);
                let variableInfo = this.parseVariableByteInteger(dataBuffer);
                this.schemaLen = variableInfo[2];
                let cols = (0, utils_1.zigzagDecode)(variableInfo[0]);
                variableInfo = this.parseVariableByteInteger(variableInfo[1]);
                this.schemaLen += variableInfo[2];
                let dataView = variableInfo[1];
                for (let index = 0; index < cols; index++) {
                    let schema = new constant_2.TMQRawDataSchema();
                    schema.colType = dataView.getInt8(0);
                    schema.flag = dataView.getInt8(1);
                    variableInfo = this.parseVariableByteInteger(dataView, 2);
                    this.schemaLen += 2 + variableInfo[2];
                    schema.bytes = BigInt((0, utils_1.zigzagDecode)(variableInfo[0]));
                    variableInfo = this.parseVariableByteInteger(variableInfo[1]);
                    this.schemaLen += variableInfo[2];
                    schema.colID = (0, utils_1.zigzagDecode)(variableInfo[0]);
                    variableInfo = this.parseVariableByteInteger(variableInfo[1]);
                    this.schemaLen += variableInfo[2];
                    schema.name = (0, taosResult_1.getString)(variableInfo[1], 0, variableInfo[0], this.textDecoder);
                    if (!isSkip) {
                        this.taosResult.setMeta({
                            name: schema.name,
                            type: schema.colType,
                            length: Number(schema.bytes)
                        });
                        this.schema.push(schema);
                    }
                    dataView = new DataView(variableInfo[1].buffer, variableInfo[1].byteOffset + variableInfo[0]);
                    this.schemaLen += variableInfo[0];
                }
                if (this.withTableName) {
                    variableInfo = this.parseVariableByteInteger(dataView);
                    this.schemaLen += variableInfo[2];
                    this.tableName = (0, taosResult_1.readVarchar)(variableInfo[1].buffer, variableInfo[1].byteOffset, variableInfo[0], this.textDecoder);
                    dataView = new DataView(variableInfo[1].buffer, variableInfo[1].byteOffset + variableInfo[0]);
                    this.schemaLen += variableInfo[0];
                }
                return dataView;
            }
            else {
                return new DataView(dataBuffer.buffer, dataBuffer.byteOffset + this.schemaLen + offset);
            }
        }
        return dataBuffer;
    }
    parseVariableByteInteger(dataView, offset = 0) {
        let value = 0;
        let multiplier = 1;
        let count = 0;
        while (true) {
            let encodedByte = dataView.getUint8(count + offset);
            value += (encodedByte & 127) * multiplier;
            if ((encodedByte & 128) == 0) {
                break;
            }
            multiplier *= 128;
            count++;
        }
        return [value, new DataView(dataView.buffer, dataView.byteOffset + count + 1 + offset), count + 1];
    }
    parseTmqBlock(dataView, startOffset) {
        // let dataView = new DataView(dataBuffer)
        let rows = dataView.getInt32(8 + startOffset, true);
        if (rows == 0) {
            return rows;
        }
        let taosData = this.taosResult.getData();
        let metaData = this.taosResult.getMeta();
        if (metaData && rows && taosData) {
            let dataList = new Array(rows);
            //get bitmap length
            let bitMapOffset = getBitmapLen(rows);
            //skip data head
            let bufferOffset = 28 + 5 * this.schema.length + startOffset;
            let metaLens = [];
            for (let i = 0; i < this.schema.length; i++) {
                //get data len
                metaLens.push(dataView.getInt32(bufferOffset + i * 4, true));
            }
            bufferOffset += this.schema.length * 4;
            for (let i = 0; i < this.schema.length; i++) {
                let data = [];
                //get type code     
                let isVarType = (0, taosResult_1._isVarType)(this.schema[i].colType);
                //fixed length type 
                if (isVarType == constant_1.ColumnsBlockType.SOLID) {
                    // let bitMapArr = dataBuffer.slice(bufferOffset, bufferOffset + bitMapOffset);
                    let bitMapArr = new Uint8Array(dataView.buffer, dataView.byteOffset + bufferOffset, bitMapOffset);
                    bufferOffset += bitMapOffset;
                    //decode column data, data is array
                    data = (0, taosResult_1.readSolidDataToArray)(dataView, bufferOffset, rows, this.schema[i].colType, bitMapArr);
                }
                else {
                    //Variable length type   
                    let start = bufferOffset;
                    let offsets = [];
                    for (let i = 0; i < rows; i++, start += constant_1.TDengineTypeLength['INT']) {
                        //get data length, -1 is null
                        offsets.push(dataView.getInt32(start, true));
                    }
                    for (let i = 0; i < rows; i++) {
                        let value = '';
                        if (-1 == offsets[i]) {
                            value = null;
                        }
                        else {
                            let header = start + offsets[i];
                            let dataLength = dataView.getInt16(header, true) & 0xFFFF;
                            if (isVarType == constant_1.ColumnsBlockType.VARCHAR) {
                                //decode var char
                                value = (0, taosResult_1.readVarchar)(dataView.buffer, dataView.byteOffset + header + 2, dataLength, this.textDecoder);
                            }
                            else if (isVarType == constant_1.ColumnsBlockType.GEOMETRY || isVarType == constant_1.ColumnsBlockType.VARBINARY) {
                                //decode binary
                                value = (0, taosResult_1.readBinary)(dataView.buffer, dataView.byteOffset + header + 2, dataLength);
                            }
                            else {
                                //decode nchar
                                value = (0, taosResult_1.readNchar)(dataView.buffer, dataView.byteOffset + header + 2, dataLength);
                            }
                        }
                        data.push(value);
                    }
                    bufferOffset += rows * 4;
                }
                bufferOffset += metaLens[i];
                //column data to row data
                for (let row = 0; row < data.length; row++) {
                    if (dataList[row] == null) {
                        dataList[row] = [];
                    }
                    dataList[row].push(data[row]);
                }
            }
            taosData.push(...dataList);
        }
        return rows;
    }
}
exports.WSTmqFetchBlockInfo = WSTmqFetchBlockInfo;
class AssignmentResp {
    constructor(resp, topic) {
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
exports.AssignmentResp = AssignmentResp;
class SubscriptionResp {
    constructor(resp) {
        this.timing = BigInt(resp.msg.timing);
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.req_id = resp.msg.req_id;
        this.action = resp.msg.action;
        this.totalTime = resp.totalTime;
        this.topics = resp.msg.topics;
    }
}
exports.SubscriptionResp = SubscriptionResp;
class PartitionsResp {
    constructor(resp) {
        this.timing = BigInt(resp.msg.timing);
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.req_id = resp.msg.req_id;
        this.action = resp.msg.action;
        this.totalTime = resp.totalTime;
        this.positions = resp.msg.position;
    }
    setTopicPartitions(topicPartitions) {
        if (topicPartitions.length != this.positions.length) {
            throw new wsError_1.WebSocketInterfaceError(wsError_1.ErrorCode.ERR_PARTITIONS_TOPIC_VGROUP_LENGTH_NOT_EQUAL, 'TopicPartitions and positions are not equal in length');
        }
        for (let i in this.positions) {
            topicPartitions[i].offset = this.positions[i];
        }
        return topicPartitions;
    }
}
exports.PartitionsResp = PartitionsResp;
class CommittedResp extends PartitionsResp {
    constructor(resp) {
        super(resp);
        this.positions = resp.msg.committed;
    }
}
exports.CommittedResp = CommittedResp;
class TopicPartition {
    constructor(msg) {
        this.vgroup_id = msg.vgroup_id;
        this.offset = msg.offset;
        this.begin = msg.begin;
        this.end = msg.end;
        this.topic = '';
    }
}
exports.TopicPartition = TopicPartition;
function getBitmapLen(n) {
    return (n + 0x7) >> 3;
}
