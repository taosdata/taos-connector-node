import { WsSql } from './src/sql/wsSql'
import { WSConfig } from './src/common/config';
import { WsConsumer } from './src/tmq/wsTmq';
import logger from "./src/common/log"
import winston from 'winston';
import { WebSocketConnectionPool } from './src/client/wsConnectorPool';

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
    logger.level = level
    if (level == 'debug') {
        logger.transports.push(new winston.transports.Console())
    }
};

let connectorDestroy = () => {
    WebSocketConnectionPool.Instance().Destroyed()
};
export { sqlConnect, tmqConnect, setLogLevel, connectorDestroy };