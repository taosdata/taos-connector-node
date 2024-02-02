import {connect, stmtConnect } from "../index";
let ws = connect("ws://root:taosdata@192.168.1.98:6051/rest/ws")
let stmt = stmtConnect("ws://root:taosdata@192.168.1.98:6051/rest/ws")
const db = 'test';
const table = 'ws'
const createDB = `create database if not exists ${db} keep 3650`;
const useDB = `use ${db}`;
const dropDB = `drop database if exists ${db}`;
const createTB = `create table if not exists ${table}(ts timestamp,i8 tinyint,i16 smallint,i32 int,i64 bigint,bnr binary(40),nchr nchar(40))`;
const addColumn = `alter table ${db}.${table} add column new_column nchar(40) `;
const dropColumn = `alter table ${db}.${table} drop column new_column`;
const insertSql = `insert into ${db}.${table} values('2022-03-30 18:30:51.567',1,2,3,4,'binary1','nchar1')` +
    `('2022-03-30 18:30:51.568',5,6,7,8,'binary2','nchar2')` +
    `('2022-03-30 18:30:51.569',9,0,1,2,'binary3','nchar3')`;
const querySql = `select * from ${db}.${table}`;
const errorSql = 'show databases';

ws.Open()
    // .then(res=>console.log(res))   
    // .then(() => ws.Query(createDB))
    // .then(res=> res.Scan())
    // .then(res => { console.log(res) })
    // .then(() => ws.Exec(useDB))
    // .then(res => { console.log(res) })
    // .then(() => ws.Exec(createTB))
    // .then(res => { console.log(res) })
    .then(() => ws.Exec(insertSql))
    .then(res => console.log(res))
    // .then(() => ws.Exec(addColumn))
    // .then(res => console.log(res))
    // .then(() => ws.Exec(dropColumn))
    // .then(res => console.log(res))
    .then(() => {ws.Exec(querySql)})
    .then(res => {console.log("fdfdfdfdfewfewf"); console.log(res)})
    // .then(() => ws.Exec(dropDB))
    // .then(res => console.log(res))
    // .then(() => ws.Exec(errorSql))
    // .then(res=>console.log(res))
    .catch(e => { console.log(e); ws.Close() })



    
