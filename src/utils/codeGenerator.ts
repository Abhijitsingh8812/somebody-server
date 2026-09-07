import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 30 unambiguous characters

export const generateUniqueCode = (length = 8): string => {
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
};
