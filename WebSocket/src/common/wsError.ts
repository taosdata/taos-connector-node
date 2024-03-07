export class TDWebSocketClientError extends Error {
     code:number = 0;
     constructor(code:number, message: string = '') {
      super(message);
      this.name = new.target.name;
      this.code = code
      if (typeof (Error as any).captureStackTrace === 'function') {
        (Error as any).captureStackTrace(this, new.target);
      }
      if (typeof Object.setPrototypeOf === 'function') {
        Object.setPrototypeOf(this, new.target.prototype);
      } else {
        (this as any).__proto__ = new.target.prototype;
      }
    }
}
export class WebSocketQueryError extends TDWebSocketClientError { }
export class WebSocketInterfaceError extends TDWebSocketClientError {}
export class WebSocketQueryInterFaceError extends WebSocketInterfaceError{}
export class TaosResultError extends TDWebSocketClientError{};



export enum ErrorCode {
   ERR_INVALID_PARAMS,
   ERR_INVALID_URL,
   ERR_WS_NO_CALLBACK,
   ERR_INVALID_MESSAGE_TYPE,
   ERR_WEBSOCKET_CONNECTION,
   ERR_WEBSOCKET_QUERY_TIMEOUT,
   ERR_INVALID_AUTHENTICATION,
   ERR_UNSPPORTED_TDENGINE_TYPE,
   ERR_CONNECTION_CLOSED,
   ERR_INVALID_FETCH_MESSAGE_DATA,
   ERR_PARTITIONS_TOPIC_VGROUP_LENGTH_NOT_EQUAL,
}