const taos = require('../tdengine');
const conn = taos.connect({ host: "localhost",database:'p'});
const cursor = conn.cursor();


// cursor.execute("select * from p.t1 ;");//where ts = 1656677700000
cursor.execute("create table if not exists t( ts timestamp,v1 tinyint,v2 smallint,v4 int,v8 bigint,u1 tinyint unsigned,u2 smallint unsigned,u4 int unsigned,u8 bigint unsigned,f4 float,f8 double,bin binary(20),nchr nchar(20),b bool,nilcol int)tags( bo bool,tt tinyint,si smallint,ii int,bi bigint,tu tinyint unsigned,su smallint unsigned,iu int unsigned,bu bigint unsigned,ff float,dd double,bb binary(20),nc nchar(20));");
cursor.execute("insert into t1 using t tags (true,-1,-2,-3,-4,1,2,3,4,5,5.55,'varchar_tag','nchar_tag') values(1656677700000,0,1,2,3,0,1,2,3,0,0,'varchar_col_0','nchar_col_0',true,NULL)");
cursor.execute("insert into t1 values(1656677800100,1,2,3,4,1,2,3,4,1,2,'varchar_col_1','nchar_col_1',false,NULL)");

cursor. execute("select * from  p.t;")
cursor.fetchall();
console.log(cursor.fields); // Latest query's Field metadata is stored in cursor.fields
console.log(cursor.data); // Latest query's result data is stored in cursor.data, also returned by fetchall.


let p = cursor.query("select * from p.t; ")
p.execute().then((result) => result.pretty());

let p2 = cursor.query("select * from p.t;",true);
p2.then((result) =>result.pretty())

let p3 = cursor.query("describe  p.t");
p3.execute().then((result) => result.pretty());
cursor.close();
conn.close();