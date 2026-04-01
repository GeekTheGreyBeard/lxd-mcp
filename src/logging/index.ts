import pino from 'pino';
import { env } from 'process';

// Configure log level from environment variable
const logLevel = env.LOG_LEVEL || 'info';

// Create the root logger with pino
const logger = pino({
  level: logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: true,
    }
  }
});

// Create a child logger factory function
export const createLogger = (component: string) => {
  return logger.child({ component });
};

export default logger;