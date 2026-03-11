import { ErrorCode, TDWebSocketClientError } from "./wsError";

export interface HostInfo {
    host: string;
    port: number;
}

export interface ParsedUrl {
    hosts: HostInfo[];
    scheme: string;
    username: string;
    password: string;
    database: string;
    params: Map<string, string>;
}

/**
 * Parse a multi-host TDengine WebSocket URL.
 * Format: ws://user:password@host1:port1,host2:port2,[::1]:port3/db?key=value
 */
export function parseMultiHostUrl(rawUrl: string): ParsedUrl {
    if (!rawUrl || rawUrl.trim().length === 0) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            "URL must not be empty"
        );
    }

    // Extract scheme
    const schemeMatch = rawUrl.match(/^(wss?):\/\//i);
    if (!schemeMatch) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            `Invalid URL scheme, expected ws:// or wss://, got: ${rawUrl}`
        );
    }
    const scheme = schemeMatch[1].toLowerCase();
    let remainder = rawUrl.slice(schemeMatch[0].length);

    // Extract user:password@ if present
    let username = "";
    let password = "";
    const atIndex = remainder.indexOf("@");
    if (atIndex !== -1) {
        const userInfo = remainder.slice(0, atIndex);
        remainder = remainder.slice(atIndex + 1);
        const colonIndex = userInfo.indexOf(":");
        if (colonIndex !== -1) {
            username = userInfo.slice(0, colonIndex);
            password = userInfo.slice(colonIndex + 1);
        } else {
            username = userInfo;
        }
    }

    // Extract query params (after ?)
    let params = new Map<string, string>();
    const queryIndex = remainder.indexOf("?");
    let queryString = "";
    if (queryIndex !== -1) {
        queryString = remainder.slice(queryIndex + 1);
        remainder = remainder.slice(0, queryIndex);
        const searchParams = new URLSearchParams(queryString);
        searchParams.forEach((value, key) => {
            params.set(key, value);
        });
    }

    // Extract database (after /)
    let database = "";
    const pathIndex = remainder.indexOf("/");
    if (pathIndex !== -1) {
        database = remainder.slice(pathIndex + 1);
        remainder = remainder.slice(0, pathIndex);
    }

    // remainder is now the host list: host1:port1,host2:port2,[::1]:port3
    const hosts = parseHostList(remainder);

    if (hosts.length === 0) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            "No hosts found in URL"
        );
    }

    // Deduplicate hosts (preserve order, keep first occurrence)
    const seen = new Set<string>();
    const dedupedHosts: HostInfo[] = [];
    for (const h of hosts) {
        const key = `${h.host}:${h.port}`;
        if (!seen.has(key)) {
            seen.add(key);
            dedupedHosts.push(h);
        }
    }

    return {
        hosts: dedupedHosts,
        scheme,
        username,
        password,
        database,
        params,
    };
}

const DEFAULT_PORT = 6041;

/**
 * Parse comma-separated host list. Supports IPv6 in brackets.
 * Examples: "host1:6041,host2:6042", "[::1]:6041,host2:6042"
 */
function parseHostList(hostString: string): HostInfo[] {
    if (!hostString || hostString.trim().length === 0) {
        return [];
    }

    const hosts: HostInfo[] = [];
    let i = 0;

    while (i < hostString.length) {
        // Skip comma separator
        if (hostString[i] === ",") {
            i++;
            continue;
        }

        if (hostString[i] === "[") {
            // IPv6 address in brackets
            const closeBracket = hostString.indexOf("]", i);
            if (closeBracket === -1) {
                throw new TDWebSocketClientError(
                    ErrorCode.ERR_INVALID_URL,
                    `Unclosed bracket in IPv6 address: ${hostString.slice(i)}`
                );
            }
            const ipv6Host = hostString.slice(i + 1, closeBracket);
            let port = DEFAULT_PORT;
            let next = closeBracket + 1;
            if (next < hostString.length && hostString[next] === ":") {
                const portEnd = hostString.indexOf(",", next);
                const portStr = portEnd === -1
                    ? hostString.slice(next + 1)
                    : hostString.slice(next + 1, portEnd);
                port = parsePort(portStr, hostString);
                i = portEnd === -1 ? hostString.length : portEnd;
            } else {
                i = next;
            }
            hosts.push({ host: `[${ipv6Host}]`, port });
        } else {
            // Regular host or IPv4
            const commaIndex = hostString.indexOf(",", i);
            const segment = commaIndex === -1
                ? hostString.slice(i)
                : hostString.slice(i, commaIndex);

            const lastColon = segment.lastIndexOf(":");
            if (lastColon !== -1) {
                const host = segment.slice(0, lastColon);
                const port = parsePort(segment.slice(lastColon + 1), hostString);
                hosts.push({ host, port });
            } else {
                hosts.push({ host: segment, port: DEFAULT_PORT });
            }
            i = commaIndex === -1 ? hostString.length : commaIndex;
        }
    }

    return hosts;
}

function parsePort(portStr: string, context: string): number {
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            `Invalid port "${portStr}" in host string: ${context}`
        );
    }
    return port;
}

/**
 * Build a single-host URL from parsed components + a specific host.
 * Used by ConnectionManager to create WebSocketConnector URLs.
 */
export function buildHostUrl(
    parsed: ParsedUrl,
    host: HostInfo,
    extraParams?: Map<string, string>
): URL {
    const origin = `${parsed.scheme}://${host.host}:${host.port}`;
    const url = new URL(origin + "/ws");

    if (parsed.username) {
        url.username = parsed.username;
    }
    if (parsed.password) {
        url.password = parsed.password;
    }

    // Copy non-retry params
    const retryParams = new Set(["retries", "retry_backoff_ms", "retry_backoff_max_ms", "resend_write"]);
    parsed.params.forEach((value, key) => {
        if (!retryParams.has(key)) {
            url.searchParams.set(key, value);
        }
    });

    if (extraParams) {
        extraParams.forEach((value, key) => {
            url.searchParams.set(key, value);
        });
    }

    return url;
}

/**
 * Extract retry options from parsed URL params.
 */
export function extractRetryOptions(params: Map<string, string>): {
    retries?: number;
    retryBackoffMs?: number;
    retryBackoffMaxMs?: number;
    resendWrite?: boolean;
} {
    const result: any = {};
    if (params.has("retries")) {
        result.retries = parseInt(params.get("retries")!, 10);
    }
    if (params.has("retry_backoff_ms")) {
        result.retryBackoffMs = parseInt(params.get("retry_backoff_ms")!, 10);
    }
    if (params.has("retry_backoff_max_ms")) {
        result.retryBackoffMaxMs = parseInt(params.get("retry_backoff_max_ms")!, 10);
    }
    if (params.has("resend_write")) {
        const val = params.get("resend_write")!.toLowerCase();
        result.resendWrite = val === "true" || val === "1";
    }
    return result;
}
