import { ErrorCode, TDWebSocketClientError } from "./wsError";

export interface HostPort {
    host: string;
    port: number;
}

export interface ParsedMultiAddress {
    scheme: string;
    username: string;
    password: string;
    hosts: HostPort[];
    pathname: string;
    searchParams: URLSearchParams;
    retries: number;
    retryBackoffMs: number;
    retryBackoffMaxMs: number;
}

const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_BACKOFF_MS = 200;
const DEFAULT_RETRY_BACKOFF_MAX_MS = 2000;

/**
 * Parse a multi-address URL string.
 * Format: ws://user:pass@host1:port1,host2:port2,[::1]:port3/path?key=val
 * Supports IPv4, IPv6 (bracketed), and hostnames.
 */
export function parseMultiAddressUrl(urlStr: string): ParsedMultiAddress {
    if (!urlStr) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            "URL string is empty"
        );
    }

    // Extract scheme
    const schemeMatch = urlStr.match(/^(wss?):\/\//i);
    if (!schemeMatch) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            `Invalid URL scheme: ${urlStr}`
        );
    }
    const scheme = schemeMatch[1].toLowerCase();
    let remaining = urlStr.slice(schemeMatch[0].length);

    // Extract userinfo (user:pass@)
    let username = "";
    let password = "";
    const atIndex = findUserInfoEnd(remaining);
    if (atIndex !== -1) {
        const userInfo = remaining.slice(0, atIndex);
        remaining = remaining.slice(atIndex + 1);
        const colonIndex = userInfo.indexOf(":");
        if (colonIndex !== -1) {
            username = userInfo.slice(0, colonIndex);
            password = userInfo.slice(colonIndex + 1);
        } else {
            username = userInfo;
        }
    }

    // Split host part from path+query
    // Find the first '/' or '?' that is NOT inside brackets
    let hostEnd = findHostEnd(remaining);
    const hostPart = remaining.slice(0, hostEnd);
    remaining = remaining.slice(hostEnd);

    // Parse hosts
    const hosts = parseHosts(hostPart);
    if (hosts.length === 0) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            `No valid host found in URL: ${urlStr}`
        );
    }

    // Parse path and query
    let pathname = "/";
    let search = "";
    const queryIndex = remaining.indexOf("?");
    if (queryIndex !== -1) {
        pathname = remaining.slice(0, queryIndex) || "/";
        search = remaining.slice(queryIndex + 1);
    } else {
        pathname = remaining || "/";
    }

    const searchParams = new URLSearchParams(search);

    // Extract failover params
    const retries = extractIntParam(searchParams, "retries", DEFAULT_RETRIES);
    const retryBackoffMs = extractIntParam(searchParams, "retry_backoff_ms", DEFAULT_RETRY_BACKOFF_MS);
    const retryBackoffMaxMs = extractIntParam(searchParams, "retry_backoff_max_ms", DEFAULT_RETRY_BACKOFF_MAX_MS);

    // Remove failover params from searchParams so they don't leak to ws URL
    searchParams.delete("retries");
    searchParams.delete("retry_backoff_ms");
    searchParams.delete("retry_backoff_max_ms");

    return {
        scheme,
        username,
        password,
        hosts,
        pathname,
        searchParams,
        retries,
        retryBackoffMs,
        retryBackoffMaxMs,
    };
}

/**
 * Build a standard URL object for a specific host index from ParsedMultiAddress.
 */
export function buildUrlForHost(parsed: ParsedMultiAddress, hostIndex: number): URL {
    const hp = parsed.hosts[hostIndex];
    const isIPv6 = hp.host.includes(":");
    const hostStr = isIPv6 ? `[${hp.host}]` : hp.host;
    const base = `${parsed.scheme}://${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@${hostStr}:${hp.port}${parsed.pathname}`;
    const url = new URL(base);
    parsed.searchParams.forEach((value, key) => {
        url.searchParams.set(key, value);
    });
    return url;
}

/**
 * Find the '@' that ends userinfo. Must not be inside [] brackets.
 */
function findUserInfoEnd(str: string): number {
    let inBracket = false;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === "[") inBracket = true;
        else if (ch === "]") inBracket = false;
        else if (ch === "@" && !inBracket) return i;
        else if (ch === "/" || ch === "?" || ch === "#") {
            // No userinfo
            return -1;
        }
    }
    return -1;
}

/**
 * Find where the host section ends (first '/' or '?' not inside brackets).
 */
function findHostEnd(str: string): number {
    let inBracket = false;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === "[") inBracket = true;
        else if (ch === "]") inBracket = false;
        else if ((ch === "/" || ch === "?") && !inBracket) return i;
    }
    return str.length;
}

/**
 * Parse comma-separated host:port entries.
 * Supports: hostname:port, IPv4:port, [IPv6]:port
 * If port is omitted, defaults to 6041.
 */
function parseHosts(hostPart: string): HostPort[] {
    if (!hostPart) return [];

    const results: HostPort[] = [];
    const DEFAULT_PORT = 6041;

    // Split by comma, respecting brackets
    const segments = splitHostSegments(hostPart);

    for (const seg of segments) {
        const trimmed = seg.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("[")) {
            // IPv6: [::1]:port or [::1]
            const closeBracket = trimmed.indexOf("]");
            if (closeBracket === -1) {
                throw new TDWebSocketClientError(
                    ErrorCode.ERR_INVALID_URL,
                    `Invalid IPv6 address: ${trimmed}`
                );
            }
            const host = trimmed.slice(1, closeBracket);
            const afterBracket = trimmed.slice(closeBracket + 1);
            let port = DEFAULT_PORT;
            if (afterBracket.startsWith(":")) {
                port = parseInt(afterBracket.slice(1), 10);
                if (isNaN(port)) {
                    throw new TDWebSocketClientError(
                        ErrorCode.ERR_INVALID_URL,
                        `Invalid port in: ${trimmed}`
                    );
                }
            }
            results.push({ host, port });
        } else {
            // IPv4 or hostname
            const lastColon = trimmed.lastIndexOf(":");
            if (lastColon === -1) {
                results.push({ host: trimmed, port: DEFAULT_PORT });
            } else {
                const host = trimmed.slice(0, lastColon);
                const portStr = trimmed.slice(lastColon + 1);
                const port = parseInt(portStr, 10);
                if (isNaN(port)) {
                    // Might be hostname without port that contains something odd, treat whole as host
                    results.push({ host: trimmed, port: DEFAULT_PORT });
                } else {
                    results.push({ host, port });
                }
            }
        }
    }

    return results;
}

/**
 * Split host part by commas, but not inside brackets.
 */
function splitHostSegments(hostPart: string): string[] {
    const segments: string[] = [];
    let current = "";
    let inBracket = false;
    for (const ch of hostPart) {
        if (ch === "[") inBracket = true;
        else if (ch === "]") inBracket = false;
        if (ch === "," && !inBracket) {
            segments.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    if (current) segments.push(current);
    return segments;
}

function extractIntParam(params: URLSearchParams, key: string, defaultVal: number): number {
    const val = params.get(key);
    if (val === null) return defaultVal;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultVal : parsed;
}
