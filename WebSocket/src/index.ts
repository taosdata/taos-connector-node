import { WsSql } from './sql/wsSql'
import { WSConfig } from './common/config';
import { WsConsumer } from './tmq/wsTmq';

let wsSql = async (conf: WSConfig) => {
    try {
        return await WsSql.Open(conf)
    } catch (err: any) {
        console.error(err);
        throw err;
    }  
};

let wsTmq = async (configMap: Map<string, string>) => {
    try {
        return await WsConsumer.NewConsumer(configMap);
    } catch (err: any) {
        console.error(err);
        throw err;
    }  
};

export { wsSql, wsTmq };