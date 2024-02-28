export class TDWebSocketClientError extends Error {
     code:number = 0;
     constructor(code:number, message: string) {
        super(message);
        this.code = code
     }
}
export class WebSocketQueryError extends TDWebSocketClientError { }
export class WebSocketInterfaceError extends TDWebSocketClientError {}
export class WebSocketQueryInterFaceError extends WebSocketInterfaceError{}
export class TaosResultError extends Error{};



export enum ErrorCode {
    ERR_INVALID_URL,
    ERR_WS_NO_CALLBACK,
    ERR_INVALID_MESSAGE_TYPE,
    ERR_WEBSOCKET_CONNECTION,
    ERR_WEBSOCKET_QUERY_TIMEOUT,
    ERR_INVALID_AUTHENTICATION,
    ERR_UNSPPORTED_TDENGINE_TYPE,
    ERR_CONNECTION_CLOSED,
  }