import { WsSql } from './sql/wsSql'
import { WSConfig } from './common/config';
import { WsConsumer } from './tmq/wsTmq';
import logger, { setLevel } from "./common/log"
import winston from 'winston';
import { WebSocketConnectionPool } from './client/wsConnectorPool';

let sqlConnect = async (conf: WSConfig) => {
        return await WsSql.Open(conf);
};

let tmqConnect = async (configMap: Map<string, string>) => {
    try {
        return await WsConsumer.NewConsumer(configMap);
    } catch (err: any) {
        console.error(err);
        throw err;
    }
};

let setLogLevel = (level: string) => {
    setLevel(level)
};

let connectorDestroy = () => {
    WebSocketConnectionPool.Instance().Destroyed()
};
export { sqlConnect, tmqConnect, setLogLevel, connectorDestroy };
