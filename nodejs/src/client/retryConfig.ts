import { Dsn } from "../common/dsn";

const DEFAULT_RETRIES = 5;
const DEFAULT_BACKOFF_MS = 200;
const DEFAULT_BACKOFF_MAX_MS = 2000;

function parseNonNegativeInt(
    value: string | undefined | null,
    fallback: number
): number {
    if (value === undefined || value === null || value.length === 0) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
}

function parsePositiveInt(
    value: string | undefined | null,
    fallback: number
): number {
    if (value === undefined || value === null || value.length === 0) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

export class RetryConfig {
    readonly retries: number;
    readonly retryBackoffMs: number;
    readonly retryBackoffMaxMs: number;

    constructor(retries: number, retryBackoffMs: number, retryBackoffMaxMs: number) {
        this.retries = retries;
        this.retryBackoffMs = retryBackoffMs;
        this.retryBackoffMaxMs = Math.max(retryBackoffMs, retryBackoffMaxMs);
    }

    getBackoffDelay(attempt: number): number {
        const safeAttempt = Math.max(0, attempt);
        const rawDelay = this.retryBackoffMs * Math.pow(2, safeAttempt);
        const finiteDelay = Number.isFinite(rawDelay) ? rawDelay : this.retryBackoffMaxMs;
        return Math.min(finiteDelay, this.retryBackoffMaxMs);
    }

    static fromDsn(dsn: Dsn): RetryConfig {
        const retries = parseNonNegativeInt(
            dsn.params.get("retries"),
            DEFAULT_RETRIES
        );
        const retryBackoffMs = parsePositiveInt(
            dsn.params.get("retry_backoff_ms"),
            DEFAULT_BACKOFF_MS
        );
        const retryBackoffMaxMs = parsePositiveInt(
            dsn.params.get("retry_backoff_max_ms"),
            DEFAULT_BACKOFF_MAX_MS
        );
        return new RetryConfig(retries, retryBackoffMs, retryBackoffMaxMs);
    }
}
