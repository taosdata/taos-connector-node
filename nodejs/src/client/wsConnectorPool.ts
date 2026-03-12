import { Mutex } from "async-mutex";
import { WebSocketConnector } from "./wsConnector";
import { ErrorCode, TDWebSocketClientError } from "../common/wsError";
import logger from "../common/log";
import { w3cwebsocket } from "websocket";
import { maskUrlForLog } from "../common/utils";

const mutex = new Mutex();

/**
 * Legacy connection pool - kept for backward compatibility with destroy() API.
 * In the new architecture, each WebSocketConnector manages its own lifecycle.
 * This pool is no longer actively used for connection pooling.
 */
export class WebSocketConnectionPool {
    private static _instance?: WebSocketConnectionPool;
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

    public static instance(maxConnections: number = -1): WebSocketConnectionPool {
        if (!WebSocketConnectionPool._instance) {
            WebSocketConnectionPool._instance = new WebSocketConnectionPool(maxConnections);
        }
        return WebSocketConnectionPool._instance;
    }

    destroyed() {
        let num = 0;
        if (this.pool) {
            for (let values of this.pool.values()) {
                for (let i in values) {
                    num++;
                    values[i].close();
                }
            }
        }
        logger.info(
            "destroyed connect:" +
            Atomics.load(WebSocketConnectionPool.sharedArray, 0) +
            " current count:" +
            num
        );
        Atomics.store(WebSocketConnectionPool.sharedArray, 0, 0);
        this.pool = new Map();
    }
}

process.on("exit", (code) => {
    logger.info("begin destroy connect");
    WebSocketConnectionPool.instance().destroyed();
    process.exit();
});

process.on("SIGINT", () => {
    logger.info("Received SIGINT. Press Control-D to exit, begin destroy connect...");
    WebSocketConnectionPool.instance().destroyed();
    process.exit();
});

process.on("SIGTERM", () => {
    logger.info("Received SIGTERM. Press Control-D to exit, begin destroy connect...");
    WebSocketConnectionPool.instance().destroyed();
    process.exit();
});
