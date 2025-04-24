export declare class TDWebSocketClientError extends Error {
    code: number;
    constructor(code: number, message?: string);
}
export declare class WebSocketQueryError extends TDWebSocketClientError {
}
export declare class WebSocketInterfaceError extends TDWebSocketClientError {
}
export declare class WebSocketQueryInterFaceError extends WebSocketInterfaceError {
}
export declare class TaosResultError extends TDWebSocketClientError {
}
export declare class TaosError extends TDWebSocketClientError {
}
export declare enum ErrorCode {
    ERR_INVALID_PARAMS = 100,
    ERR_INVALID_URL = 101,
    ERR_WS_NO_CALLBACK = 102,
    ERR_INVALID_MESSAGE_TYPE = 103,
    ERR_WEBSOCKET_CONNECTION_FAIL = 104,
    ERR_WEBSOCKET_QUERY_TIMEOUT = 105,
    ERR_INVALID_AUTHENTICATION = 106,
    ERR_UNSUPPORTED_TDENGINE_TYPE = 107,
    ERR_CONNECTION_CLOSED = 108,
    ERR_INVALID_FETCH_MESSAGE_DATA = 109,
    ERR_WEBSOCKET_CONNECTION_ARRIVED_LIMIT = 110,
    ERR_PARTITIONS_TOPIC_VGROUP_LENGTH_NOT_EQUAL = 111
}
//# sourceMappingURL=wsError.d.ts.map