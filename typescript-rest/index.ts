
import {TDConnect,Options} from './src/connect';
let options:Options = {
    path: '/rest/sqlutc',
    scheme: 'http',
}
let connect = function connect(option:Options){
    // console.log("index.options:"+JSON.stringify(option));
    return new TDConnect(option);
}

export {options,connect}
