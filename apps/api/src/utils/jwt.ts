import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';
export interface JwtPayload { userId: string; email: string; role: string; }
export const signAccessToken = (p: JwtPayload): string =>
  jwt.sign(p, config.jwt.secret, { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] });
export const signRefreshToken = (p: JwtPayload): string =>
  jwt.sign(p, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn as SignOptions['expiresIn'] });
export const verifyAccessToken = (t: string): JwtPayload => jwt.verify(t, config.jwt.secret) as JwtPayload;
export const verifyRefreshToken = (t: string): JwtPayload => jwt.verify(t, config.jwt.refreshSecret) as JwtPayload;
export const decodeToken = (t: string) => jwt.decode(t);
