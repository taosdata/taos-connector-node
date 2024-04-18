import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { createBaseSTable, createBaseSTableJSON, createSTableJSON, getInsertBind } from "../utils";

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
    [-3, -4,-5, -6, -7],

    // [0, 1, 2, 3, 4],
	[BigInt(-2), BigInt(-3), BigInt(-4), BigInt(-5), BigInt(-6)],

	[0, 1, 2, 3, 4],
	[1, 2, 3, 4,5],
	[2, 3, 4,5, 6],

    // [0, 1, 2, 3, 4],
	[BigInt(3), BigInt(4), BigInt(5), BigInt(6), BigInt(7)],

	[parseFloat(3.1415.toFixed(5)), parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.1415 * 3).toFixed(5)), parseFloat((3.1415 * 4).toFixed(5)), parseFloat((3.1415 * 5).toFixed(5))],
	[parseFloat(3.14159265.toFixed(15)), parseFloat((3.14159265 * 2).toFixed(15)), parseFloat((3.14159265 * 3).toFixed(15)), parseFloat((3.14159265 * 4).toFixed(15)), parseFloat((3.14159265 * 5).toFixed(15))],
	['varchar_col_1', 'varchar_col_2', 'varchar_col_3', 'varchar_col_4', 'varchar_col_5' ],
	['nchar_col_1', 'nchar_col_2', '', 'nchar_col_4', 'nchar_col_5'],
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
	[null, null, null, null, null],
]

let geoDataArray:any[] = [];
let varbinary:any[] = [];
const encoder = new TextEncoder();
for (let i = 0; i< 5; i++) {
    let data = new Uint8Array([0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,
        0x00,0x00,0x00,0x59,0x40,0x00,0x00,0x00,0x00,0x00,0x00,0x59,0x40,])
    geoDataArray.push(data.buffer) ; 
    let vdata = encoder.encode(`varchar_col_${i+1}`)
    varbinary.push(vdata.buffer)
}

const jsonTags = ["{\"key1\":\"taos\",\"key2\":null,\"key3\":\"TDengine\",\"key4\":0,\"key5\":false}"]
const jsonTagsCN = ["{\"key1\":\"taosdata\",\"key2\":null,\"key3\":\"TDengine涛思数据\",\"key4\":1,\"key5\":true}"]

const selectStable = `select * from ${stable}`
const selectStableCN = `select * from ${stableCN}`
const selectTable = `select * from ${table}`
const selectTableCN = `select * from ${tableCN}`
const selectJsonTable = `select * from ${jsonTable}`
const selectJsonTableCN = `select * from ${jsonTableCN}`


beforeAll(async () => {
    let dsn = 'ws://root:taosdata@localhost:6041';
    let conf :WSConfig = new WSConfig(dsn)
    let ws = await WsSql.Open(conf);
    await ws.Exec(dropDB);
    await ws.Exec(createDB);
    await ws.Exec(useDB);
    await ws.Exec(createBaseSTable(stable));
    await ws.Exec(createSTableJSON(jsonTable));
    await ws.Close()
})

describe('TDWebSocket.Stmt()', () => {
    jest.setTimeout(20 * 1000)
    test('normal BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb(db)
        let connector = await WsSql.Open(wsConf) 
        let stmt = await (await connector).StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare(getInsertBind(tableValues.length + 2, stableTags.length, db, stable));
        await stmt.SetTableName(table);
        let tagParams = stmt.NewStmtParam();
        tagParams.SetBooleanColumn([stableTags[0]])
        tagParams.SetTinyIntColumn([stableTags[1]])
        tagParams.SetSmallIntColumn([stableTags[2]])
        tagParams.SetIntColumn([stableTags[3]])
        tagParams.SetBigIntColumn([BigInt(stableTags[4])])
        tagParams.SetUTinyIntColumn([stableTags[5]])

        tagParams.SetUSmallIntColumn([stableTags[6]])
        tagParams.SetUIntColumn([stableTags[7]])
        tagParams.SetUBigIntColumn([BigInt(stableTags[8])])
        tagParams.SetFloatColumn([stableTags[9]])
        tagParams.SetDoubleColumn([stableTags[10]])
        tagParams.SetBinaryColumn([stableTags[11]])
        tagParams.SetNcharColumn([stableTags[12]])
        await stmt.SetBinaryTags(tagParams);

        let bindParams = stmt.NewStmtParam();
        bindParams.SetTimestampColumn(tableValues[0])
        bindParams.SetTinyIntColumn(tableValues[1])
        bindParams.SetSmallIntColumn(tableValues[2])
        bindParams.SetIntColumn(tableValues[3])
        bindParams.SetBigIntColumn(tableValues[4])
        bindParams.SetUTinyIntColumn(tableValues[5])
        bindParams.SetUSmallIntColumn(tableValues[6])
        bindParams.SetUIntColumn(tableValues[7])
        bindParams.SetUBigIntColumn(tableValues[8])
        bindParams.SetFloatColumn(tableValues[9])
        bindParams.SetDoubleColumn(tableValues[10])
        
        bindParams.SetBinaryColumn(tableValues[11])
        bindParams.SetNcharColumn(tableValues[12])
        bindParams.SetBooleanColumn(tableValues[13])
        bindParams.SetIntColumn(tableValues[14])
        bindParams.SetGeometryColumn(geoDataArray)
        bindParams.SetVarBinaryColumn(varbinary)
    
        await stmt.BinaryBind(bindParams);
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(5)
        await stmt.Close()
        let result = await connector.Exec(`select * from ${db}.${stable}`)
        console.log(result)
        await connector.Close();
    });

    test('normal CN BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb(db)
        let connector = await WsSql.Open(wsConf) 
        let stmt = await (await connector).StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare(getInsertBind(tableValues.length + 2, stableTags.length, db, stable));
        await stmt.SetTableName(table);
        let tagParams = stmt.NewStmtParam();
        tagParams.SetBooleanColumn([stableCNTags[0]])
        tagParams.SetTinyIntColumn([stableCNTags[1]])
        tagParams.SetSmallIntColumn([stableCNTags[2]])
        tagParams.SetIntColumn([stableCNTags[3]])
        tagParams.SetBigIntColumn([BigInt(stableCNTags[4])])
        tagParams.SetUTinyIntColumn([stableCNTags[5]])

        tagParams.SetUSmallIntColumn([stableCNTags[6]])
        tagParams.SetUIntColumn([stableCNTags[7]])
        tagParams.SetUBigIntColumn([BigInt(stableCNTags[8])])
        tagParams.SetFloatColumn([stableCNTags[9]])
        tagParams.SetDoubleColumn([stableCNTags[10]])
        tagParams.SetBinaryColumn([stableCNTags[11]])
        tagParams.SetNcharColumn([stableCNTags[12]])
        await stmt.SetBinaryTags(tagParams);

        let bindParams = stmt.NewStmtParam();
        bindParams.SetTimestampColumn(tableCNValues[0])
        bindParams.SetTinyIntColumn(tableCNValues[1])
        bindParams.SetSmallIntColumn(tableCNValues[2])
        bindParams.SetIntColumn(tableCNValues[3])
        bindParams.SetBigIntColumn(tableCNValues[4])
        bindParams.SetUTinyIntColumn(tableCNValues[5])
        bindParams.SetUSmallIntColumn(tableCNValues[6])
        bindParams.SetUIntColumn(tableCNValues[7])
        bindParams.SetUBigIntColumn(tableCNValues[8])
        bindParams.SetFloatColumn(tableCNValues[9])
        bindParams.SetDoubleColumn(tableCNValues[10])
        
        bindParams.SetBinaryColumn(tableCNValues[11])
        bindParams.SetNcharColumn(tableCNValues[12])
        bindParams.SetBooleanColumn(tableCNValues[13])
        bindParams.SetIntColumn(tableCNValues[14])
        bindParams.SetGeometryColumn(geoDataArray)
        bindParams.SetVarBinaryColumn(varbinary)
    
        await stmt.BinaryBind(bindParams);
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(5)
        await stmt.Close()
        let result = await connector.Exec(`select count(*) from ${db}.${stable}`)
        console.log(result)
        await connector.Close();
    });

    test('normal json tag BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb(db)
        let connector = await WsSql.Open(wsConf) 
        let stmt = await (await connector).StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare(getInsertBind(tableValues.length + 2, jsonTags.length, db, jsonTable));
        await stmt.SetTableName(`${jsonTable}_001`);
        let tagParams = stmt.NewStmtParam();
        tagParams.SetJsonColumn(jsonTags);
        await stmt.SetBinaryTags(tagParams);

        let bindParams = stmt.NewStmtParam();
        bindParams.SetTimestampColumn(tableCNValues[0])
        bindParams.SetTinyIntColumn(tableCNValues[1])
        bindParams.SetSmallIntColumn(tableCNValues[2])
        bindParams.SetIntColumn(tableCNValues[3])
        bindParams.SetBigIntColumn(tableCNValues[4])
        bindParams.SetUTinyIntColumn(tableCNValues[5])
        bindParams.SetUSmallIntColumn(tableCNValues[6])
        bindParams.SetUIntColumn(tableCNValues[7])
        bindParams.SetUBigIntColumn(tableCNValues[8])
        bindParams.SetFloatColumn(tableCNValues[9])
        bindParams.SetDoubleColumn(tableCNValues[10])
        
        bindParams.SetBinaryColumn(tableCNValues[11])
        bindParams.SetNcharColumn(tableCNValues[12])
        bindParams.SetBooleanColumn(tableCNValues[13])
        bindParams.SetIntColumn(tableCNValues[14])
        bindParams.SetGeometryColumn(geoDataArray)
        bindParams.SetVarBinaryColumn(varbinary)
    
        await stmt.BinaryBind(bindParams);
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(5)
        await stmt.Close()
        let result = await connector.Exec(`select * from ${db}.${jsonTable}`)
        console.log(result)
        await connector.Close();
    });

    test('normal json cn tag BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb(db)
        let connector = await WsSql.Open(wsConf) 
        let stmt = await (await connector).StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare(getInsertBind(tableValues.length + 2, jsonTags.length, db, jsonTable));
        await stmt.SetTableName(`${jsonTable}_001`);
        let tagParams = stmt.NewStmtParam();
        tagParams.SetJsonColumn(jsonTagsCN);
        await stmt.SetBinaryTags(tagParams);

        let bindParams = stmt.NewStmtParam();
        bindParams.SetTimestampColumn(tableCNValues[0])
        bindParams.SetTinyIntColumn(tableCNValues[1])
        bindParams.SetSmallIntColumn(tableCNValues[2])
        bindParams.SetIntColumn(tableCNValues[3])
        bindParams.SetBigIntColumn(tableCNValues[4])
        bindParams.SetUTinyIntColumn(tableCNValues[5])
        bindParams.SetUSmallIntColumn(tableCNValues[6])
        bindParams.SetUIntColumn(tableCNValues[7])
        bindParams.SetUBigIntColumn(tableCNValues[8])
        bindParams.SetFloatColumn(tableCNValues[9])
        bindParams.SetDoubleColumn(tableCNValues[10])
        
        bindParams.SetBinaryColumn(tableCNValues[11])
        bindParams.SetNcharColumn(tableCNValues[12])
        bindParams.SetBooleanColumn(tableCNValues[13])
        bindParams.SetIntColumn(tableCNValues[14])
        bindParams.SetGeometryColumn(geoDataArray)
        bindParams.SetVarBinaryColumn(varbinary)
    
        await stmt.BinaryBind(bindParams);
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(5)
        await stmt.Close()
        let result = await connector.Exec(`select * from ${db}.${jsonTable}`)
        console.log(result)
        await connector.Close();
    });

})

afterAll(async () => {
    WebSocketConnectionPool.Instance().Destroyed()
})