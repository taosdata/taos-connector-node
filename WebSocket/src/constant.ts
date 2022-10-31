interface IndexableString {
    [index: number]: string
}

interface StringIndexable {
    [index: string]: number
}

export const TDengineTypeName: IndexableString = {
    0: 'NULL',
    1: 'BOOLEAN',
    2: 'TINY INT',
    3: 'SMALL INT',
    4: 'INT',
    5: 'BIG INT',
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
}

export const ColumnsBlockType: StringIndexable = {
    'SOLID': 0,
    'VARCHAR': 1,
    'NCHAR': 2
}


export const TDengineTypeCode: StringIndexable = {
    'NULL': 0,
    'BOOLEAN': 1,
    'TINY INT': 2,
    'SMALL INT': 3,
    'INT': 4,
    'BIGINT': 5,
    'FLOAT': 6,
    'DOUBLE': 7,
    'BINARY': 8,
    'VARCHAR': 8,
    'TIMESTAMP': 9,
    'NCHAR': 10,
    'TINYINT UNSIGNED': 11,
    'SMALLINT UNSIGNED': 12,
    'INT UNSIGNED': 13,
    'BIGINT UNSIGNED': 14,
    'JSON': 15,
}

export const TDenginePrecision: IndexableString = {
    0: 'MILLISECOND',
    1: "MICROSECOND",
    2: "NANOSECOND",
}
