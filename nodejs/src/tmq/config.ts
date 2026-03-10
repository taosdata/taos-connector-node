import { TMQConstants } from "./constant";
import { parseMultiAddressUrl, buildUrlForHost, ParsedMultiAddress } from "../common/urlParser";

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
    parsedMultiAddress: ParsedMultiAddress | null = null;

    constructor(wsConfig: Map<string, any>) {
        this.otherConfigs = new Map();
        let rawUrl: string | null = null;
        for (const [key, value] of wsConfig) {
            switch (key) {
                case TMQConstants.WS_URL:
                    rawUrl = value;
                    break;
                case TMQConstants.CONNECT_USER:
                    this.user = value;
                    break;
                case TMQConstants.CONNECT_PASS:
                    this.password = value;
                    break;
                case TMQConstants.CONNECT_TOKEN:
                    this.token = value;
                    this.otherConfigs.set(key, value);
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

        if (rawUrl) {
            // Parse multi-address URL
            const parsed = parseMultiAddressUrl(rawUrl);
            this.parsedMultiAddress = parsed;

            // Build URL from first host for compatibility
            this.url = buildUrlForHost(parsed, 0);

            if (this.user) {
                this.url.username = this.user;
                parsed.username = this.user;
            } else {
                this.user = this.url.username;
            }

            if (this.password) {
                this.url.password = this.password;
                parsed.password = this.password;
            } else {
                this.password = this.url.password;
            }
            if (this.token) {
                this.url.searchParams.set("bearer_token", this.token);
                parsed.searchParams.set("bearer_token", this.token);
            } else {
                const bearerToken = this.url.searchParams.get("bearer_token");
                if (bearerToken) {
                    this.token = bearerToken;
                    this.otherConfigs.set(TMQConstants.CONNECT_TOKEN, bearerToken);
                } else {
                    this.url.searchParams.delete("bearer_token");
                }
            }

            this.sql_url = new URL(this.url.toString());
            this.sql_url.pathname = "/ws";
            this.url.pathname = "/rest/tmq";
        }
    }
}
