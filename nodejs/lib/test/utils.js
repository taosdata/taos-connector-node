"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sleep = exports.compareUint8Arrays = exports.hexToBytes = exports.expectStableData = exports.createTable = exports.createSTableJSON = exports.createSTable = exports.createBaseTable = exports.createBaseSTableJSON = exports.createBaseSTable = exports.tagMeta = exports.jsonMeta = exports.tableMeta = exports.insertNTable = exports.insertStable = exports.getInsertBind = void 0;
const log_1 = __importDefault(require("../src/common/log"));
function getInsertBind(valuesLen, tagsLen, db, stable) {
    let sql = `insert into ? using ${db}.${stable} tags ( ?`;
    for (let i = 1; i < tagsLen; i++) {
        sql += ', ?';
    }
    sql += ') values( ?';
    for (let i = 1; i < valuesLen; i++) {
        sql += ', ?';
    }
    sql += ')';
    return sql;
}
exports.getInsertBind = getInsertBind;
function insertStable(values, tags, stable, table = 'empty') {
    let childTable = table == 'empty' ? stable + '_s_01' : table;
    let sql = `insert into ${childTable} using ${stable} tags (`;
    tags.forEach((tag) => {
        if ((typeof tag) == 'string') {
            if (tag == 'NULL') {
                sql += tag + ',';
            }
            else {
                sql += `\'${tag}\',`;
            }
        }
        else {
            sql += tag;
            sql += ',';
        }
    });
    sql = sql.slice(0, sql.length - 1);
    sql += ')';
    sql += 'values';
    values.forEach(value => {
        sql += '(';
        value.forEach(v => {
            if ((typeof v) == 'string') {
                sql += `\'${v}\',`;
            }
            else {
                sql += v;
                sql += ',';
            }
        });
        sql = sql.slice(0, sql.length - 1);
        sql += ')';
    });
    return sql;
}
exports.insertStable = insertStable;
function insertNTable(values, table) {
    let sql = `insert into ${table} values `;
    values.forEach(value => {
        sql += '(';
        value.forEach(v => {
            if ((typeof v) == 'string') {
                if (v == 'NULL') {
                    sql += v + ',';
                }
                else {
                    sql += `\'${v}\',`;
                }
            }
            else {
                sql += v;
                sql += ',';
            }
        });
        sql = sql.slice(0, sql.length - 1);
        sql += ')';
    });
    return sql;
}
exports.insertNTable = insertNTable;
exports.tableMeta = [
    {
        name: 'ts',
        type: 'TIMESTAMP',
        length: 8
    },
    {
        name: 'i1',
        type: 'TINYINT',
        length: 1
    },
    {
        name: 'i2',
        type: 'SMALLINT',
        length: 2
    },
    {
        name: 'i4',
        type: 'INT',
        length: 4
    },
    {
        name: 'i8',
        type: 'BIGINT',
        length: 8
    },
    {
        name: 'u1',
        type: 'TINYINT UNSIGNED',
        length: 1
    },
    {
        name: 'u2',
        type: 'SMALLINT UNSIGNED',
        length: 2
    },
    {
        name: 'u4',
        type: 'INT UNSIGNED',
        length: 4
    },
    {
        name: 'u8',
        type: 'BIGINT UNSIGNED',
        length: 8
    },
    {
        name: 'f4',
        type: 'FLOAT',
        length: 4
    },
    {
        name: 'd8',
        type: 'DOUBLE',
        length: 8
    },
    {
        name: 'bnr',
        type: 'VARCHAR',
        length: 200
    },
    {
        name: 'nchr',
        type: 'NCHAR',
        length: 200
    },
    {
        name: 'b',
        type: 'BOOL',
        length: 1
    },
    {
        name: 'nilcol',
        type: 'INT',
        length: 4
    },
    {
        name: 'geo',
        type: 'GEOMETRY',
        length: 512
    },
    {
        name: 'vbinary',
        type: 'VARBINARY',
        length: 32
    },
];
exports.jsonMeta = [
    {
        name: 'json_tag',
        type: 'JSON',
        length: 4095
    },
];
exports.tagMeta = [
    {
        name: 'tb',
        type: 'BOOL',
        length: 1
    },
    {
        name: 'ti1',
        type: 'TINYINT',
        length: 1
    },
    {
        name: 'ti2',
        type: 'SMALLINT',
        length: 2
    },
    {
        name: 'ti4',
        type: 'INT',
        length: 4
    },
    {
        name: 'ti8',
        type: 'BIGINT',
        length: 8
    },
    {
        name: 'tu1',
        type: 'TINYINT UNSIGNED',
        length: 1
    },
    {
        name: 'tu2',
        type: 'SMALLINT UNSIGNED',
        length: 2
    },
    {
        name: 'tu4',
        type: 'INT UNSIGNED',
        length: 4
    },
    {
        name: 'tu8',
        type: 'BIGINT UNSIGNED',
        length: 8
    },
    {
        name: 'tf4',
        type: 'FLOAT',
        length: 4
    },
    {
        name: 'td8',
        type: 'DOUBLE',
        length: 8
    },
    {
        name: 'tbnr',
        type: 'VARCHAR',
        length: 200
    },
    {
        name: 'tnchr',
        type: 'NCHAR',
        length: 200
    },
];
function createBaseSTable(stable) {
    return `create table if not exists ${stable}( ts timestamp,i1 tinyint,i2 smallint,i4 int,i8 bigint,u1 tinyint unsigned,u2 smallint unsigned,u4 int unsigned,u8 bigint unsigned,f4 float,d8 double,bnr binary(200),nchr nchar(200),b bool,nilcol int, g1 geometry(512), c4 varbinary(100))` +
        'tags( tb bool,ti1 tinyint,ti2 smallint,ti4 int,ti8 bigint,tu1 tinyint unsigned,tu2 smallint unsigned,tu4 int unsigned,tu8 bigint unsigned,tf4 float,td8 double,tbnr binary(200),tnchr nchar(200));';
}
exports.createBaseSTable = createBaseSTable;
function createBaseSTableJSON(stable) {
    return `create table if not exists ${stable}(ts timestamp,i1 tinyint,i2 smallint,i4 int,i8 bigint,u1 tinyint unsigned,u2 smallint unsigned,u4 int unsigned,u8 bigint unsigned,f4 float,d8 double,bnr binary(200),nchr nchar(200),b bool,nilcol int)` +
        'tags(json_tag json);';
}
exports.createBaseSTableJSON = createBaseSTableJSON;
function createBaseTable(table) {
    return `create table if not exists ${table}(ts timestamp,i1 tinyint,i2 smallint,i4 int,i8 bigint,u1 tinyint unsigned,u2 smallint unsigned,u4 int unsigned,u8 bigint unsigned,f4 float,d8 double,bnr binary(200),nchr nchar(200),b bool,nilcol int)`;
}
exports.createBaseTable = createBaseTable;
function createSTable(stable) {
    return `create table if not exists ${stable}( ts timestamp,i1 tinyint,i2 smallint,i4 int,i8 bigint,u1 tinyint unsigned,u2 smallint unsigned,u4 int unsigned,u8 bigint unsigned,f4 float,d8 double,bnr binary(200),nchr nchar(200),b bool,nilcol int, geo geometry(512), vbinary varbinary(32))` +
        'tags( tb bool,ti1 tinyint,ti2 smallint,ti4 int,ti8 bigint,tu1 tinyint unsigned,tu2 smallint unsigned,tu4 int unsigned,tu8 bigint unsigned,tf4 float,td8 double,tbnr binary(200),tnchr nchar(200));';
}
exports.createSTable = createSTable;
function createSTableJSON(stable) {
    return `create table if not exists ${stable}(ts timestamp,i1 tinyint,i2 smallint,i4 int,i8 bigint,u1 tinyint unsigned,u2 smallint unsigned,u4 int unsigned,u8 bigint unsigned,f4 float,d8 double,bnr binary(200),nchr nchar(200),b bool,nilcol int, geo geometry(512), vbinary varbinary(32))` +
        'tags(json_tag json);';
}
exports.createSTableJSON = createSTableJSON;
function createTable(table) {
    return `create table if not exists ${table}(ts timestamp,i1 tinyint,i2 smallint,i4 int,i8 bigint,u1 tinyint unsigned,u2 smallint unsigned,u4 int unsigned,u8 bigint unsigned,f4 float,d8 double,bnr binary(200),nchr nchar(200),b bool,nilcol int, geo geometry(512), vbinary varbinary(32))`;
}
exports.createTable = createTable;
function expectStableData(rows, tags) {
    let resArr = [];
    rows.forEach((row, index, rows) => {
        resArr.push(row.concat(tags));
    });
    return resArr;
}
exports.expectStableData = expectStableData;
function hexToBytes(hex) {
    let byteLen = hex.length / 2;
    let a = new Uint8Array(byteLen);
    for (let i = 0, count = 0; i < hex.length; i += 2, count++) {
        let item = parseInt(hex.slice(i, i + 2), 16);
        a[count] = item;
    }
    return a.buffer;
}
exports.hexToBytes = hexToBytes;
// export function createStmtData(varbinary:string = "ab", 
//     geoHex:string = "0101000020E6100000000000000000F03F0000000000000040"):Array<Array<any>> {
//     let multi:any[][] = [
//         [1709183268567, 1709183268568, 1709183268569],
//         [10.2, 10.3, 10.4],
//         [292, 293, 294],
//         [0.32, 0.33, 0.34],
//         ];
//     let res = hexToBytes(geoHex)
//     let geom = Array.from(new Uint8Array(res))
//     multi.push([geom, geom, geom])
//     res = new TextEncoder().encode(varbinary)
//     let binary = Array.from(new Uint8Array(res))
//     multi.push([binary, binary, binary])
//     return multi
// }
function compareUint8Arrays(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        log_1.default.debug(`${arr1.length} !== ${arr2.length}`);
        return false;
    }
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            log_1.default.debug(`${arr1[i]} !== ${arr2[i]}`);
            return false;
        }
    }
    return true;
}
exports.compareUint8Arrays = compareUint8Arrays;
function Sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.Sleep = Sleep;
