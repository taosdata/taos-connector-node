"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TmqConfig = void 0;
const constant_1 = require("./constant");
class TmqConfig {
    constructor(wsConfig) {
        this.url = new URL(wsConfig.get(constant_1.TMQConstants.WS_URL));
        this.user = wsConfig.get(constant_1.TMQConstants.CONNECT_USER);
        this.password = wsConfig.get(constant_1.TMQConstants.CONNECT_PASS);
        this.group_id = wsConfig.get(constant_1.TMQConstants.GROUP_ID);
        this.client_id = wsConfig.get(constant_1.TMQConstants.CLIENT_ID);
        this.offset_rest = wsConfig.get(constant_1.TMQConstants.AUTO_OFFSET_RESET);
        this.auto_commit = wsConfig.get(constant_1.TMQConstants.ENABLE_AUTO_COMMIT);
        if (!this.auto_commit) {
            this.auto_commit = false;
        }
        this.auto_commit_interval_ms = wsConfig.get(constant_1.TMQConstants.AUTO_COMMIT_INTERVAL_MS);
        if (!this.auto_commit_interval_ms) {
            this.auto_commit_interval_ms = 5 * 1000;
        }
        this.timeout = wsConfig.get(constant_1.TMQConstants.CONNECT_MESSAGE_TIMEOUT);
        if (!this.timeout) {
            this.timeout = 5000;
        }
        if (this.url) {
            if (this.user) {
                this.url.username = this.user;
            }
            else {
                this.user = this.url.username;
            }
            if (this.password) {
                this.url.password = this.password;
            }
            else {
                this.password = this.url.password;
            }
            this.url.pathname = '/rest/tmq';
        }
    }
}
exports.TmqConfig = TmqConfig;
