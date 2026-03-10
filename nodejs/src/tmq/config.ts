import { TMQConstants } from "./constant";
import { parseMultiAddressUrl, buildUrlForHost, ParsedMultiAddress } from "../common/urlParser";

export class TmqConfig {
    url: string | null = null;
    sql_url: string | null = null;
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

            if (this.user) {
                parsed.username = this.user;
            } else {
                this.user = parsed.username || null;
            }

            if (this.password) {
                parsed.password = this.password;
            } else {
                this.password = parsed.password || null;
            }
            if (this.token) {
                parsed.searchParams.set("bearer_token", this.token);
            } else {
                const bearerToken = parsed.searchParams.get("bearer_token");
                if (bearerToken) {
                    this.token = bearerToken;
                    this.otherConfigs.set(TMQConstants.CONNECT_TOKEN, bearerToken);
                } else {
                    parsed.searchParams.delete("bearer_token");
                }
            }

            // Build the multi-address URL strings for TMQ and SQL endpoints
            const buildMultiAddrUrl = (parsed: ParsedMultiAddress): string => {
                if (parsed.hosts.length > 1) {
                    const hosts = parsed.hosts.map(hp => {
                        const isIPv6 = hp.host.includes(":");
                        return isIPv6 ? `[${hp.host}]:${hp.port}` : `${hp.host}:${hp.port}`;
                    }).join(",");
                    let result = `${parsed.scheme}://`;
                    if (parsed.username || parsed.password) {
                        result += `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`;
                    }
                    result += hosts + parsed.pathname;
                    const search = parsed.searchParams.toString();
                    if (search) result += "?" + search;
                    return result;
                }
                return buildUrlForHost(parsed, 0).toString();
            };

            // SQL endpoint
            const sqlParsed = { ...parsed, pathname: "/ws" };
            this.sql_url = buildMultiAddrUrl(sqlParsed);

            // TMQ endpoint
            parsed.pathname = "/rest/tmq";
            this.url = buildMultiAddrUrl(parsed);
        }
    }
}
