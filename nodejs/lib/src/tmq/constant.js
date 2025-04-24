"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TMQRawDataSchema = exports.TMQBlockInfo = exports.TMQMessageType = exports.TMQConstants = void 0;
class TMQConstants {
}
exports.TMQConstants = TMQConstants;
TMQConstants.GROUP_ID = 'group.id';
TMQConstants.CLIENT_ID = 'client.id';
/**
 * auto commit default is true then the commitCallback function will be called after 5 seconds
 */
TMQConstants.ENABLE_AUTO_COMMIT = 'enable.auto.commit';
/**
 * commit interval. unit milliseconds
 */
TMQConstants.AUTO_COMMIT_INTERVAL_MS = 'auto.commit.interval.ms';
/**
 * only valid in first group id create.
 */
TMQConstants.AUTO_OFFSET_RESET = 'auto.offset.reset';
/**
 * whether poll result include table name. suggest always true
 */
TMQConstants.MSG_WITH_TABLE_NAME = 'msg.with.table.name';
/**
 * indicate host and port of connection
 */
TMQConstants.BOOTSTRAP_SERVERS = 'bootstrap.servers';
/**
 * deserializer Bean
 */
TMQConstants.VALUE_DESERIALIZER = 'value.deserializer';
/**
 * encode for deserializer String value
 */
TMQConstants.VALUE_DESERIALIZER_ENCODING = 'value.deserializer.encoding';
/**
 * connection ip
 */
TMQConstants.CONNECT_IP = 'td.connect.ip';
/**
 * connection port
 */
TMQConstants.CONNECT_PORT = 'td.connect.port';
/**
 * connection username
 */
TMQConstants.CONNECT_USER = 'td.connect.user';
/**
 * connection password
 */
TMQConstants.CONNECT_PASS = 'td.connect.pass';
/**
 * connect type websocket or jni, default is jni
 */
TMQConstants.CONNECT_TYPE = 'td.connect.type';
/**
 * Key used to retrieve the token value from the properties instance passed to
 * the driver.
 * Just for Cloud Service
 */
TMQConstants.WS_URL = 'ws.url';
/**
 * the timeout in milliseconds until a connection is established.
 * zero is interpreted as an infinite timeout.
 * only valid in websocket
 */
TMQConstants.CONNECT_TIMEOUT = 'httpConnectTimeout';
/**
 * message receive from server timeout. ms.
 * only valid in websocket
 */
TMQConstants.CONNECT_MESSAGE_TIMEOUT = 'messageWaitTimeout';
class TMQMessageType {
}
exports.TMQMessageType = TMQMessageType;
TMQMessageType.Subscribe = 'subscribe';
TMQMessageType.Poll = 'poll';
TMQMessageType.FetchRaw = 'fetch_raw';
TMQMessageType.FetchJsonMeta = 'fetch_json_meta';
TMQMessageType.Commit = 'commit';
TMQMessageType.Unsubscribe = 'unsubscribe';
TMQMessageType.GetTopicAssignment = 'assignment';
TMQMessageType.Seek = 'seek';
TMQMessageType.CommitOffset = 'commit_offset';
TMQMessageType.Committed = 'committed';
TMQMessageType.Position = 'position';
TMQMessageType.ListTopics = "list_topics";
TMQMessageType.ResDataType = 1;
class TMQBlockInfo {
    constructor() {
        this.schema = [];
    }
}
exports.TMQBlockInfo = TMQBlockInfo;
class TMQRawDataSchema {
    constructor() {
        this.bytes = BigInt(0);
        this.colID = -1;
        this.colType = -1;
        this.flag = -1;
        this.name = "";
    }
}
exports.TMQRawDataSchema = TMQRawDataSchema;
