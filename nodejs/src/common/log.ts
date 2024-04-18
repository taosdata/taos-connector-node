import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import moment from 'moment-timezone'; 

const customFormat = winston.format.printf(({ timestamp, level, message, label, ...meta }) => {  
    const formattedTime = moment(timestamp).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss.SSS'); // 使用上海时区  
    return `${formattedTime} [${label}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;  
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
        winston.format.timestamp(),
        customFormat
    ),
    level: 'info', // set log level
});

const logger = winston.createLogger({
    transports: [transport],
    exitOnError: false, // Do not exit the process when an error occurs
});

export default logger;
