import { TDengineMeta } from "../src/common/taosResult";
export declare function getInsertBind(valuesLen: number, tagsLen: number, db: string, stable: string): string;
export declare function insertStable(values: Array<Array<any>>, tags: Array<any>, stable: string, table?: string): string;
export declare function insertNTable(values: Array<Array<any>>, table: string): string;
export declare const tableMeta: Array<TDengineMeta>;
export declare const jsonMeta: Array<TDengineMeta>;
export declare const tagMeta: Array<TDengineMeta>;
export declare function createBaseSTable(stable: string): string;
export declare function createBaseSTableJSON(stable: string): string;
export declare function createBaseTable(table: string): string;
export declare function createSTable(stable: string): string;
export declare function createSTableJSON(stable: string): string;
export declare function createTable(table: string): string;
export declare function expectStableData(rows: Array<Array<any>>, tags: Array<any>): Array<Array<any>>;
export declare function hexToBytes(hex: string): ArrayBuffer;
export declare function compareUint8Arrays(arr1: Uint8Array, arr2: Uint8Array): boolean;
export declare function Sleep(ms: number): Promise<void>;
//# sourceMappingURL=utils.d.ts.map