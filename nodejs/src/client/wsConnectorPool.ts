import { Mutex } from "async-mutex";
import { WebSocketConnector } from "./wsConnector";
import { ErrorCode, TDWebSocketClientError } from "../common/wsError";
import logger from "../common/log";

const mutex = new Mutex();
export class WebSocketConnectionPool {
    private static _instance?:WebSocketConnectionPool;
    private pool: Map<string, WebSocketConnector[]> = new Map();
    private _connectionCount: number;
    private readonly _maxConnections: number;
    private constructor(maxConnections: number = -1) {
        this._maxConnections = maxConnections;
        this._connectionCount = 0;
    }

    public static instance(maxConnections: number = -1):WebSocketConnectionPool {
        if (!WebSocketConnectionPool._instance) {
            WebSocketConnectionPool._instance = new WebSocketConnectionPool(maxConnections);
        }
        return WebSocketConnectionPool._instance;
    }

    async getConnection(url:URL, timeout: number | undefined | null): Promise<WebSocketConnector> {
        let connectAddr = url.origin.concat(url.pathname).concat(url.search)
        logger.info("url:" + url)
        let connector:WebSocketConnector | undefined;
        const unlock = await mutex.acquire()
        try {
            if (this.pool.has(connectAddr)) {
                let connectors = this.pool.get(connectAddr);
                if (connectors) {
                    if (connectors.length > 0) {
                        connector = connectors.pop();
                    }
                }
            }  

            if (connector) {
                logger.debug("get connection success:" + this._connectionCount)
                return connector;
            }
            if (this._maxConnections != -1 && this._connectionCount > this._maxConnections) {
                throw new TDWebSocketClientError(ErrorCode.ERR_WEBSOCKET_CONNECTION_ARRIVED_LIMIT, "websocket connect arrived limited:" + this._connectionCount)
            }
            
            this._connectionCount++
            return new WebSocketConnector(url, timeout);          
        }finally{
            unlock()
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
                } else {
                    this._connectionCount--;
                    connector.close()
                }
            } finally {
                unlock();
            }
        }
    }

    destroyed() {
        if (this.pool) {
            for (let values of this.pool.values()) {
                for (let i in values ) {
                    values.pop()?.close();
                }
            }
        }
        logger.info("destroyed connect:" + this._connectionCount)
        this._connectionCount = 0
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