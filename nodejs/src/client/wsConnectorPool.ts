import { Mutex } from "async-mutex";
import { WebSocketConnector } from "./wsConnector";
import { ErrorCode, TDWebSocketClientError } from "../common/wsError";
import logger from "../common/log";

const mutex = new Mutex();



export class WebSocketConnectionPool {
    private static _instance?:WebSocketConnectionPool;
    private pool: Map<string, WebSocketConnector[]> = new Map();
    private readonly _maxConnections: number;
    private static sharedBuffer: SharedArrayBuffer;
    private static sharedArray: Int32Array;

    private constructor(maxConnections: number = -1) {
        this._maxConnections = maxConnections;
        WebSocketConnectionPool.sharedBuffer = new SharedArrayBuffer(4);
        WebSocketConnectionPool.sharedArray = new Int32Array(WebSocketConnectionPool.sharedBuffer);
        Atomics.store(WebSocketConnectionPool.sharedArray, 0, 0);
    }

    public static instance(maxConnections: number = -1):WebSocketConnectionPool {
        if (!WebSocketConnectionPool._instance) {
            WebSocketConnectionPool._instance = new WebSocketConnectionPool(maxConnections);
        }
        return WebSocketConnectionPool._instance;
    }

    async getConnection(url:URL, timeout: number | undefined | null): Promise<WebSocketConnector> {
        let connectAddr = url.origin.concat(url.pathname).concat(url.search)
        let connector:WebSocketConnector | undefined;
        const unlock = await mutex.acquire()
        try {
            if (this.pool.has(connectAddr)) {
                const connectors = this.pool.get(connectAddr);
                while (connectors && connectors.length > 0) {
                    const candidate = connectors.pop();
                    if (candidate && candidate.readyState() > 0) { // 1: OPEN
                        connector = candidate;
                        break;
                    } else if (candidate) {
                        Atomics.add(WebSocketConnectionPool.sharedArray, 0, -1);
                        candidate.close();
                        logger.error(`getConnection, current connection status fail, url: ${connectAddr}`)
                    }
                }
            }

            if (connector) {
                logger.debug("get connection success:" + Atomics.load(WebSocketConnectionPool.sharedArray, 0));
                return connector;
            }

            if (this._maxConnections != -1 && Atomics.load(WebSocketConnectionPool.sharedArray, 0) > this._maxConnections) {
                throw new TDWebSocketClientError(ErrorCode.ERR_WEBSOCKET_CONNECTION_ARRIVED_LIMIT, "websocket connect arrived limited:" + Atomics.load(WebSocketConnectionPool.sharedArray, 0));
            }
            Atomics.add(WebSocketConnectionPool.sharedArray, 0, 1);
            logger.info("getConnection, new connection count:" + Atomics.load(WebSocketConnectionPool.sharedArray, 0) + ", connectAddr:" + connectAddr);
            return new WebSocketConnector(url, timeout);
        } finally {
            unlock();
        }
    }

    async releaseConnection(connector: WebSocketConnector):Promise<void> {
        if (connector) {
            const unlock = await mutex.acquire();
            try {
                if (connector.readyState() > 0) {
                    let url = connector.getWsURL();
                    let connectAddr = url.origin.concat(url.pathname).concat(url.search)   
                    let connectors = this.pool.get(connectAddr);
                    if (!connectors) {
                        connectors = new Array();
                        connectors.push(connector);
                        this.pool.set(connectAddr, connectors); 

                    } else {
                        connectors.push(connector);
                    }
                    logger.info("releaseConnection, current connection count:" + connectors.length)
                } else {
                    Atomics.add(WebSocketConnectionPool.sharedArray, 0, -1);
                    connector.close()
                    logger.info("releaseConnection, current connection status fail:" + Atomics.load(WebSocketConnectionPool.sharedArray, 0))
                }
            } finally {
                unlock();
            } 
        }
    }

    destroyed() {
        let num = 0;
        if (this.pool) {
            for (let values of this.pool.values()) {
                for (let i in values ) {
                    num++;
                    values[i].close();
                }
            }
        }
        logger.info("destroyed connect:" +  Atomics.load(WebSocketConnectionPool.sharedArray, 0) + " current count:" + num);
        Atomics.store(WebSocketConnectionPool.sharedArray, 0, 0);
        this.pool = new Map()
    }
}


process.on('exit', (code) => {
    logger.info("begin destroy connect")
    WebSocketConnectionPool.instance().destroyed()
    process.exit()
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT. Press Control-D to exit, begin destroy connect...');
    WebSocketConnectionPool.instance().destroyed()
    process.exit()
});

process.on('SIGTERM', () => {
    logger.info('Received SIGINT. Press Control-D to exit, begin destroy connect');
    WebSocketConnectionPool.instance().destroyed()
    process.exit()
});

// process.kill(process.pid, 'SIGINT');