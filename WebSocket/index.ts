import {TDengineWebSocket} from './src/tdengineWebsocket'

let connect = (url:string)=>{
    return new TDengineWebSocket(url)
}

export{connect}