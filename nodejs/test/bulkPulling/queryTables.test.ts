
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { createSTable, createSTableJSON, createTable, expectStableData, insertNTable, insertStable, jsonMeta, tableMeta, tagMeta } from "../utils";
// const DSN = 'ws://root:taosdata@127.0.0.1:6041/ws'
let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
let conf :WSConfig = new WSConfig(dsn)
const table = 'ws_q_n';
const stable = 'ws_q_s';
const tableCN = 'ws_q_n_cn';
const stableCN = 'ws_q_s_cn';
const db = 'ws_q_db'
const jsonTable = 'ws_q_j';
const jsonTableCN = 'ws_q_j_cn';

const createDB = `create database if not exists ${db} keep 3650`
const dropDB = `drop database if exists ${db}`
const useDB = `use ${db}`

const stableTags = [true, -1, -2, -3, BigInt(-4), 1, 2, 3, BigInt(4), parseFloat(3.1415.toFixed(5)), parseFloat(3.14159265.toFixed(15)), 'varchar_tag_1', 'nchar_tag_1']
const stableCNTags = [false, -1 * 2, -2 * 2, -3 * 2, BigInt(-4 * 2), 1 * 2, 2 * 2, 3 * 2, BigInt(4 * 2), parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.14159265 * 2).toFixed(15)), 'varchar_标签_壹', 'nchar_标签_贰']

const tableValues = [
    [BigInt(1656677710000), 0, -1, -2, BigInt(-3), 0, 1, 2, BigInt(3),  parseFloat(3.1415.toFixed(5)), parseFloat(3.14159265.toFixed(15)), 'varchar_col_1', 'nchar_col_1', true, 'NULL'             , 'POINT (4.0 8.0)', '0x7661726332'],
    [BigInt(1656677720000), -1, -2, -3, BigInt(-4), 1, 2, 3, BigInt(4), parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.14159265 * 2).toFixed(15)), 'varchar_col_2', 'nchar_col_2', false, 'NULL', 'POINT (3.0 5.0)', '0x7661726333'],
    [BigInt(1656677730000), -2, -3, -4, BigInt(-5), 2, 3, 4, BigInt(5), parseFloat((3.1415 * 3).toFixed(5)), parseFloat((3.14159265 * 3).toFixed(15)), 'varchar_col_3', 'nchar_col_3', true,  'NULL', 'LINESTRING (1.000000 1.000000, 2.000000 2.000000, 5.000000 5.000000)', '0x7661726334'],
    [BigInt(1656677740000), -3, -4, -5, BigInt(-6), 3, 4, 5, BigInt(6), parseFloat((3.1415 * 4).toFixed(5)), parseFloat((3.14159265 * 4).toFixed(15)), 'varchar_col_4', 'nchar_col_4', false, 'NULL', 'POLYGON ((3.000000 6.000000, 5.000000 6.000000, 5.000000 8.000000, 3.000000 8.000000, 3.000000 6.000000))', '0x7661726335'],
    [BigInt(1656677750000), -4, -5, -6, BigInt(-7), 4, 5, 6, BigInt(7), parseFloat((3.1415 * 5).toFixed(5)), parseFloat((3.14159265 * 5).toFixed(15)), 'varchar_col_5', 'nchar_col_5', true,  'NULL', 'POINT (7.0 9.0)', '0x7661726335'],
]

const tableCNValues = [
    [BigInt(1656677760000), 0, -1, -2, BigInt(-3), 0, 1, 2, BigInt(3), parseFloat(3.1415.toFixed(5)), parseFloat(3.14159265.toFixed(15)), 'varchar_列_壹', 'nchar_列_甲',               true, 'NULL', 'POINT (4.0 8.0)', '0x7661726332'],    
    [BigInt(1656677770000), -1, -2, -3, BigInt(-4), 1, 2, 3, BigInt(4), parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.14159265 * 2).toFixed(15)), 'varchar_列_贰', 'nchar_列_乙', false, 'NULL', 'POINT (3.0 5.0)', '0x7661726333'],   
    [BigInt(1656677780000), -2, -3, -4, BigInt(-5), 2, 3, 4, BigInt(5), parseFloat((3.1415 * 3).toFixed(5)), parseFloat((3.14159265 * 3).toFixed(15)), 'varchar_列_叁', 'nchar_列_丙', true,  'NULL', 'LINESTRING (1.000000 1.000000, 2.000000 2.000000, 5.000000 5.000000)', '0x7661726334'],    
    [BigInt(1656677790000), -3, -4, -5, BigInt(-6), 3, 4, 5, BigInt(6), parseFloat((3.1415 * 4).toFixed(5)), parseFloat((3.14159265 * 4).toFixed(15)), 'varchar_列_肆', 'nchar_列_丁', false, 'NULL', 'POLYGON ((3.000000 6.000000, 5.000000 6.000000, 5.000000 8.000000, 3.000000 8.000000, 3.000000 6.000000))', '0x7661726335'],    
    [BigInt(1656677800000), -4, -5, -6, BigInt(-7), 4, 5, 6, BigInt(7), parseFloat((3.1415 * 5).toFixed(5)), parseFloat((3.14159265 * 5).toFixed(15)), 'varchar_列_伍', 'nchar_列_戊', true,  'NULL', 'POINT (7.0 9.0)', '0x7661726335'],    
]
const jsonTags = ["{\"key1\":\"taos\",\"key2\":null,\"key3\":\"TDengine\",\"key4\":0,\"key5\":false}"]
const jsonTagsCN = ["{\"key1\":\"taosdata\",\"key2\":null,\"key3\":\"TDengine涛思数据\",\"key4\":1,\"key5\":true}"]

const selectStable = `select * from ${stable}`
const selectStableCN = `select * from ${stableCN}`
const selectTable = `select * from ${table}`
const selectTableCN = `select * from ${tableCN}`
const selectJsonTable = `select * from ${jsonTable}`
const selectJsonTableCN = `select * from ${jsonTableCN}`

beforeAll(async () => {
    let ws = await WsSql.Open(conf);
    await ws.Exec(dropDB)
    await ws.Exec(createDB);
    await ws.Exec(useDB);
    await ws.Exec(createSTable(stable));
    await ws.Exec(createSTable(stableCN));
    await ws.Exec(createTable(table));
    await ws.Exec(createTable(tableCN));
    await ws.Exec(createSTableJSON(jsonTable));
    await ws.Exec(createSTableJSON(jsonTableCN));
    ws.Close()
})

describe('ws.query(stable)', () => {
    jest.setTimeout(20 * 1000)
    test('Insert query stable without CN character', async () => {
        let ws = await WsSql.Open(conf);
        await ws.Exec(useDB);
        let insert = insertStable(tableValues, stableTags, stable)
        let insertRes = await ws.Exec(insert)
        expect(insertRes.GetAffectRows()).toBe(5)

        let queryRes = await ws.Exec(selectStable)
        let expectMeta = tableMeta.concat(tagMeta)
        let expectData = expectStableData(tableValues, stableTags)
        let actualMeta = queryRes.GetMeta()
        let actualData = queryRes.GetData()
        ws.Close()
        if (actualData && actualMeta) {
            actualMeta.forEach((meta, index) => {
                expect(meta.name).toBe(expectMeta[index].name)
                expect(meta.type).toBe(expectMeta[index].type)
                expect(meta.length).toBe(expectMeta[index].length)
            })

            for (let i = 0; i < actualData.length; i++) {
                actualData[i].forEach((d, index) => {
                    // //   console.log(i, index, d, expectData[i][index])
                    if (expectMeta[index].name == 'geo' || expectMeta[index].name == 'vbinary') {
                        expect(d).toBeTruthy()
                    } else {
                        expect(d).toBe(expectData[i][index])
                    }
                    
                })
            }
        } else {
            throw new Error("retrieve empty result")
        }

    })

    test('query stable with CN character', async () => {
        let ws = await WsSql.Open(conf);
        await ws.Exec(useDB);
        let insertCN = insertStable(tableCNValues, stableCNTags, stableCN)
        // console.log(insertCN)
        let insertRes = await ws.Exec(insertCN)
        // console.log(insertRes)
        expect(insertRes.GetAffectRows()).toBe(5)

        let queryRes = await ws.Exec(selectStableCN)

        let expectMeta = tableMeta.concat(tagMeta)
        let expectData = expectStableData(tableCNValues, stableCNTags)
        let actualMeta = queryRes.GetMeta()
        let actualData = queryRes.GetData()
        ws.Close()
        if (actualData && actualMeta) {
            actualMeta.forEach((meta, index) => {
                expect(meta.name).toBe(expectMeta[index].name)
                expect(meta.type).toBe(expectMeta[index].type)
                expect(meta.length).toBe(expectMeta[index].length)
                ////   console.log(meta);
            })

            for (let i = 0; i < actualData.length; i++) {
                actualData[i].forEach((d, index) => {
                    if (expectMeta[index].name == 'geo' || expectMeta[index].name == 'vbinary') {
                        expect(d).toBeTruthy()
                    } else {
                        expect(d).toBe(expectData[i][index])
                    }
                })
            }
        } else {
            throw new Error("retrieve empty result")
        }
    })
})

describe('ws.query(table)', () => {
    test('Insert query normal table without CN character', async () => {
        let ws = await WsSql.Open(conf);
        await ws.Exec(useDB);
        let insert = insertNTable(tableValues, table)
        // console.log(insert)
        let insertRes = await ws.Exec(insert)
        expect(insertRes.GetAffectRows()).toBe(5)

        let queryRes = await ws.Exec(selectTable)

        let expectMeta = tableMeta
        let expectData = tableValues
        let actualMeta = queryRes.GetMeta()
        let actualData = queryRes.GetData()
        ws.Close()
        if (actualData && actualMeta) {
            actualMeta.forEach((meta, index) => {
                // console.log(meta,expectMeta[index]);
                expect(meta.name).toBe(expectMeta[index].name)
                expect(meta.type).toBe(expectMeta[index].type)
                expect(meta.length).toBe(expectMeta[index].length)
            })

            for (let i = 0; i < actualData.length; i++) {
                actualData[i].forEach((d, index) => {
                    if (expectMeta[index].name == 'geo' || expectMeta[index].name == 'vbinary') {
                        expect(d).toBeTruthy()
                    } else {
                        expect(d).toBe(expectData[i][index])
                    }
                })
            }
        } else {
            throw new Error("retrieve empty result")
        }
    })

    test('Insert query normal table with CN character', async () => {
        let ws = await WsSql.Open(conf);
        await ws.Exec(useDB);
        let insertCN = insertNTable(tableCNValues, tableCN)
        // console.log(insertCN)
        let insertRes = await ws.Exec(insertCN)
        // console.log(insertRes)
        expect(insertRes.GetAffectRows()).toBe(5)

        let queryRes = await ws.Exec(selectTableCN)

        let expectMeta = tableMeta
        let expectData = tableCNValues
        let actualMeta = queryRes.GetMeta()
        let actualData = queryRes.GetData()
        ws.Close()
        if (actualData && actualMeta) {
            actualMeta.forEach((meta, index) => {
                // console.log(meta, expectMeta[index]);

                expect(meta.name).toBe(expectMeta[index].name)
                expect(meta.type).toBe(expectMeta[index].type)
                expect(meta.length).toBe(expectMeta[index].length)
            })

            for (let i = 0; i < actualData.length; i++) {
                actualData[i].forEach((d, index) => {
                    if (expectMeta[index].name == 'geo' || expectMeta[index].name == 'vbinary') {
                        expect(d).toBeTruthy()
                    } else {
                        expect(d).toBe(expectData[i][index])
                    }

                })
            }
        } else {
            throw new Error("retrieve empty result")
        }
    })
})

describe('ws.query(jsonTable)', () => {
    test('Insert and query json data from table without CN', async () => {
        let ws = await WsSql.Open(conf);
        await ws.Exec(useDB);
        let insert = insertStable(tableValues, jsonTags, jsonTable)
        // console.log(insert)

        let insertRes = await ws.Exec(insert);
        expect(insertRes.GetAffectRows()).toBe(5)

        let queryRes = await ws.Exec(selectJsonTable)
        let expectMeta = tableMeta.concat(jsonMeta)
        let expectData = expectStableData(tableValues, jsonTags)
        let actualMeta = queryRes.GetMeta()
        let actualData = queryRes.GetData()
        ws.Close()
        if (actualData && actualMeta) {
            actualMeta.forEach((meta, index) => {
                //   console.log(meta);
                expect(meta.name).toBe(expectMeta[index].name)
                expect(meta.type).toBe(expectMeta[index].type)
                expect(meta.length).toBe(expectMeta[index].length)
            })

            for (let i = 0; i < actualData.length; i++) {
                actualData[i].forEach((d, index) => {
                    if (expectMeta[index].name == 'geo' || expectMeta[index].name == 'vbinary') {
                        expect(d).toBeTruthy()
                    } else {
                        expect(d).toBe(expectData[i][index])
                    }
                })
            }
        } else {
            throw new Error("retrieve empty result")
        }

    })


    test('Insert and query json data from table with CN', async () => {
        let ws = await WsSql.Open(conf);
        await ws.Exec(useDB);
        let insert = insertStable(tableCNValues, jsonTagsCN, jsonTableCN)
        // console.log(insert)

        let insertRes = await ws.Exec(insert);
        expect(insertRes.GetAffectRows()).toBe(5)

        let queryRes = await ws.Exec(selectJsonTableCN)
        let expectMeta = tableMeta.concat(jsonMeta)
        let expectData = expectStableData(tableCNValues, jsonTagsCN)
        let actualMeta = queryRes.GetMeta()
        let actualData = queryRes.GetData()
        ws.Close()
        if (actualData && actualMeta) {
            actualMeta.forEach((meta, index) => {
                //   console.log(meta);
                expect(meta.name).toBe(expectMeta[index].name)
                expect(meta.type).toBe(expectMeta[index].type)
                expect(meta.length).toBe(expectMeta[index].length)
            })

            for (let i = 0; i < actualData.length; i++) {
                actualData[i].forEach((d, index) => {
                    if (expectMeta[index].name == 'geo' || expectMeta[index].name == 'vbinary') {
                        expect(d).toBeTruthy()
                    } else {
                        expect(d).toBe(expectData[i][index])
                    }
                })
            }
        } else {
            throw new Error("retrieve empty result")
        }
    })

})

//--detectOpenHandles --maxConcurrency=1 --forceExit