export interface IndexableString {
    [index: number]: string
}

export interface StringIndexable {
    [index: string]: number
}

export const BinaryQueryMessage: bigint = BigInt(6);
export const FetchRawBlockMessage: bigint = BigInt(7);

export const TDengineTypeName: IndexableString = {
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
}

export const ColumnsBlockType: StringIndexable = {
    'SOLID': 0,
    'VARCHAR': 1,
    'NCHAR': 2,
    'GEOMETRY': 3,
    'VARBINARY':4,
}


export enum TDengineTypeCode {
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
    DECIMAL = 17,
    GEOMETRY = 20,
    DECIMAL64 = 21,
}

export enum TSDB_OPTION_CONNECTION {
  TSDB_OPTION_CONNECTION_CHARSET,        // charset, Same as the scope supported by the system
  TSDB_OPTION_CONNECTION_TIMEZONE,       // timezone, Same as the scope supported by the system
  TSDB_OPTION_CONNECTION_USER_IP,        // user ip
  TSDB_OPTION_CONNECTION_USER_APP,       // user app
}

export enum TSDB_OPTION_CONNECTION {
  TSDB_OPTION_CONNECTION_CHARSET,        // charset, Same as the scope supported by the system
  TSDB_OPTION_CONNECTION_TIMEZONE,       // timezone, Same as the scope supported by the system
  TSDB_OPTION_CONNECTION_USER_IP,        // user ip
  TSDB_OPTION_CONNECTION_USER_APP,       // user app
}

export const TDenginePrecision: IndexableString = {
    0: 'MILLISECOND',
    1: "MICROSECOND",
    2: "NANOSECOND",
}

export const TDengineTypeLength: StringIndexable = {
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
}

export const PrecisionLength: StringIndexable = {
    'ms': 13,
    'us': 16,
    'ns': 19
}
