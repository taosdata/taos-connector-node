"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketConnectionPool = void 0;
const async_mutex_1 = require("async-mutex");
const wsConnector_1 = require("./wsConnector");
const wsError_1 = require("../common/wsError");
const log_1 = __importDefault(require("../common/log"));
const mutex = new async_mutex_1.Mutex();
class WebSocketConnectionPool {
    constructor(maxConnections = -1) {
        this.pool = new Map();
        this._maxConnections = maxConnections;
        this._connectionCount = 0;
    }
    static instance(maxConnections = -1) {
        if (!WebSocketConnectionPool._instance) {
            WebSocketConnectionPool._instance = new WebSocketConnectionPool(maxConnections);
        }
        return WebSocketConnectionPool._instance;
    }
    async getConnection(url, timeout) {
        let connectAddr = url.origin.concat(url.pathname).concat(url.search);
        log_1.default.info("url:" + url);
        let connector;
        const unlock = await mutex.acquire();
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
                log_1.default.debug("get connection success:" + this._connectionCount);
                return connector;
            }
            if (this._maxConnections != -1 && this._connectionCount > this._maxConnections) {
                throw new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_WEBSOCKET_CONNECTION_ARRIVED_LIMIT, "websocket connect arrived limited:" + this._connectionCount);
            }
            this._connectionCount++;
            return new wsConnector_1.WebSocketConnector(url, timeout);
        }
        finally {
            unlock();
        }
    }
    async releaseConnection(connector) {
        if (connector) {
            const unlock = await mutex.acquire();
            try {
                if (connector.readyState() > 0) {
                    let url = connector.getWsURL();
                    let connectAddr = url.origin.concat(url.pathname).concat(url.search);
                    let connectors = this.pool.get(connectAddr);
                    if (!connectors) {
                        connectors = new Array();
                        connectors.push(connector);
                        this.pool.set(connectAddr, connectors);
                    }
                    else {
                        connectors.push(connector);
                    }
                }
                else {
                    this._connectionCount--;
                    connector.close();
                }
            }
            finally {
                unlock();
            }
        }
    }
    destroyed() {
        if (this.pool) {
            for (let values of this.pool.values()) {
                for (let i in values) {
                    values.pop()?.close();
                }
            }
        }
        log_1.default.info("destroyed connect:" + this._connectionCount);
        this._connectionCount = 0;
        this.pool = new Map();
    }
}
exports.WebSocketConnectionPool = WebSocketConnectionPool;
process.on('exit', (code) => {
    log_1.default.info("begin destroy connect");
    WebSocketConnectionPool.instance().destroyed();
    process.exit();
});
process.on('SIGINT', () => {
    log_1.default.info('Received SIGINT. Press Control-D to exit, begin destroy connect...');
    WebSocketConnectionPool.instance().destroyed();
    process.exit();
});
process.on('SIGTERM', () => {
    log_1.default.info('Received SIGINT. Press Control-D to exit, begin destroy connect');
    WebSocketConnectionPool.instance().destroyed();
    process.exit();
});
// process.kill(process.pid, 'SIGINT');
