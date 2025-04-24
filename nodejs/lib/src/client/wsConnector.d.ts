export declare class WebSocketConnector {
    private _wsConn;
    private _wsURL;
    _timeout: number;
    constructor(url: URL, timeout: number | undefined | null);
    ready(): Promise<unknown>;
    private _onclose;
    private _onmessage;
    close(): void;
    readyState(): number;
    sendMsgNoResp(message: string): Promise<void>;
    sendMsg(message: string, register?: Boolean): Promise<unknown>;
    sendBinaryMsg(reqId: bigint, action: string, message: ArrayBuffer, register?: Boolean): Promise<unknown>;
    configTimeout(ms: number): void;
    getWsURL(): URL;
}
//# sourceMappingURL=wsConnector.d.ts.map