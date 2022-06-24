const taos = require('../../tdengine');
const { getFeildsFromDll, buildInsertSql, getFieldArr, getResData } = require('../utils/utilTools')

const author = 'xiaolei';
const result = 'passed';
const fileName = __filename.slice(__dirname.length + 1);

// This is a taos connection
let conn;
// This is a Cursor
let c1;

describe("test getClientInfo()", () => {
    test(`name:test TDengineConnection.getClientInfo()()` +
        `author:${author};` +
        `desc:test getClientInfo;` +
        `filename:${fileName};` +
        `result:${result}`, () => {
            conn = taos.connect({});
            let clientVersion = undefined; 
            clientVersion = conn.getClientInfo();
            
            // assert result data
            expect(clientVersion).toBeDefined();
            conn.close();
        })
})

describe("test getServerInfo()", () => {
    test(`name:test TDengineCursor.getClientInfo()()` +
        `author:${author};` +
        `desc:test getClientInfo;` +
        `filename:${fileName};` +
        `result:${result}`, () => {
            conn = taos.connect({host:'localhost'});
            let serverVersion = undefined;
            serverVersion = conn.cursor().getServerInfo();
            
            // assert result data
            expect(serverVersion).toBeDefined();
            conn.close();
        })
})