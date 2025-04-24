export interface IndexableString {
    [index: number]: string;
}
export interface StringIndexable {
    [index: string]: number;
}
export declare const BinaryQueryMessage: bigint;
export declare const FetchRawBlockMessage: bigint;
export declare const TDengineTypeName: IndexableString;
export declare const ColumnsBlockType: StringIndexable;
export declare enum TDengineTypeCode {
    NULL = 0,
    BOOL = 1,
    TINYINT = 2,
    SMALLINT = 3,
    INT = 4,
    BIGINT = 5,
    FLOAT = 6,
    DOUBLE = 7,
    BINARY = 8,
    VARCHAR = 8,
    TIMESTAMP = 9,
    NCHAR = 10,
    TINYINT_UNSIGNED = 11,
    SMALLINT_UNSIGNED = 12,
    INT_UNSIGNED = 13,
    BIGINT_UNSIGNED = 14,
    JSON = 15,
    VARBINARY = 16,
    GEOMETRY = 20
}
export declare const TDenginePrecision: IndexableString;
export declare const TDengineTypeLength: StringIndexable;
export declare const PrecisionLength: StringIndexable;
//# sourceMappingURL=constant.d.ts.map