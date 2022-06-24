const taos = require('../tdengine');

// Get taos Client version.
const conn = taos.connect({ host: "localhost" });
console.log("getClientInfo:"+conn.getClientInfo());

// Get tao Server version.
const cursor = conn.cursor();
let serverInfo = cursor.getServerInfo(conn);
console.log("serverInfo:"+serverInfo);

cursor.close();