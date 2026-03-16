import { ErrorCode, TDWebSocketClientError } from "./wsError";

export interface Address {
    host: string;
    port: number;
}

export interface Dsn {
    scheme: string;
    username: string;
    password: string;
    addresses: Address[];
    database: string;
    params: Map<string, string>;
}

/**
 * Parse a multi-host TDengine WebSocket URL.
 * Format: ws://username:password@host1:port1,host2:port2,[::1]:port3/db?key=value
 */
export function parse(url: string): Dsn {
    if (!url || url.trim().length === 0) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            "URL must not be empty"
        );
    }

    // Extract scheme
    const schemeMatch = url.match(/^(wss?):\/\//i);
    if (!schemeMatch) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            `Invalid URL scheme, expected ws:// or wss://, got: ${url}`
        );
    }
    const scheme = schemeMatch[1].toLowerCase();
    let remainder = url.slice(schemeMatch[0].length);

    // Extract username:password@ if present
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
    const dedupedHosts: Address[] = [];
    for (const h of hosts) {
        const key = `${h.host}:${h.port}`;
        if (!seen.has(key)) {
            seen.add(key);
            dedupedHosts.push(h);
        }
    }

    return {
        addresses: dedupedHosts,
        scheme,
        username,
        password,
        database,
        params,
    };
}

export const DEFAULT_PORT = 6041;
export const CLOUD_DEFAULT_PORT = 443;

export function isCloudServiceHost(host: string): boolean {
    const normalizedHost = host.toLowerCase();
    return (
        normalizedHost.includes("cloud.tdengine.com") ||
        normalizedHost.includes("cloud.taosdata.com")
    );
}

export function getDefaultPortForHost(host: string): number {
    return isCloudServiceHost(host) ? CLOUD_DEFAULT_PORT : DEFAULT_PORT;
}

/**
 * Parse comma-separated host list. Supports IPv6 in brackets.
 * Examples: "host1:6041,host2:6042", "[::1]:6041,host2:6042"
 */
function parseHostList(hostStr: string): Address[] {
    if (!hostStr || hostStr.trim().length === 0) {
        return [];
    }

    const hosts: Address[] = [];
    let i = 0;

    while (i < hostStr.length) {
        // Skip comma separator
        if (hostStr[i] === ",") {
            i++;
            continue;
        }

        if (hostStr[i] === "[") {
            // IPv6 address in brackets
            const closeBracket = hostStr.indexOf("]", i);
            if (closeBracket === -1) {
                throw new TDWebSocketClientError(
                    ErrorCode.ERR_INVALID_URL,
                    `Unclosed bracket in IPv6 address: ${hostStr.slice(i)}`
                );
            }
            const ipv6Host = hostStr.slice(i + 1, closeBracket);
            let port = getDefaultPortForHost(ipv6Host);
            let next = closeBracket + 1;
            if (next < hostStr.length && hostStr[next] === ":") {
                const portEnd = hostStr.indexOf(",", next);
                const portStr = portEnd === -1
                    ? hostStr.slice(next + 1)
                    : hostStr.slice(next + 1, portEnd);
                port = parsePort(portStr, hostStr, ipv6Host);
                i = portEnd === -1 ? hostStr.length : portEnd;
            } else {
                i = next;
            }
            hosts.push({ host: `[${ipv6Host}]`, port });
        } else {
            // Regular host or IPv4
            const commaIndex = hostStr.indexOf(",", i);
            const segment = commaIndex === -1
                ? hostStr.slice(i)
                : hostStr.slice(i, commaIndex);

            const lastColon = segment.lastIndexOf(":");
            if (lastColon !== -1) {
                const host = segment.slice(0, lastColon);
                const port = parsePort(segment.slice(lastColon + 1), hostStr, host);
                hosts.push({ host, port });
            } else {
                hosts.push({ host: segment, port: getDefaultPortForHost(segment) });
            }
            i = commaIndex === -1 ? hostStr.length : commaIndex;
        }
    }

    return hosts;
}

function parsePort(portStr: string, context: string, hostForDefault?: string): number {
    // If port string is empty, use default port
    if (portStr.length === 0) {
        if (hostForDefault) {
            return getDefaultPortForHost(hostForDefault);
        }
        return DEFAULT_PORT;
    }
    // Validate that port string contains only digits
    if (!/^\d+$/.test(portStr)) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            `Invalid port "${portStr}" in host string: ${context}`
        );
    }
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            `Invalid port "${portStr}" in host string: ${context}`
        );
    }
    return port;
}
