import {TDengineWebSocket} from './src/tdengineWebsocket'

let TDWebSocket = (url:string)=>{
    return new TDengineWebSocket(url)
}

export{TDWebSocket}