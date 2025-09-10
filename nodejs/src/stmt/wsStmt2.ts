import JSONBig from 'json-bigint';
import { WsClient } from "../client/wsClient";
import { ColumnsBlockType, FieldBindType, PrecisionLength } from "../common/constant";
import logger from "../common/log";
import { ReqId } from "../common/reqid";
import { ErrorCode, TaosResultError, TDWebSocketClientError } from "../common/wsError";
import { StmtBindParams } from "./wsParamsBase";
import { StmtFieldInfo, StmtMessageInfo, WsStmtQueryResponse } from "./wsProto";
import { WsStmt } from "./wsStmt";
import { _isVarType } from '../common/taosResult';
import { bigintToBytes, intToBytes, shotToBytes } from '../common/utils';
import { Stmt2BindParams } from './wsParams2';
import { TableInfo } from './wsTableInfo';
import { ColumnInfo } from './wsColumnInfo';
import { WSRows } from '../sql/wsRows';



export class WsStmt2 implements WsStmt{
    private _wsClient: WsClient;
    private _stmt_id: bigint | undefined | null;
    private _query_id: bigint | undefined | null;
    private _precision:number = PrecisionLength['ms'];
    private fields?: Array<StmtFieldInfo> | undefined | null;
    private lastAffected: number | undefined | null;
    private _stmtTableInfo: Map<string, TableInfo>;
    private _currentTableInfo: TableInfo;
    private _stmtTableInfoList: TableInfo[];
    private _toBeBindTagCount: number;
    private _toBeBindColCount: number;
    private _toBeBindTableNameIndex: number | undefined | null;

    private constructor(wsClient: WsClient, precision?:number) {
        this._wsClient = wsClient;
        if (precision) {
            this._precision = precision;
        }
        this._stmtTableInfo = new Map<string, TableInfo>();
        this._currentTableInfo = new TableInfo();
        this._stmtTableInfoList = [];
        this._toBeBindColCount = 0;
        this._toBeBindTagCount = 0;
    }
    
    static async newStmt(wsClient: WsClient, precision?:number, reqId?:number): Promise<WsStmt> {
        try {
            let wsStmt = new WsStmt2(wsClient, precision)
            return await wsStmt.init(reqId);
        } catch(e: any) {
            logger.error(`WsStmt init is failed, ${e.code}, ${e.message}`);
            throw(e);
        }

    }

    private async init(reqId: number | undefined): Promise<WsStmt2> {
        if (this._wsClient) {   
        try {
            if (this._wsClient.getState() <= 0) {
                await this._wsClient.connect();
                await this._wsClient.checkVersion();
            }
            let queryMsg = {
                action: 'stmt2_init',
                args: {
                    req_id: ReqId.getReqID(reqId),
                    single_stb_insert: true,
                    single_table_bind_once: true
                },
            };
            await this.execute(queryMsg);
            return this;  
        } catch (e: any) {
            logger.error(`stmt init filed, ${e.code}, ${e.message}`);
            throw(e);
        }   
    
        }
        throw(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed"));        
    }

    async prepare(sql: string): Promise<void> {
        let queryMsg = {
            action: 'stmt2_prepare',
            args: {
                req_id: ReqId.getReqID(),
                sql: sql,
                stmt_id: this._stmt_id,
                get_fields: true,
            },
        };
        await this.execute(queryMsg);
        if (this.fields && this.fields[0].precision) {
            this._precision = this.fields[0].precision;
        }

        this._toBeBindColCount = 0;
        this._toBeBindTagCount = 0;
        this.fields?.forEach((field, index) => {
         if (field.bind_type == FieldBindType.TAOS_FIELD_TBNAME) {
            this._toBeBindTableNameIndex = index;
         } else if (field.bind_type == FieldBindType.TAOS_FIELD_TAG) {
            this._toBeBindTagCount++;
         } else if (field.bind_type == FieldBindType.TAOS_FIELD_COL) {
            this._toBeBindColCount++;
         }
        });

    }

    async setTableName(tableName: string): Promise<void> {
        if (!tableName || tableName.length === 0) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'Table name cannot be empty');
        }
        let tableInfo = this._stmtTableInfo.get(tableName);
        if (!tableInfo) {
            this._currentTableInfo = new TableInfo(tableName);
            this._stmtTableInfo.set(tableName, this._currentTableInfo);
            this._stmtTableInfoList.push(this._currentTableInfo);
        } else {
            this._currentTableInfo = tableInfo;
        }
        return Promise.resolve();
    }

    async setTags(paramsArray: StmtBindParams): Promise<void> {
        if (!paramsArray || !this._stmt_id) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "SetBinaryTags paramArray is invalid!");
        }
        for (let i = 0; i < paramsArray.getParams().length; i++) {
            let param = paramsArray.getParams()[i];
        }

        if (!this._currentTableInfo) {
            this._currentTableInfo = new TableInfo();
            this._stmtTableInfoList.push(this._currentTableInfo);
        }
        await this._currentTableInfo.setTags(paramsArray);
        
        return Promise.resolve();
    }

    newStmtParam(): StmtBindParams {
        if (!this.fields || this.fields.length === 0) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "No columns to bind!");
        }
        console.log(`Creating new Stmt2BindParams with precision: ${this._precision}, field count: ${this.fields.length}`);
        return new Stmt2BindParams(this.fields.length, this._precision);
    }

    async bind(paramsArray: StmtBindParams): Promise<void> {
        if (!paramsArray || !this._stmt_id) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind paramArray is invalid!");
        }
        if (!this._currentTableInfo) {
            this._currentTableInfo = new TableInfo();
            this._stmtTableInfoList.push(this._currentTableInfo);
            console.log(`New table info created for table: ${this._currentTableInfo.getTableName()}`);
        }

        await this._currentTableInfo.setParams(paramsArray);
        return Promise.resolve();
    }

    async batch(): Promise<void> {
        Promise.resolve();
    }

    async exec(): Promise<void> {
        if (!this._currentTableInfo ) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "table info is empty!");
        }

        let params = this._currentTableInfo.getParams();
        if (!params) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind params is empty!");
        }

        let reqId = BigInt(ReqId.getReqID());
        let bytes = this.binaryBlockEncode(reqId)
        await this.sendBinaryMsg(reqId, 'stmt2_bind', new Uint8Array(bytes));

        let execMsg = {
            action: 'stmt2_exec',
            args: {
                req_id: ReqId.getReqID(),
                stmt_id: this._stmt_id,
            },
        };
        await this.execute(execMsg);
    }

    getLastAffected(): number | null | undefined {
        return this.lastAffected;
    }

    async resultSet(): Promise<WSRows> {
        let execMsg = {
            action: 'stmt2_result',
            args: {
                req_id: ReqId.getReqID(),
                stmt_id: this._stmt_id,
            },
        };
        let resp = await this.execute(execMsg);
        if (!resp) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "ResultSet response is empty!");
        }
        return new WSRows(this._wsClient, resp);

    }

    async close(): Promise<void> {
        let queryMsg = {
            action: 'stmt2_close',
            args: {
                req_id: ReqId.getReqID(),
                stmt_id: this._stmt_id,
            },
        };
        await this.execute(queryMsg);
    }

    private async execute(stmtMsg: StmtMessageInfo|ArrayBuffer, register: Boolean = true): Promise<WsStmtQueryResponse|void> {
        try {
            if (this._wsClient.getState() <= 0) {
                throw new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "websocket connect has closed!");
            }

            let reqMsg = JSONBig.stringify(stmtMsg);
            
            if (register) {
                let result = await this._wsClient.exec(reqMsg, false);
                let resp = new WsStmtQueryResponse(result)
                if (resp.stmt_id) {
                    this._stmt_id = resp.stmt_id;
                }

                if (resp.affected) {
                    this.lastAffected = resp.affected
                } 

                if (resp.fields) {
                    this.fields = resp.fields;
                }
                return resp;
            }

            await this._wsClient.execNoResp(reqMsg);
            this._stmt_id = null
            this.lastAffected = null
        } catch (e:any) {
            throw new TaosResultError(e.code, e.message);
        }
    }

    private async sendBinaryMsg(reqId: bigint, action:string, message: ArrayBuffer): Promise<void> {
        if (this._wsClient.getState() <= 0) {
            throw new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "websocket connect has closed!");
        }
        let result = await this._wsClient.sendBinaryMsg(reqId, action, message, false);
        let resp = new WsStmtQueryResponse(result)
        if (resp.stmt_id) {
            this._stmt_id = resp.stmt_id;
        }

        if (resp.affected) {
            this.lastAffected = resp.affected
        } 
    }

    private binaryBlockEncode(reqId: bigint):number[] {
        // cloc totol size
        let totalTableNameSize  = 0;
        let tableNameSizeList:Array<number> = [];
        if (this._toBeBindTableNameIndex != null && this._toBeBindTableNameIndex != undefined) {
            this._stmtTableInfo.forEach((tableInfo) => {
                let tableName = tableInfo.getTableName();
                if (tableName) {
                    let size = new TextEncoder().encode(tableName).length;
                    totalTableNameSize += size + 1;
                    tableNameSizeList.push(size + 1);
                } else {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
                }
            });
        }

        let totalTagSize = 0;
        let tagSizeList:Array<number> = [];
        if (this._toBeBindTagCount > 0) {
            this._stmtTableInfoList.forEach((tableInfo) => {
                let params = tableInfo.getTags();
                if (params) {
                    params.encode();
                    let tagSize = params.getDataTotalLen();
                    totalTagSize += tagSize;
                    tagSizeList.push(tagSize);
                }
            });
        }

        let totalColSize = 0;
        let colSizeList:Array<number> = [];
        if (this._toBeBindColCount > 0) {
            this._stmtTableInfoList.forEach((tableInfo) => {
                let params = tableInfo.getParams();
                if (!params) {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind params is empty!");
                }
                params.encode();
                let colSize = params.getDataTotalLen();
                totalColSize += colSize;
                colSizeList.push(colSize);
                
            });
        }

        let totalSize = totalTableNameSize + totalTagSize + totalColSize;
        let toBeBindTableNameCount = (this._toBeBindTableNameIndex != null && this._toBeBindTableNameIndex >= 0) ? 1 : 0;
        totalSize += this._stmtTableInfoList.length * (
                toBeBindTableNameCount * 2
                + (this._toBeBindTagCount > 0 ? 1 : 0) * 4
                + (this._toBeBindColCount > 0 ? 1 : 0) * 4);

        const bytes: number[] = [];
        // 写入 req_id
        bytes.push(...bigintToBytes(reqId));

        // 写入 stmt_id
        if (this._stmt_id) {
            bytes.push(...bigintToBytes(this._stmt_id));
        }

        bytes.push(...bigintToBytes(9n));
        bytes.push(...shotToBytes(1));
        bytes.push(...intToBytes(-1));
        bytes.push(...intToBytes(totalSize + 28, false));

        bytes.push(...intToBytes(this._stmtTableInfoList.length));
        bytes.push(...intToBytes(this._toBeBindTagCount));
        bytes.push(...intToBytes(this._toBeBindColCount));
        if (toBeBindTableNameCount > 0) {
            bytes.push(...intToBytes(0x1C));
        } else {
            bytes.push(...intToBytes(0));
        }

        if (this._toBeBindTagCount) {
            if (toBeBindTableNameCount > 0) {
                bytes.push(...intToBytes(28 + totalTableNameSize + 2 * this._stmtTableInfoList.length));
            } else {
                bytes.push(...intToBytes(28));
            }
        } else {
            bytes.push(...intToBytes(0));
        }
            
        if (this._toBeBindColCount > 0) {
            let skipSize = 0;
            if (toBeBindTableNameCount > 0) {
                skipSize += totalTableNameSize + 2 * this._stmtTableInfoList.length;
            }

            if (this._toBeBindTagCount > 0) {
                skipSize += totalTagSize + 4 * this._stmtTableInfoList.length;
            }

            // colOffset = 28(固定头) + skipSize
            bytes.push(...intToBytes(28 + skipSize));
        } else {
            bytes.push(...intToBytes(0));
        }


        if (toBeBindTableNameCount > 0) {
            for (let size of tableNameSizeList) {
                if (size === 0) {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
                }
                bytes.push(...shotToBytes(size));
            }

            for (let tableInfo of this._stmtTableInfoList) {
                let tableName = tableInfo.getTableName();
                if (tableName && tableName.length > 0) {
                    let encoder = new TextEncoder().encode(tableName);
                    bytes.push(...encoder);
                    bytes.push(0); // null terminator
                } else {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
                }
            }
        }
        
        if (this._toBeBindTagCount > 0) {
            for (let size of tagSizeList) {
                bytes.push(...intToBytes(size));
            }
            for (let tableInfo of this._stmtTableInfoList) {
                let tags = tableInfo.getTags();
                if (tags && tags.getParams().length > 0) {
                    for (let tagColumnInfo of tags.getParams()) {
                        this.serializeColumn(tagColumnInfo, bytes);
                    }
                } else {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Tags are empty");
                }
            }
        }

        // TagsDataLength
        if (this._toBeBindColCount > 0) {
            for (let colSize of colSizeList) {
                bytes.push(...intToBytes(colSize, false));
            }
            for (let tableInfo of this._stmtTableInfoList) {
                let params = tableInfo.getParams();
                if (!params) {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind params is empty!");
                }
                
                let colColumnInfos:ColumnInfo[] = params.getParams()
                colColumnInfos.forEach(colColumnInfo => {
                    this.serializeColumn(colColumnInfo, bytes);
                });   
            }
        }
        return bytes

    }

    private serializeColumn(column: ColumnInfo, bytes: number[]) {
        bytes.push(...intToBytes(column.length, false));
        bytes.push(...intToBytes(column.type));
        bytes.push(...intToBytes(column._rows));
        bytes.push(...column.isNull ? column.isNull : []);
        bytes.push(column._haveLength);
        
       if (column._haveLength == 1 && column._dataLengths) {
            column._dataLengths.forEach(length => {
               bytes.push(...intToBytes(length));
           });
        }
        bytes.push(...intToBytes(column.data.byteLength, false));
        bytes.push(...column.data.byteLength ? new Uint8Array(column.data) : []);
    }
}