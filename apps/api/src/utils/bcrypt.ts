import bcrypt from 'bcryptjs';
const SALT = 12;
export const hashPassword = (p: string) => bcrypt.hash(p, SALT);
export const comparePassword = (p: string, h: string) => bcrypt.compare(p, h);
