import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export function redactMessage(msg: any): any {
    const seen = new WeakSet();
    function redact(val: any): any {
        if (typeof val === "string") {
            return val
                .replace(/("password"\s*:\s*")([^"]*)(")/gi, '$1[REDACTED]$3')
                .replace(/((?:bearer_)?token=)([^&\s]+)/gi, "$1[REDACTED]")
                .replace(/(\/\/[^:@\s]*:)([^@\/\s]+)(@)/gi, "$1[REDACTED]$3");
        }
        if (val instanceof URL) {
            const url = new URL(val.href);
            if (url.password) url.password = '[REDACTED]';
            return url;
        }
        if (val && typeof val === "object") {
            if (seen.has(val)) {
                return "[Circular]";
            }
            seen.add(val);
            const clone: any = Array.isArray(val) ? [] : {};
            for (const [k, v] of Object.entries(val)) {
                if (["password", "token", "bearer_token"].includes(k.toLowerCase())) {
                    clone[k] = "[REDACTED]";
                } else {
                    clone[k] = redact(v);
                }
            }
            return clone;
        }
        return val;
    }
    return redact(msg);
}

const customFormat = winston.format.printf(
    ({ level, message, label, timestamp }) => {
        if (
            message &&
            typeof message === "object" &&
            typeof (message as any).toJSON === "function"
        ) {
            message = (message as any).toJSON();
        }
        message = redactMessage(message);
        // const messageStr = (message && typeof message === "object") ? JSON.stringify(message) : message;
        return `${timestamp} [${label}] ${level}: ${message}`;
    }
);

const transport = new DailyRotateFile({
    filename: "./logs/app-%DATE%.log", // Here is the file name template
    datePattern: "YYYY-MM-DD", // date format
    zippedArchive: true, // Whether to compress the archive file into gzip format
    maxSize: "20m", // Single file size limit
    maxFiles: "14d", // Keep log files for 14 days
    handleExceptions: true, // Whether to handle exceptions
    json: false, // Whether to output logs in JSON format
    format: winston.format.combine(
        winston.format.label({ label: "node.js websocket" }),
        winston.format.timestamp(),
        customFormat
    ),
    level: "info", // set log level
});

const logger = winston.createLogger({
    transports: [transport],
    exitOnError: false, // Do not exit the process when an error occurs
});

export function setLevel(level: string) {
    transport.level = level;
}

export default logger;
