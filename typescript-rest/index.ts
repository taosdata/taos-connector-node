
import { TDConnect, Options } from './src/connect';
let options: Options = {
    path: '/rest/sqlutc/',
    scheme: 'http',
    user: 'root',
    passwd: 'taosdata',
    host: "127.0.0.1",
    port: 6041,
}
let connect = function connect(option: Options) {
    // console.log("index.options:"+JSON.stringify(option));
    return new TDConnect(option);
}

export { options, connect }
