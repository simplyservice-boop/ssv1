import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';
const { combine, timestamp, printf, colorize, json, errors } = winston.format;
const devFmt = combine(colorize({ all: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => stack ? `${ts} [${level}]: ${message}\n${stack}` : `${ts} [${level}]: ${message}`));
const prodFmt = combine(timestamp(), errors({ stack: true }), json());
const transports: winston.transport[] = [new winston.transports.Console({ format: config.isDev ? devFmt : prodFmt })];
if (config.isProd) {
  transports.push(
    new DailyRotateFile({ filename: 'logs/error-%DATE%.log', datePattern: 'YYYY-MM-DD', level: 'error', maxFiles: '30d', format: prodFmt }),
    new DailyRotateFile({ filename: 'logs/combined-%DATE%.log', datePattern: 'YYYY-MM-DD', maxFiles: '14d', format: prodFmt })
  );
}
export const logger = winston.createLogger({ level: config.isDev ? 'debug' : 'info', transports, exitOnError: false });
export default logger;
