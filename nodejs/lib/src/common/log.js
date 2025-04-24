"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLevel = void 0;
const winston_1 = __importDefault(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const customFormat = winston_1.default.format.printf(({ level, message, label, timestamp }) => {
    if (message && typeof message === 'object' && typeof message.toJSON === 'function') {
        message = message.toJSON();
    }
    return `${timestamp} [${label}] ${level}: ${message}`;
});
const transport = new winston_daily_rotate_file_1.default({
    filename: './logs/app-%DATE%.log', // Here is the file name template
    datePattern: 'YYYY-MM-DD', // date format
    zippedArchive: true, // Whether to compress the archive file into gzip format
    maxSize: '20m', // Single file size limit
    maxFiles: '14d', // Keep log files for 14 days
    handleExceptions: true, // Whether to handle exceptions
    json: false, // Whether to output logs in JSON format
    format: winston_1.default.format.combine(winston_1.default.format.label({ label: 'node.js websocket' }), winston_1.default.format.timestamp(), customFormat),
    level: 'info', // set log level
});
const logger = winston_1.default.createLogger({
    transports: [transport],
    exitOnError: false, // Do not exit the process when an error occurs
});
function setLevel(level) {
    transport.level = level;
}
exports.setLevel = setLevel;
exports.default = logger;
