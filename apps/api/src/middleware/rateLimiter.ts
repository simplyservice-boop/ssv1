import rateLimit from 'express-rate-limit';
import { RequestHandler } from 'express';
import { config } from '../config';
export const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false }) as unknown as RequestHandler;
export const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: 20,  standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true }) as unknown as RequestHandler;
export const aiLimiter     = rateLimit({ windowMs: 60*1000,    max: config.isProd ? 10 : 50, standardHeaders: true, legacyHeaders: false }) as unknown as RequestHandler;
export const uploadLimiter = rateLimit({ windowMs: 60*60*1000, max: 50,  standardHeaders: true, legacyHeaders: false }) as unknown as RequestHandler;
