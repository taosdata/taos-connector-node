// import JSONBig from 'json-bigint';
// import { WsClient } from "../client/wsClient";
// import { ColumnsBlockType, FieldBindType, PrecisionLength } from "../common/constant";
// import logger from "../common/log";
// import { ReqId } from "../common/reqid";
// import { ErrorCode, TaosResultError, TDWebSocketClientError } from "../common/wsError";
// import { ColumnInfo, StmtBindParams, TableInfo } from "./wsParamsBase";
// import { StmtFieldInfo, StmtMessageInfo, WsStmtQueryResponse } from "./wsProto";
// import { WsStmt } from "./wsStmt";
// import { _isVarType } from '../common/taosResult';
// import { bigintToBytes, intToBytes, shotToBytes } from '../common/utils';



// export class WsStmt2 implements WsStmt{
//     private _wsClient: WsClient;
//     private _stmt_id: bigint | undefined | null;
//     private _precision:number = PrecisionLength['ms'];
//     private fields?: Array<StmtFieldInfo> | undefined | null;
//     private lastAffected: number | undefined | null;
//     private _stmtTableInfo: Map<string, TableInfo>;
//     private _currentTableInfo: TableInfo;
//     private _stmtTableInfoList: TableInfo[];
//     private _toBeBindTagCount: number;
//     private _toBeBindColCount: number;
//     private _toBeBindTableNameIndex: number | undefined | null;

//     private constructor(wsClient: WsClient, precision?:number) {
//         this._wsClient = wsClient;
//         if (precision) {
//             this._precision = precision;
//         }
//         this._stmtTableInfo = new Map<string, TableInfo>();
//         this._currentTableInfo = new TableInfo();
//         this._stmtTableInfoList = [];
//         this._toBeBindColCount = 0;
//         this._toBeBindTagCount = 0;
//     }
    
//     static async newStmt(wsClient: WsClient, precision?:number, reqId?:number): Promise<WsStmt> {
//         try {
//             let wsStmt = new WsStmt2(wsClient, precision)
//             return await wsStmt.init(reqId);
//         } catch(e: any) {
//             logger.error(`WsStmt init is failed, ${e.code}, ${e.message}`);
//             throw(e);
//         }

//     }

//     private async init(reqId: number | undefined): Promise<WsStmt2> {
//         if (this._wsClient) {   
//         try {
//             if (this._wsClient.getState() <= 0) {
//                 await this._wsClient.connect();
//                 await this._wsClient.checkVersion();
//             }
//             let queryMsg = {
//                 action: 'stmt2_init',
//                 args: {
//                     req_id: ReqId.getReqID(reqId),
//                     single_stb_insert: true,
//                     single_table_bind_once: true
//                 },
//             };
//             await this.execute(queryMsg);
//             return this;  
//         } catch (e: any) {
//             logger.error(`stmt init filed, ${e.code}, ${e.message}`);
//             throw(e);
//         }   
    
//         }
//         throw(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed"));        
//     }

//     async prepare(sql: string): Promise<void> {
//         let queryMsg = {
//             action: 'stmt2_prepare',
//             args: {
//                 req_id: ReqId.getReqID(),
//                 sql: sql,
//                 stmt_id: this._stmt_id,
//                 get_fields: true,
//             },
//         };
//         await this.execute(queryMsg);
//         if (this.fields && this.fields[0].precision) {
//             this._precision = this.fields[0].precision;
//         }

//         this._toBeBindColCount = 0;
//         this._toBeBindTagCount = 0;
//         this.fields?.forEach((field, index) => {
//          if (field.bind_type == FieldBindType.TAOS_FIELD_TBNAME) {
//             this._toBeBindTableNameIndex = index;
//          } else if (field.bind_type == FieldBindType.TAOS_FIELD_TAG) {
//             this._toBeBindTagCount++;
//          } else if (field.bind_type == FieldBindType.TAOS_FIELD_COL) {
//             this._toBeBindColCount++;
//          }
//         });

//     }

//     async setTableName(tableName: string): Promise<void> {
//         if (!tableName || tableName.length === 0) {
//             throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'Table name cannot be empty');
//         }
//         let tableInfo = this._stmtTableInfo.get(tableName);
//         if (!tableInfo) {
//             this._currentTableInfo = new TableInfo(tableName);
//             this._stmtTableInfo.set(tableName, this._currentTableInfo);
//             this._stmtTableInfoList.push(this._currentTableInfo);
//             console.log(`New table info created for table: ${this._currentTableInfo.getTableName()}`);
//         } else {
//             this._currentTableInfo = tableInfo;
//         }
//         return Promise.resolve();
//     }

//     async setTags(paramsArray: StmtBindParams): Promise<void> {
//         if (!paramsArray || !this._stmt_id) {
//             throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "SetBinaryTags paramArray is invalid!");
//         }
//         for (let i = 0; i < paramsArray.getParams().length; i++) {
//             let param = paramsArray.getParams()[i];
//             console.log(`Tag param[${i}]: ${JSONBig.stringify(param.data)}`);
//         }
//         if (!this._currentTableInfo) {
//             this._currentTableInfo = new TableInfo();
//             this._stmtTableInfoList.push(this._currentTableInfo);
//         }
//         await this._currentTableInfo.setTags(paramsArray);
//         console.log(`Set tags for table: ${this._currentTableInfo.getTableName()}, tags: ${JSONBig.stringify(paramsArray.getParams())}`);
//         return Promise.resolve();
//     }

//     newStmtParam(): StmtBindParams {
//        return new StmtBindParams(this._precision);
//     }

//     async bind(paramsArray: StmtBindParams): Promise<void> {
//         if (!paramsArray || !this._stmt_id) {
//             throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind paramArray is invalid!");
//         }
//         if (!this._currentTableInfo) {
//             this._currentTableInfo = new TableInfo();
//             this._stmtTableInfoList.push(this._currentTableInfo);
//         }
//         await this._currentTableInfo.setParams(paramsArray);
//         return Promise.resolve();
//     }

//     async batch(): Promise<void> {
//         Promise.resolve();
//     }

//     async exec(): Promise<void> {
//         if (!this._currentTableInfo || this._currentTableInfo.getParams.length === 0) {
//             throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind params is empty!");
//         }
//         let reqId = BigInt(ReqId.getReqID());
//         for (let tableInfo of this._stmtTableInfoList) {
//             console.log(`tableInfo: ${tableInfo.getParams()}, tags: ${tableInfo.getTags()}`);
//         }

//     }
//     getLastAffected(): number | null | undefined {
//         throw new Error("Method not implemented.");
//     }
//     async close(): Promise<void> {
//         throw new Error("Method not implemented.");
//     }

//     private async execute(queryMsg: StmtMessageInfo, register: Boolean = true): Promise<void> {
//         try {
//             if (this._wsClient.getState() <= 0) {
//                 throw new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "websocket connect has closed!");
//             }
//             let reqMsg = JSONBig.stringify(queryMsg);
//             if (register) {
//                 let result = await this._wsClient.exec(reqMsg, false);
//                 let resp = new WsStmtQueryResponse(result)
//                 if (resp.stmt_id) {
//                     this._stmt_id = resp.stmt_id;
//                 }

//                 if (resp.affected) {
//                     this.lastAffected = resp.affected
//                 } 

//                 if (resp.fields) {
//                     this.fields = resp.fields;
//                     console.log(`Fields: ${JSONBig.stringify(resp.fields)}`);
//                 }
//             }else{
//                 await this._wsClient.execNoResp(reqMsg);
//                 this._stmt_id = null
//                 this.lastAffected = null
//             }
//             return
//         } catch (e:any) {
//             throw new TaosResultError(e.code, e.message);
//         }
//     }

//     private binaryBlockEncode() {
//         // cloc totol size
//         let totalTableNameSize  = 0;
//         let tableNameSizeList:Array<number> = [];
//         if (this._toBeBindTableNameIndex && this._toBeBindTableNameIndex > 0) {
//             this._stmtTableInfo.forEach((tableInfo) => {
//                 let tableName = tableInfo.getTableName();
//                 if (tableName) {
//                     let size = new TextEncoder().encode(tableName).length;
//                     totalTableNameSize += size;
//                     tableNameSizeList.push(size);
//                 } else {
//                     throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
//                 }
//             });
//         }

//         let totalTagSize = 0;
//         let tagSizeList:Array<number> = [];
//         if (this._toBeBindColCount > 0) {
//             this._stmtTableInfoList.forEach((tableInfo) => {
//                 let params = tableInfo.getTags();
//                 if (params) {
//                     let tagSize = params.getDataTotalLen();
//                     totalTagSize += tagSize;
//                     tagSizeList.push(tagSize);
//                 }
//             });
//         }
//         let totalColSize = 0;
//         let colSizeList:Array<number> = [];
//         if (this._toBeBindColCount > 0) {
//             this._stmtTableInfoList.forEach((tableInfo) => {
//                 let params = tableInfo.getParams();
//                 if (!params || params.length === 0) {
//                     throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind params is empty!");
//                 }

//                 params.forEach((param) => {
//                     let colSize = param.getDataTotalLen();
//                     totalColSize += colSize;
//                     colSizeList.push(colSize);
//                 });
                
//             });
//         }


//         let totalSize = totalTableNameSize + totalTagSize + totalColSize;
//         let toBeBindTableNameCount = (this._toBeBindTableNameIndex != null && this._toBeBindTableNameIndex >= 0) ? 1 : 0;
//          totalSize += this._stmtTableInfoList.length * (
//                 toBeBindTableNameCount * 2
//                 + (this._toBeBindTagCount > 0 ? 1 : 0) * 4
//                 + (this._toBeBindColCount > 0 ? 1 : 0) * 4);
        
        
//         const bytes: number[] = [];



//         // 写入 req_id
//         bytes.push(...bigintToBytes(BigInt(ReqId.getReqID())));

//         // 写入 stmt_id
//         if (this._stmt_id) {
//             bytes.push(...bigintToBytes(this._stmt_id));
//         }

//         bytes.push(...bigintToBytes(9n));
//         bytes.push(...shotToBytes(1));
//         bytes.push(...intToBytes(-1));
//         bytes.push(...intToBytes(totalSize + 28, false));
//         bytes.push(...intToBytes(this._stmtTableInfoList.length));
//         bytes.push(...intToBytes(this._toBeBindTagCount));
//         bytes.push(...intToBytes(this._toBeBindColCount));
//         if (toBeBindTableNameCount > 0) {
//             bytes.push(...intToBytes(0x1C));
//         } else {
//             bytes.push(...intToBytes(0));
//         }

//         if (this._toBeBindTagCount) {
//             if (toBeBindTableNameCount > 0) {
//                 bytes.push(...intToBytes(28 + totalTableNameSize * 2 * this._stmtTableInfoList.length));
//             } else {
//                 bytes.push(...intToBytes(28));
//             }
//         } else {
//             bytes.push(...intToBytes(0));
//         }
        
//         if (toBeBindTableNameCount > 0) {
//             for (let size of tableNameSizeList) {
//                 if (size === 0) {
//                     throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
//                 }
//                 bytes.push(...shotToBytes(size));
//             }
//             for (let tableInfo of this._stmtTableInfoList) {
//                 let tableName = tableInfo.getTableName();
//                 if (tableName && tableName.length > 0) {
//                     let encoder = new TextEncoder().encode(tableName);
//                     bytes.push(...encoder);
//                     bytes.push(0); // null terminator
//                 } else {
//                     throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
//                 }
//             }
//         }

//         if (this._toBeBindTagCount > 0) {
//             for (let size of tagSizeList) {
//                 bytes.push(...shotToBytes(size));
//             }

//             for (let tableInfo of this._stmtTableInfoList) {
//                 let tags = tableInfo.getTags();
//                 if (tags && tags.getParams().length > 0) {
//                     for (let tagColumnInfo of tags.getParams()) {
//                         let isVarType = _isVarType(tagColumnInfo.type)
//                         if (isVarType == ColumnsBlockType.SOLID) {
//                             if (tagColumnInfo.data === null || tagColumnInfo.data === undefined) {
//                                 throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Tag value is null");
//                             }
                            
//                             bytes.push(...tag.getData());
//                         }
//                     }
//                 } else {
//                     throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Tags are empty");
//                 }
//             }
//         }
//             // // TagsDataLength
//             // if (toBebindTagCount > 0) {
//             //     for (Integer tagsize : tagSizeList) {
//             //         buf.writeIntLE(tagsize);
//             //     }

//             //     for (TableInfo tableInfo : tableInfoMap.values()) {
//             //         for (ColumnInfo tag : tableInfo.getTagInfo()) {
//             //             if (tag.getDataList().isEmpty()) {
//             //                 throw TSDBError.createSQLException(TSDBErrorNumbers.ERROR_INVALID_VARIABLE, "tag value is null, tbname: " + tableInfo.getTableName().toString());
//             //             }
//             //             serializeColumn(tag, buf, precision);
//             //         }
//             //     }
//             // }

//     }
        
//     private serializeColumn(column: ColumnInfo, bytes: number[], precision: number) {
//         let isVarType = _isVarType(column.type)
//         if (isVarType == ColumnsBlockType.SOLID) {
//             if (column.data === null || column.data === undefined) {
//                 throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind value is null");
//             }
//             // TotalLength(4) + Type (4) + Num(4) + IsNull(1) * size + haveLength(1) + BufferLength(4) + size * dataLen
//             let dataLen = 17 + (dataLen + 1) * 
//             bytes.push(...column.getData());
//         } else if (isVarType == ColumnsBlockType.VAR) {
//             let dataList = column.getDataList();
//             if (!dataList || dataList.length === 0) {
//                 throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind value is null");
//             }
//             dataList.forEach((data) => {
//                 if (data === null || data === undefined) {
//                     bytes.push(...intToBytes(-1));
//                 } else {
//                     let encoder = new TextEncoder().encode(data);
//                     bytes.push(...intToBytes(encoder.length));
//                     bytes.push(...encoder);
//                 }
//             });
//         } else if (isVarType == ColumnsBlockType.TIME) {
//             if (column.data === null || column.data === undefined) {
//                 throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind value is null");
//             }
//             let timeValue = BigInt(column.data);
//             if (precision < 9) {
//                 let factor = BigInt(10 ** (9 - precision));
//                 timeValue = timeValue * factor;
//             } else if (precision > 9) {
//                 let factor = BigInt(10 ** (precision - 9));
//                 timeValue = timeValue / factor;
//             }
//             bytes.push(...bigintToBytes(timeValue));
//         } else {
//             throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, `Unsupported column type: ${column.type}`);
//         }
//     }
// }