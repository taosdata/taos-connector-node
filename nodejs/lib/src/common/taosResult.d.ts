import { WSFetchBlockResponse, WSQueryResponse } from "../client/wsResponse";
export interface TDengineMeta {
    name: string;
    type: string;
    length: number;
}
interface ResponseMeta {
    name: string;
    type: number;
    length: number;
}
export interface MessageResp {
    totalTime: number;
    msg: any;
}
export declare class TaosResult {
    private _topic?;
    private _meta;
    private _data;
    private _precision;
    protected _affectRows: number | null | undefined;
    private _totalTime;
    /** unit nano seconds */
    private _timing;
    constructor(queryResponse?: WSQueryResponse);
    setPrecision(precision: number): void;
    setRowsAndTime(rows: number, timing?: bigint): void;
    getTopic(): string;
    setTopic(topic?: string): void;
    getMeta(): Array<TDengineMeta> | null;
    setMeta(metaData: ResponseMeta): void;
    getData(): Array<Array<any>> | null;
    setData(value: Array<Array<any>> | null): void;
    getAffectRows(): number | null | undefined;
    getTaosMeta(): Array<ResponseMeta> | null;
    getPrecision(): number | null | undefined;
    getTotalTime(): number;
    addTotalTime(totalTime: number): void;
    setTiming(timing?: bigint): void;
    /**
     * Mapping the WebSocket response type code to TDengine's type name.
     */
    private getTDengineMeta;
}
export declare function parseBlock(blocks: WSFetchBlockResponse, taosResult: TaosResult): TaosResult;
export declare function _isVarType(metaType: number): Number;
export declare function readSolidDataToArray(dataBuffer: DataView, colBlockHead: number, rows: number, metaType: number, bitMapArr: Uint8Array): any[];
export declare function readSolidData(dataBuffer: DataView, colDataHead: number, meta: ResponseMeta): Number | Boolean | BigInt;
export declare function readBinary(dataBuffer: ArrayBuffer, colDataHead: number, length: number): ArrayBuffer;
export declare function readVarchar(dataBuffer: ArrayBuffer, colDataHead: number, length: number, textDecoder: TextDecoder): string;
export declare function readNchar(dataBuffer: ArrayBuffer, colDataHead: number, length: number): string;
export declare function getString(dataBuffer: DataView, colDataHead: number, length: number, textDecoder: TextDecoder): string;
export declare function getCharOffset(n: number): number;
export declare function setBitmapNull(c: number, n: number): number;
export declare function bitmapLen(n: number): number;
export {};
//# sourceMappingURL=taosResult.d.ts.map