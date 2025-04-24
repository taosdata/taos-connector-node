export declare class ColumnInfo {
    data: ArrayBuffer;
    length: number;
    type: number;
    typeLen: number;
    constructor([length, data]: [number, ArrayBuffer], type: number, typeLen: number);
}
export declare class StmtBindParams {
    private readonly precisionLength;
    private readonly _params;
    private _dataTotalLen;
    private _rows;
    constructor(precision?: number);
    getDataRows(): number;
    getDataTotalLen(): number;
    getParams(): ColumnInfo[];
    setBoolean(params: any[]): void;
    setTinyInt(params: any[]): void;
    setUTinyInt(params: any[]): void;
    setSmallInt(params: any[]): void;
    setUSmallInt(params: any[]): void;
    setInt(params: any[]): void;
    setUInt(params: any[]): void;
    setBigint(params: any[]): void;
    setUBigint(params: any[]): void;
    setFloat(params: any[]): void;
    setDouble(params: any[]): void;
    setVarchar(params: any[]): void;
    setBinary(params: any[]): void;
    setNchar(params: any[]): void;
    setJson(params: any[]): void;
    setVarBinary(params: any[]): void;
    setGeometry(params: any[]): void;
    setTimestamp(params: any[]): void;
    private encodeDigitColumns;
    private encodeVarLengthColumn;
    private getBinaryColumnArrayBuffer;
    private encodeNcharColumn;
    private countBigintDigits;
}
//# sourceMappingURL=wsParams.d.ts.map