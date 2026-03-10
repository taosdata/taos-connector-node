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

const DEFAULT_PORT = 6041;
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
    const afterScheme = schemeMatch[0].length; // position after "ws://" or "wss://"

    // Locate host:port section boundaries
    // If user:pass@ exists, @ marks the end of userinfo; host starts after @
    // Otherwise host starts right after "//"
    let username = "";
    let password = "";
    let hostStart: number;

    const atIndex = urlStr.indexOf("@", afterScheme);
    if (atIndex !== -1) {
        // Verify @ comes before any / or ? (i.e. it's part of userinfo, not path)
        const slashIndex = urlStr.indexOf("/", afterScheme);
        const questionIndex = urlStr.indexOf("?", afterScheme);
        const pathStart = Math.min(
            slashIndex === -1 ? urlStr.length : slashIndex,
            questionIndex === -1 ? urlStr.length : questionIndex
        );
        if (atIndex < pathStart) {
            const userInfo = urlStr.slice(afterScheme, atIndex);
            const colonIndex = userInfo.indexOf(":");
            if (colonIndex !== -1) {
                username = userInfo.slice(0, colonIndex);
                password = userInfo.slice(colonIndex + 1);
            } else {
                username = userInfo;
            }
            hostStart = atIndex + 1;
        } else {
            // @ is in path/query, not userinfo
            hostStart = afterScheme;
        }
    } else {
        hostStart = afterScheme;
    }

    // Find end of host:port section: first "/" or "?" after hostStart
    // For IPv6 brackets we only need to skip content inside []
    let hostEnd = urlStr.length;
    let inBracket = false;
    for (let i = hostStart; i < urlStr.length; i++) {
        const ch = urlStr[i];
        if (ch === "[") inBracket = true;
        else if (ch === "]") inBracket = false;
        else if ((ch === "/" || ch === "?") && !inBracket) {
            hostEnd = i;
            break;
        }
    }

    const hostPart = urlStr.slice(hostStart, hostEnd);
    const remaining = urlStr.slice(hostEnd);

    // Parse hosts from the comma-separated host:port section
    const hosts = parseHosts(hostPart);
    if (hosts.length === 0) {
        throw new TDWebSocketClientError(
            ErrorCode.ERR_INVALID_URL,
            `No valid host found in URL: ${urlStr}`
        );
    }

    // Parse path and query from remaining
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
 * Parse comma-separated host:port entries.
 * Supports: hostname:port, IPv4:port, [IPv6]:port
 * If port is omitted, defaults to 6041.
 */
function parseHosts(hostPart: string): HostPort[] {
    if (!hostPart) return [];

    const results: HostPort[] = [];
    // Split by comma, respecting brackets
    const segments = splitByComma(hostPart);

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
            // IPv4 or hostname: use lastIndexOf(":") to find port separator
            const lastColon = trimmed.lastIndexOf(":");
            if (lastColon === -1) {
                results.push({ host: trimmed, port: DEFAULT_PORT });
            } else {
                const host = trimmed.slice(0, lastColon);
                const portStr = trimmed.slice(lastColon + 1);
                const port = parseInt(portStr, 10);
                if (isNaN(port)) {
                    results.push({ host: trimmed, port: DEFAULT_PORT });
                } else {
                    results.push({ host, port });
                }
            }
        }
    }

    return results;
}

/** Split string by commas, but not inside [] brackets. */
function splitByComma(str: string): string[] {
    const segments: string[] = [];
    let current = "";
    let inBracket = false;
    for (const ch of str) {
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
