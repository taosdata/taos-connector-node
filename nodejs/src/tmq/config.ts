import { TMQConstants } from "./constant";

export class TmqConfig {
    url: URL | null = null;
    sql_url: URL | null = null;
    user: string | null = null;
    password: string | null = null;
    token: string | null = null;
    group_id: string | null = null;
    client_id: string | null = null;
    offset_rest: string | null = null;
    topics?: Array<string>;
    auto_commit: boolean = true;
    auto_commit_interval_ms: number = 5 * 1000;
    timeout: number = 5000;
    otherConfigs: Map<string, any>;

    constructor(wsConfig: Map<string, any>) {
        this.otherConfigs = new Map();
        for (const [key, value] of wsConfig) {
            switch (key) {
                case TMQConstants.WS_URL:
                    this.url = new URL(value);
                    break;
                case TMQConstants.CONNECT_USER:
                    this.user = value;
                    break;
                case TMQConstants.CONNECT_PASS:
                    this.password = value;
                    break;
                case TMQConstants.CONNECT_TOKEN:
                    this.token = value;
                    break;
                case TMQConstants.GROUP_ID:
                    this.group_id = value;
                    break;
                case TMQConstants.CLIENT_ID:
                    this.client_id = value;
                    break;
                case TMQConstants.AUTO_OFFSET_RESET:
                    this.offset_rest = value;
                    break;
                case TMQConstants.ENABLE_AUTO_COMMIT:
                    this.auto_commit = value;
                    break;
                case TMQConstants.AUTO_COMMIT_INTERVAL_MS:
                    this.auto_commit_interval_ms = value;
                    break;
                case TMQConstants.CONNECT_MESSAGE_TIMEOUT:
                    this.timeout = value;
                    break;
                default:
                    this.otherConfigs.set(key, value);
            }
        }

        if (this.url) {
            if (this.user) {
                this.url.username = this.user;
            } else {
                this.user = this.url.username;
            }
            if (this.password) {
                this.url.password = this.password;
            } else {
                this.password = this.url.password;
            }
            if (this.token) {
                this.url.searchParams.set("bearer_token", this.token);
            } else {
                const bearerToken = this.url.searchParams.get("bearer_token");
                if (bearerToken) {
                    this.token = bearerToken;
                } else {
                    this.url.searchParams.delete("bearer_token");
                }
            }

            this.sql_url = new URL(this.url);
            this.sql_url.pathname = "/ws";
            this.url.pathname = "/rest/tmq";
        }
    }
}
