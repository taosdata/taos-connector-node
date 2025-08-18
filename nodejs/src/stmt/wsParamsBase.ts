import { TDengineTypeCode, TDengineTypeLength, TDengineTypeName, PrecisionLength } from "../common/constant";
import { bitmapLen } from "../common/taosResult";
import { ErrorCode, TaosError } from "../common/wsError";
import { ColumnInfo } from "./wsColumnInfo";


export interface IDataEncoder {
    encode(params: any[], dataType: string, typeLen: number, columnType: number): ColumnInfo;
}

export abstract class StmtBindParams {
    protected readonly precisionLength:number = PrecisionLength['ms']
    protected readonly _params: ColumnInfo[];
    protected _dataTotalLen:number = 0;
    protected _rows = 0;

    constructor(precision?:number) {
        if (precision) {
            this.precisionLength = precision
        }
        this._params = [];
    }



    abstract encode(params: any[], dataType: string, typeLen: number, columnType: number): ColumnInfo;

    getDataRows(): number {
        return this._rows;
    }
    
    getDataTotalLen(): number {
        return this._dataTotalLen;
    }


    public getParams(): ColumnInfo[] {
        return this._params;
    }

    setBoolean(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetBooleanColumn params is invalid!");
        }
        let columnInfo = this.encode(params, "boolean", TDengineTypeLength['BOOL'], TDengineTypeCode.BOOL);
        this._params.push(columnInfo);
    }

    setTinyInt(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetTinyIntColumn params is invalid!");
        }
        let columnInfo = this.encode(params, "number", TDengineTypeLength['TINYINT'], TDengineTypeCode.TINYINT)
        this._params.push(columnInfo);
    }

    setUTinyInt(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUTinyIntColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "number", TDengineTypeLength['TINYINT UNSIGNED'], TDengineTypeCode.TINYINT_UNSIGNED)
        this._params.push(columnInfo);
    }

    setSmallInt(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetSmallIntColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "number", TDengineTypeLength['SMALLINT'], TDengineTypeCode.SMALLINT)
        this._params.push(columnInfo);

    }

    setUSmallInt(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetSmallIntColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "number", TDengineTypeLength['SMALLINT UNSIGNED'], TDengineTypeCode.SMALLINT_UNSIGNED)
        this._params.push(columnInfo);
    }

    setInt(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetIntColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "number", TDengineTypeLength['INT'], TDengineTypeCode.INT)
        this._params.push(columnInfo);
    }

    setUInt(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUIntColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "number", TDengineTypeLength['INT UNSIGNED'], TDengineTypeCode.INT_UNSIGNED)
        this._params.push(columnInfo);
    }

    setBigint(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetBigIntColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "bigint", TDengineTypeLength['BIGINT'], TDengineTypeCode.BIGINT)
        this._params.push(columnInfo);
    }

    setUBigint(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUBigIntColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "bigint", TDengineTypeLength['BIGINT UNSIGNED'], TDengineTypeCode.BIGINT_UNSIGNED)
        this._params.push(columnInfo); 
    }

    setFloat(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetFloatColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "number", TDengineTypeLength['FLOAT'], TDengineTypeCode.FLOAT)
        this._params.push(columnInfo); 
    }

    setDouble(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetDoubleColumn params is invalid!");
        }      
        let columnInfo = this.encode(params, "number", TDengineTypeLength['DOUBLE'], TDengineTypeCode.DOUBLE)
        this._params.push(columnInfo); 
    }

    setVarchar(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetVarcharColumn params is invalid!");
        }
        let columnInfo = this.encode(params, TDengineTypeName[8], 0, TDengineTypeCode.VARCHAR);
        this._params.push(columnInfo);
    }

    setBinary(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetBinaryColumn params is invalid!");
        }
        let columnInfo = this.encode(params, TDengineTypeName[8], 0, TDengineTypeCode.BINARY);
        this._params.push(columnInfo);
    }

    setNchar(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetNcharColumn params is invalid!");
        }
        let columnInfo = this.encode(params, TDengineTypeName[10], 0, TDengineTypeCode.NCHAR);
        this._params.push(columnInfo);
    }

    setJson(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetJsonColumn params is invalid!");
        }
        let columnInfo = this.encode(params, TDengineTypeName[15], 0, TDengineTypeCode.JSON);
        this._params.push(columnInfo);
    }

    setVarBinary(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetVarBinaryColumn params is invalid!");
        }
        let columnInfo = this.encode(params, TDengineTypeName[16], 0, TDengineTypeCode.VARBINARY);
        this._params.push(columnInfo);
    }

    setGeometry(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetGeometryColumn params is invalid!");
        }
        let columnInfo = this.encode(params, TDengineTypeName[16], 0, TDengineTypeCode.GEOMETRY);
        this._params.push(columnInfo);
    }

    setTimestamp(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params is invalid!");
        } 
        let columnInfo = this.encode(params, TDengineTypeName[9], TDengineTypeLength['TIMESTAMP'], TDengineTypeCode.TIMESTAMP);
        this._params.push(columnInfo);
    }

    protected writeDataToBuffer(dataBuffer: DataView, params: any, dataType: string = 'number', typeLen: number, columnType: number, i:number): void {
        if (typeof params == dataType) {
            switch (columnType) {
                case TDengineTypeCode.BOOL: {
                    if (params) {
                        dataBuffer.setInt8(i, 1);
                    } else {
                        dataBuffer.setInt8(i, 0);
                    }
                    break;
                }
                case TDengineTypeCode.TINYINT: {
                    dataBuffer.setInt8(i, params);
                    break;
                }
                case TDengineTypeCode.TINYINT_UNSIGNED: {
                    dataBuffer.setUint8(i, params);
                    break;
                }
                case TDengineTypeCode.SMALLINT: {
                    dataBuffer.setInt16(i * 2, params, true);
                    break;
                }
                case TDengineTypeCode.SMALLINT_UNSIGNED: {
                    dataBuffer.setUint16(i * 2, params, true);
                    break;
                }

                case TDengineTypeCode.INT: {
                    dataBuffer.setInt32(i * 4, params, true);
                    break;
                }

                case TDengineTypeCode.INT_UNSIGNED: {
                    dataBuffer.setUint32(i * 4, params, true);
                    break;
                }

                case TDengineTypeCode.BIGINT: {
                    dataBuffer.setBigInt64(i * 8, params, true);
                    break;
                }

                case TDengineTypeCode.BIGINT_UNSIGNED: {
                    dataBuffer.setBigUint64(i * 8, params, true);
                    break;
                }

                case TDengineTypeCode.FLOAT: {
                    dataBuffer.setFloat32(i * 4, params, true);
                    break;
                }
                case TDengineTypeCode.DOUBLE: {
                    dataBuffer.setFloat64(i * 8, params, true);
                    break;
                }
                default: {
                    throw new TaosError(ErrorCode.ERR_UNSUPPORTED_TDENGINE_TYPE, "unsupported type for column" + columnType)
                }
            }

        } else {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetTinyIntColumn params is invalid! param:=" + params[i])
        }
    }

}