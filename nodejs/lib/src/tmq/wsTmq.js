"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsConsumer = void 0;
const config_1 = require("./config");
const constant_1 = require("./constant");
const wsClient_1 = require("../client/wsClient");
const wsError_1 = require("../common/wsError");
const tmqResponse_1 = require("./tmqResponse");
const reqid_1 = require("../common/reqid");
const log_1 = __importDefault(require("../common/log"));
const wsResponse_1 = require("../client/wsResponse");
class WsConsumer {
    constructor(wsConfig) {
        this._wsConfig = new config_1.TmqConfig(wsConfig);
        log_1.default.debug(this._wsConfig);
        this._wsClient = new wsClient_1.WsClient(this._wsConfig.url, this._wsConfig.timeout);
    }
    async init() {
        await this._wsClient.ready();
        return this;
    }
    static async newConsumer(wsConfig) {
        if (wsConfig.size == 0 || !wsConfig.get(constant_1.TMQConstants.WS_URL)) {
            throw new wsError_1.WebSocketInterfaceError(wsError_1.ErrorCode.ERR_INVALID_URL, 'invalid url, password or username needed.');
        }
        let wsConsumer = new WsConsumer(wsConfig);
        return await wsConsumer.init();
    }
    async subscribe(topics, reqId) {
        if (!topics || topics.length == 0) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsTmq Subscribe params is error!');
        }
        let queryMsg = {
            action: constant_1.TMQMessageType.Subscribe,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                user: this._wsConfig.user,
                password: this._wsConfig.password,
                group_id: this._wsConfig.group_id,
                client_id: this._wsConfig.client_id,
                topics: topics,
                offset_rest: this._wsConfig.offset_rest,
                auto_commit: this._wsConfig.auto_commit,
                auto_commit_interval_ms: this._wsConfig.auto_commit_interval_ms
            },
        };
        this._topics = topics;
        return await this._wsClient.exec(JSON.stringify(queryMsg));
    }
    async unsubscribe(reqId) {
        let queryMsg = {
            action: constant_1.TMQMessageType.Unsubscribe,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
            },
        };
        return await this._wsClient.exec(JSON.stringify(queryMsg));
    }
    async poll(timeoutMs, reqId) {
        if (this._wsConfig.auto_commit) {
            if (this._commitTime) {
                let currTime = new Date().getTime();
                let diff = Math.abs(currTime - this._commitTime);
                if (diff >= this._wsConfig.auto_commit_interval_ms) {
                    await this.doCommit();
                    this._commitTime = new Date().getTime();
                }
            }
            else {
                this._commitTime = new Date().getTime();
            }
        }
        return await this.pollData(timeoutMs, reqId);
    }
    async subscription(reqId) {
        let queryMsg = {
            action: constant_1.TMQMessageType.ListTopics,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
            },
        };
        let resp = await this._wsClient.exec(JSON.stringify(queryMsg), false);
        return new tmqResponse_1.SubscriptionResp(resp).topics;
    }
    async commit(reqId) {
        await this.doCommit(reqId);
        return await this.assignment();
    }
    async doCommit(reqId) {
        let queryMsg = {
            action: constant_1.TMQMessageType.Commit,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                message_id: 0
            },
        };
        await this._wsClient.exec(JSON.stringify(queryMsg));
    }
    async committed(partitions, reqId) {
        if (!partitions || partitions.length == 0) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsTmq Positions params is error!');
        }
        let offsets = new Array(partitions.length);
        for (let i = 0; i < partitions.length; i++) {
            offsets[i] = {
                topic: partitions[i].topic,
                vgroup_id: partitions[i].vgroup_id
            };
            offsets[i].vgroup_id = partitions[i].vgroup_id;
        }
        let queryMsg = {
            action: constant_1.TMQMessageType.Committed,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                topic_vgroup_ids: offsets
            },
        };
        let resp = await this._wsClient.exec(JSON.stringify(queryMsg), false);
        return new tmqResponse_1.CommittedResp(resp).setTopicPartitions(offsets);
    }
    async commitOffsets(partitions) {
        if (!partitions || partitions.length == 0) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsTmq CommitOffsets params is error!');
        }
        const allp = [];
        partitions.forEach(e => {
            allp.push(this.commitOffset(e));
        });
        await Promise.all(allp);
        return await this.committed(partitions);
    }
    async commitOffset(partition, reqId) {
        if (!partition) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsTmq CommitOffsets params is error!');
        }
        let queryMsg = {
            action: constant_1.TMQMessageType.CommitOffset,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                vgroup_id: partition.vgroup_id,
                topic: partition.topic,
                offset: partition.offset,
            },
        };
        return await this._wsClient.exec(JSON.stringify(queryMsg));
    }
    async positions(partitions, reqId) {
        if (!partitions || partitions.length == 0) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsTmq Positions params is error!');
        }
        let offsets = new Array(partitions.length);
        for (let i = 0; i < partitions.length; i++) {
            offsets[i] = {
                topic: partitions[i].topic,
                vgroup_id: partitions[i].vgroup_id
            };
            offsets[i].vgroup_id = partitions[i].vgroup_id;
        }
        let queryMsg = {
            action: constant_1.TMQMessageType.Position,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                topic_vgroup_ids: offsets
            },
        };
        let resp = await this._wsClient.exec(JSON.stringify(queryMsg), false);
        return new tmqResponse_1.PartitionsResp(resp).setTopicPartitions(offsets);
    }
    async seek(partition, reqId) {
        if (!partition) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsTmq Seek params is error!');
        }
        let queryMsg = {
            action: constant_1.TMQMessageType.Seek,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                vgroup_id: partition.vgroup_id,
                topic: partition.topic,
                offset: partition.offset,
            },
        };
        return await this._wsClient.exec(JSON.stringify(queryMsg));
    }
    async seekToBeginning(partitions) {
        if (!partitions || partitions.length == 0) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsTmq SeekToBeginning params is error!');
        }
        return await this.seekToBeginOrEnd(partitions);
    }
    async seekToEnd(partitions) {
        if (!partitions || partitions.length == 0) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsTmq SeekToEnd params is error!');
        }
        return await this.seekToBeginOrEnd(partitions, false);
    }
    async close() {
        await this._wsClient.close();
    }
    async fetchBlockData(pollResp, taosResult) {
        let fetchMsg = {
            action: 'fetch_raw_data',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                message_id: pollResp.message_id,
            },
        };
        let jsonStr = JSON.stringify(fetchMsg);
        log_1.default.debug('[wsQueryInterface.fetch.fetchMsg]===>' + jsonStr);
        let result = await this._wsClient.sendMsg(jsonStr);
        let wsResponse = new wsResponse_1.WSFetchBlockResponse(result.msg);
        if (wsResponse && wsResponse.data && wsResponse.blockLen > 0) {
            let wsTmqResponse = new tmqResponse_1.WSTmqFetchBlockInfo(wsResponse.data, taosResult);
            log_1.default.debug('[WSTmqFetchBlockInfo.fetchBlockData]===>' + wsTmqResponse.taosResult);
            if (wsTmqResponse.rows > 0) {
                return true;
            }
        }
        return false;
    }
    async pollData(timeoutMs, reqId) {
        let queryMsg = {
            action: constant_1.TMQMessageType.Poll,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                blocking_time: timeoutMs
            },
        };
        let resp = await this._wsClient.exec(JSON.stringify(queryMsg), false);
        let pollResp = new tmqResponse_1.WsPollResponse(resp);
        let taosResult = new tmqResponse_1.TaosTmqResult(pollResp);
        var taosResults = new Map();
        taosResults.set(pollResp.topic, taosResult);
        if (!pollResp.have_message || pollResp.message_type != constant_1.TMQMessageType.ResDataType) {
            return taosResults;
        }
        let finish = false;
        while (!finish) {
            finish = await this.fetchBlockData(pollResp, taosResult);
        }
        return taosResults;
    }
    async sendAssignmentReq(topic) {
        let queryMsg = {
            action: constant_1.TMQMessageType.GetTopicAssignment,
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                topic: topic
            }
        };
        let resp = await this._wsClient.exec(JSON.stringify(queryMsg), false);
        let assignmentInfo = new tmqResponse_1.AssignmentResp(resp, queryMsg.args.topic);
        return assignmentInfo.topicPartition;
    }
    async assignment(topics) {
        if (!topics || topics.length == 0) {
            topics = this._topics;
        }
        let topicPartitions = [];
        if (topics && topics.length > 0) {
            const allp = [];
            for (let i in topics) {
                allp.push(this.sendAssignmentReq(topics[i]));
            }
            let result = await Promise.all(allp);
            result.forEach(e => {
                topicPartitions.push(...e);
            });
        }
        return topicPartitions;
    }
    async seekToBeginOrEnd(partitions, bBegin = true) {
        let topics = [];
        partitions.forEach(e => {
            topics.push(e.topic);
        });
        let topicPartitions = await this.assignment(topics);
        let itemMap = topicPartitions.reduce((map, obj) => {
            map.set(obj.topic + '_' + obj.vgroup_id, obj);
            return map;
        }, new Map());
        const allp = [];
        for (let i in partitions) {
            if (itemMap.has(partitions[i].topic + '_' + partitions[i].vgroup_id)) {
                let topicPartition = itemMap.get(partitions[i].topic + '_' + partitions[i].vgroup_id);
                if (topicPartition) {
                    if (bBegin) {
                        topicPartition.offset = topicPartition.begin;
                    }
                    else {
                        topicPartition.offset = topicPartition.end;
                    }
                    allp.push(this.seek(topicPartition));
                }
            }
        }
        await Promise.all(allp);
    }
}
exports.WsConsumer = WsConsumer;
