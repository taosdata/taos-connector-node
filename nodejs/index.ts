import { WsSql } from './src/sql/wsSql'
import { WSConfig } from './src/common/config';
import { WsConsumer } from './src/tmq/wsTmq';
import logger from "./src/common/log"
import winston from 'winston';

let sqlConnect = async (conf: WSConfig) => {
    try {
        return await WsSql.Open(conf)
    } catch (err: any) {
        console.error(err);
        throw err;
    }  
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
export { sqlConnect, tmqConnect, setLogLevel };