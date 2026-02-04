import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export function redactMessage(msg: any): any {
    if (typeof msg === "string") {
        return msg
            .replace(/("password"\s*:\s*")([^"]*)(")/gi, '$1[REDACTED]$3')
            .replace(/(token=)([^&\s]+)/gi, "$1[REDACTED]")
            .replace(/(\/\/[^:@\s]+:)([^@/\s]+)(@)/gi, "$1[REDACTED]$3");
    }
    if (msg && typeof msg === "object") {
        const clone: any = Array.isArray(msg) ? [] : {};
        for (const [k, v] of Object.entries(msg)) {
            if (["password", "token", "bearer_token"].includes(k.toLowerCase())) {
                clone[k] = "[REDACTED]";
            } else {
                clone[k] = redactMessage(v);
            }
        }
        return clone;
    }
    return msg;
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
