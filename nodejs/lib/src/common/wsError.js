"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = exports.TaosError = exports.TaosResultError = exports.WebSocketQueryInterFaceError = exports.WebSocketInterfaceError = exports.WebSocketQueryError = exports.TDWebSocketClientError = void 0;
class TDWebSocketClientError extends Error {
    constructor(code, message = '') {
        super(message);
        this.code = 0;
        this.name = new.target.name;
        this.code = code;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, new.target);
        }
        if (typeof Object.setPrototypeOf === 'function') {
            Object.setPrototypeOf(this, new.target.prototype);
        }
        else {
            this.__proto__ = new.target.prototype;
        }
    }
}
exports.TDWebSocketClientError = TDWebSocketClientError;
class WebSocketQueryError extends TDWebSocketClientError {
}
exports.WebSocketQueryError = WebSocketQueryError;
class WebSocketInterfaceError extends TDWebSocketClientError {
}
exports.WebSocketInterfaceError = WebSocketInterfaceError;
class WebSocketQueryInterFaceError extends WebSocketInterfaceError {
}
exports.WebSocketQueryInterFaceError = WebSocketQueryInterFaceError;
class TaosResultError extends TDWebSocketClientError {
}
exports.TaosResultError = TaosResultError;
class TaosError extends TDWebSocketClientError {
}
exports.TaosError = TaosError;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["ERR_INVALID_PARAMS"] = 100] = "ERR_INVALID_PARAMS";
    ErrorCode[ErrorCode["ERR_INVALID_URL"] = 101] = "ERR_INVALID_URL";
    ErrorCode[ErrorCode["ERR_WS_NO_CALLBACK"] = 102] = "ERR_WS_NO_CALLBACK";
    ErrorCode[ErrorCode["ERR_INVALID_MESSAGE_TYPE"] = 103] = "ERR_INVALID_MESSAGE_TYPE";
    ErrorCode[ErrorCode["ERR_WEBSOCKET_CONNECTION_FAIL"] = 104] = "ERR_WEBSOCKET_CONNECTION_FAIL";
    ErrorCode[ErrorCode["ERR_WEBSOCKET_QUERY_TIMEOUT"] = 105] = "ERR_WEBSOCKET_QUERY_TIMEOUT";
    ErrorCode[ErrorCode["ERR_INVALID_AUTHENTICATION"] = 106] = "ERR_INVALID_AUTHENTICATION";
    ErrorCode[ErrorCode["ERR_UNSUPPORTED_TDENGINE_TYPE"] = 107] = "ERR_UNSUPPORTED_TDENGINE_TYPE";
    ErrorCode[ErrorCode["ERR_CONNECTION_CLOSED"] = 108] = "ERR_CONNECTION_CLOSED";
    ErrorCode[ErrorCode["ERR_INVALID_FETCH_MESSAGE_DATA"] = 109] = "ERR_INVALID_FETCH_MESSAGE_DATA";
    ErrorCode[ErrorCode["ERR_WEBSOCKET_CONNECTION_ARRIVED_LIMIT"] = 110] = "ERR_WEBSOCKET_CONNECTION_ARRIVED_LIMIT";
    ErrorCode[ErrorCode["ERR_PARTITIONS_TOPIC_VGROUP_LENGTH_NOT_EQUAL"] = 111] = "ERR_PARTITIONS_TOPIC_VGROUP_LENGTH_NOT_EQUAL";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
