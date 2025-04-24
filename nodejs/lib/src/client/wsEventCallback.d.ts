interface MessageId {
    action: string;
    req_id: bigint;
    id?: bigint;
    timeout?: number;
}
export declare enum OnMessageType {
    MESSAGE_TYPE_ARRAYBUFFER = 1,
    MESSAGE_TYPE_BLOB = 2,
    MESSAGE_TYPE_STRING = 3,
    MESSAGE_TYPE_CONNECTION = 4
}
export declare class WsEventCallback {
    private static _instance?;
    private static _msgActionRegister;
    private constructor();
    static instance(): WsEventCallback;
    registerCallback(id: MessageId, res: (args: unknown) => void, rej: (reason: any) => void): Promise<void>;
    handleEventCallback(msg: MessageId, messageType: OnMessageType, data: any): Promise<void>;
}
export {};
//# sourceMappingURL=wsEventCallback.d.ts.map