import pino from 'pino';
import { env, isProduction, isTest } from '../config/env.js';

/**
 * Structured JSON logging in production, human-readable in development.
 * The audit found errors being echoed straight into the HTTP response; every
 * diagnostic now goes here instead and the client gets a sanitised message.
 */
export const logger = pino({
  level: isTest ? 'silent' : isProduction ? 'info' : 'debug',
  base: { service: 'tastyfood-api', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.confirmPassword',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,env' },
      },
});
