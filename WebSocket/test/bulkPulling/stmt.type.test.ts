import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { createBaseSTable, getInsertBind } from "../utils";

const stable = 'ws_stmt_stb';
const table = 'stmt_001';
const db = 'ws_stmt'
const createDB = `create database if not exists ${db} keep 3650`
const useDB = `use ${db}`
const dropDB = `drop database if exists ${db}`

const tableCN = 'stmt_cn';
const stableCN = 'ws_stmt_stb_cn';
const jsonTable = 'stmt_json';
const jsonTableCN = 'stmt_json_cn';


const stableTags = [true, -1, -2, -3, -4, 1, 2, 3, 4, parseFloat(3.1415.toFixed(5)), parseFloat(3.14159265.toFixed(15)), 'varchar_tag_1', 'nchar_tag_1']
const stableCNTags = [false, -1 * 2, -2 * 2, -3 * 2, -4 * 2, 1 * 2, 2 * 2, 3 * 2, 4 * 2, parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.14159265 * 2).toFixed(15)), 'varchar_标签_壹', 'nchar_标签_贰']

const tableValues = [
	[1656677710000, 1656677720000, 1656677730000, 1656677740000, 1656677750000],
	[0, -1, -2, -3, -4],
	[-1, -2,-3, -4, -5],
	[ -2, -3, -4,-5, -6],
	[-3, -4,-5, -6, -7],
	[0, 1, 2, 3, 4],
	[1, 2, 3, 4,5],
	[2, 3, 4,5, 6],
	[3, 4, 5, 6, 7],
	[parseFloat(3.1415.toFixed(5)), parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.1415 * 3).toFixed(5)), parseFloat((3.1415 * 4).toFixed(5)), parseFloat((3.1415 * 5).toFixed(5))],
	[parseFloat(3.14159265.toFixed(15)), parseFloat((3.14159265 * 2).toFixed(15)), parseFloat((3.14159265 * 3).toFixed(15)), parseFloat((3.14159265 * 4).toFixed(15)), parseFloat((3.14159265 * 5).toFixed(15))],
	['varchar_col_1', 'varchar_col_2', 'varchar_col_3', 'varchar_col_4', 'varchar_col_5' ],
	['nchar_col_1', 'nchar_col_2', 'nchar_col_3', 'nchar_col_4', 'nchar_col_5'],
	[true, false, true, false, true],
	[null, null, null, null, null]
]

const tableCNValues = [
	[BigInt(1656677760000), BigInt(1656677770000), BigInt(1656677780000), BigInt(1656677790000), BigInt(1656677100000)],
	[0, -1, -2, -3, -4],
	[-1, -2,-3, -4, -5],
	[ -2, -3, -4,-5, -6],
	[BigInt(-3), BigInt(-4),BigInt(-5), BigInt(-6), BigInt(-7)],
	[0, 1, 2, 3, 4],
	[1, 2, 3, 4,5],
	[2, 3, 4,5, 6],
	[BigInt(3), BigInt(4), BigInt(5), BigInt(6), BigInt(7)],
	[parseFloat(3.1415.toFixed(5)), parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.1415 * 3).toFixed(5)), parseFloat((3.1415 * 4).toFixed(5)), parseFloat((3.1415 * 5).toFixed(5))],
	[parseFloat(3.14159265.toFixed(15)), parseFloat((3.14159265 * 2).toFixed(15)), parseFloat((3.14159265 * 3).toFixed(15)), parseFloat((3.14159265 * 4).toFixed(15)), parseFloat((3.14159265 * 5).toFixed(15))],
    ['varchar_列_壹','varchar_列_贰','varchar_列_叁','varchar_列_肆','varchar_列_伍'],
    ['nchar_列_甲','nchar_列_乙','nchar_列_丙','nchar_列_丁','nchar_列_戊'],
	[true, false, true, false, true],
	[null, null, null, null, null]
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
    let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
    let conf :WSConfig = new WSConfig(dsn)
    let ws = await WsSql.Open(conf);
    await ws.Exec(dropDB);
    await ws.Exec(createDB);
    await ws.Exec(useDB);
    await ws.Exec(createBaseSTable(stable));
    await ws.Exec(createBaseSTable(stableCN));
    ws.Close()
})

describe('TDWebSocket.Stmt()', () => {
    jest.setTimeout(20 * 1000)
    test.skip('normal BindParam', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb(db)
        let connector = await WsSql.Open(wsConf) 
        let stmt = await (await connector).StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare(getInsertBind(tableValues.length, stableTags.length, db, stable));
        await stmt.SetTableName(table);
        await stmt.SetTags(stableTags)
        await stmt.Bind(tableValues)
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(5)
        await stmt.Close()
        connector.Close();
    });
})