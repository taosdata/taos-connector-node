"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrecisionLength = exports.TDengineTypeLength = exports.TDenginePrecision = exports.TDengineTypeCode = exports.ColumnsBlockType = exports.TDengineTypeName = exports.FetchRawBlockMessage = exports.BinaryQueryMessage = void 0;
exports.BinaryQueryMessage = BigInt(6);
exports.FetchRawBlockMessage = BigInt(7);
exports.TDengineTypeName = {
    0: 'NULL',
    1: 'BOOL',
    2: 'TINYINT',
    3: 'SMALLINT',
    4: 'INT',
    5: 'BIGINT',
    6: 'FLOAT',
    7: 'DOUBLE',
    8: 'VARCHAR',
    9: 'TIMESTAMP',
    10: 'NCHAR',
    11: 'TINYINT UNSIGNED',
    12: 'SMALLINT UNSIGNED',
    13: 'INT UNSIGNED',
    14: 'BIGINT UNSIGNED',
    15: 'JSON',
    16: 'VARBINARY',
    20: 'GEOMETRY',
};
exports.ColumnsBlockType = {
    'SOLID': 0,
    'VARCHAR': 1,
    'NCHAR': 2,
    'GEOMETRY': 3,
    'VARBINARY': 4,
};
var TDengineTypeCode;
(function (TDengineTypeCode) {
    TDengineTypeCode[TDengineTypeCode["NULL"] = 0] = "NULL";
    TDengineTypeCode[TDengineTypeCode["BOOL"] = 1] = "BOOL";
    TDengineTypeCode[TDengineTypeCode["TINYINT"] = 2] = "TINYINT";
    TDengineTypeCode[TDengineTypeCode["SMALLINT"] = 3] = "SMALLINT";
    TDengineTypeCode[TDengineTypeCode["INT"] = 4] = "INT";
    TDengineTypeCode[TDengineTypeCode["BIGINT"] = 5] = "BIGINT";
    TDengineTypeCode[TDengineTypeCode["FLOAT"] = 6] = "FLOAT";
    TDengineTypeCode[TDengineTypeCode["DOUBLE"] = 7] = "DOUBLE";
    TDengineTypeCode[TDengineTypeCode["BINARY"] = 8] = "BINARY";
    TDengineTypeCode[TDengineTypeCode["VARCHAR"] = 8] = "VARCHAR";
    TDengineTypeCode[TDengineTypeCode["TIMESTAMP"] = 9] = "TIMESTAMP";
    TDengineTypeCode[TDengineTypeCode["NCHAR"] = 10] = "NCHAR";
    TDengineTypeCode[TDengineTypeCode["TINYINT_UNSIGNED"] = 11] = "TINYINT_UNSIGNED";
    TDengineTypeCode[TDengineTypeCode["SMALLINT_UNSIGNED"] = 12] = "SMALLINT_UNSIGNED";
    TDengineTypeCode[TDengineTypeCode["INT_UNSIGNED"] = 13] = "INT_UNSIGNED";
    TDengineTypeCode[TDengineTypeCode["BIGINT_UNSIGNED"] = 14] = "BIGINT_UNSIGNED";
    TDengineTypeCode[TDengineTypeCode["JSON"] = 15] = "JSON";
    TDengineTypeCode[TDengineTypeCode["VARBINARY"] = 16] = "VARBINARY";
    TDengineTypeCode[TDengineTypeCode["GEOMETRY"] = 20] = "GEOMETRY";
})(TDengineTypeCode || (exports.TDengineTypeCode = TDengineTypeCode = {}));
exports.TDenginePrecision = {
    0: 'MILLISECOND',
    1: "MICROSECOND",
    2: "NANOSECOND",
};
exports.TDengineTypeLength = {
    'BOOL': 1,
    'TINYINT': 1,
    'SMALLINT': 2,
    'INT': 4,
    'BIGINT': 8,
    'FLOAT': 4,
    'DOUBLE': 8,
    'TIMESTAMP': 8,
    'TINYINT UNSIGNED': 1,
    'SMALLINT UNSIGNED': 2,
    'INT UNSIGNED': 4,
    'BIGINT UNSIGNED': 8,
};
exports.PrecisionLength = {
    'ms': 13,
    'us': 16,
    'ns': 19
};
