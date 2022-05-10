
import {TDConnect,Options} from './src/connect';
let options:Options = {
    host: '127.0.0.1',
    port: 6041,
    path: '/rest/sql',
    user: 'root',
    passwd: 'taosdata',
    schema: 'http'
}
let connect = function connect(option:Options){
    return new TDConnect(option);
}

export {options,connect}

// 因为 Grafana data source 插件关于Authentication 的配置，需要云服务支持在所有 /rest/sql* 的 API 端点支持使用 ?token=xxx + Basic Auth 的请求方式，即：

// curl -u root:taosdata -d "show databases" http://172.31.77.245:6041/rest/sql?token=c37ef4dbec8708c0227b4e8cb84ffffb9b8711a1