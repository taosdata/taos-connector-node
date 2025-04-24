export declare class TMQConstants {
    static GROUP_ID: string;
    static CLIENT_ID: string;
    /**
     * auto commit default is true then the commitCallback function will be called after 5 seconds
     */
    static ENABLE_AUTO_COMMIT: string;
    /**
     * commit interval. unit milliseconds
     */
    static AUTO_COMMIT_INTERVAL_MS: string;
    /**
     * only valid in first group id create.
     */
    static AUTO_OFFSET_RESET: string;
    /**
     * whether poll result include table name. suggest always true
     */
    static MSG_WITH_TABLE_NAME: string;
    /**
     * indicate host and port of connection
     */
    static BOOTSTRAP_SERVERS: string;
    /**
     * deserializer Bean
     */
    static VALUE_DESERIALIZER: string;
    /**
     * encode for deserializer String value
     */
    static VALUE_DESERIALIZER_ENCODING: string;
    /**
     * connection ip
     */
    static CONNECT_IP: string;
    /**
     * connection port
     */
    static CONNECT_PORT: string;
    /**
     * connection username
     */
    static CONNECT_USER: string;
    /**
     * connection password
     */
    static CONNECT_PASS: string;
    /**
     * connect type websocket or jni, default is jni
     */
    static CONNECT_TYPE: string;
    /**
     * Key used to retrieve the token value from the properties instance passed to
     * the driver.
     * Just for Cloud Service
     */
    static WS_URL: string;
    /**
     * the timeout in milliseconds until a connection is established.
     * zero is interpreted as an infinite timeout.
     * only valid in websocket
     */
    static CONNECT_TIMEOUT: string;
    /**
     * message receive from server timeout. ms.
     * only valid in websocket
     */
    static CONNECT_MESSAGE_TIMEOUT: string;
}
export declare class TMQMessageType {
    static Subscribe: string;
    static Poll: string;
    static FetchRaw: string;
    static FetchJsonMeta: string;
    static Commit: string;
    static Unsubscribe: string;
    static GetTopicAssignment: string;
    static Seek: string;
    static CommitOffset: string;
    static Committed: string;
    static Position: string;
    static ListTopics: string;
    static ResDataType: number;
}
export declare class TMQBlockInfo {
    rawBlock?: ArrayBuffer;
    precision?: number;
    schema: Array<TMQRawDataSchema>;
    tableName?: string;
    constructor();
}
export declare class TMQRawDataSchema {
    colType: number;
    flag: number;
    bytes: bigint;
    colID: number;
    name: string;
    constructor();
}
//# sourceMappingURL=constant.d.ts.map