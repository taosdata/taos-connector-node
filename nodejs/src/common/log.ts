import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import moment from 'moment-timezone'; 

const customFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {  
    const formattedTime = moment(timestamp).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss.SSS'); // 使用上海时区  
    return `${formattedTime} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;  
});

const transport = new DailyRotateFile({
    filename: './logs/app-%DATE%.log', // Here is the file name template
    datePattern: 'YYYY-MM-DD', // date format
    zippedArchive: true, // Whether to compress the archive file into gzip format
    maxSize: '20m', // Single file size limit
    maxFiles: '14d', // Keep log files for 14 days
    handleExceptions: true, // Whether to handle exceptions
    json: false, // Whether to output logs in JSON format
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
    ),
    level: 'info', // set log level
});

const logger = winston.createLogger({
    transports: [transport],
    exitOnError: false, // Do not exit the process when an error occurs
});

// 设置 BigInt 类型的序列化处理
transport.format = winston.format((info) => {
    if (info && info.message && typeof info.message === 'object' && typeof info.message.toJSON === 'function') {   
        info.message = info.message.toJSON();
    }
    return info;
  })();

export function setLevel(level:string) {
    transport.level = level
}

export default logger;
