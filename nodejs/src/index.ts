import { WsSql } from './sql/wsSql'
import { WSConfig } from './common/config';
import { WsConsumer } from './tmq/wsTmq';
import { setLevel } from "./common/log"

import { WebSocketConnectionPool } from './client/wsConnectorPool';

let sqlConnect = async (conf: WSConfig) => {
        return await WsSql.open(conf);
};

let tmqConnect = async (configMap: Map<string, string>) => {
    try {
        return await WsConsumer.newConsumer(configMap);
    } catch (err: any) {
        console.error(err);
        throw err;
    }
};

let setLogLevel = (level: string) => {
    setLevel(level)
};

let connectorDestroy = () => {
    WebSocketConnectionPool.instance().destroyed()
};
export { sqlConnect, tmqConnect, setLogLevel, connectorDestroy };
