import rateLimit from 'express-rate-limit';

export const authApiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: 10, // Her IP için maksimum 10 istek/dk
  standardHeaders: true, // RateLimit-* headers gönder
  legacyHeaders: false,  // X-RateLimit-* header'larını gönderme
  message: {
    error: 'Too many login or register attempts, please try again later.',
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: 100, // Her IP için maksimum 100 istek/dk
  standardHeaders: true, // RateLimit-* headers gönder
  legacyHeaders: false,  // X-RateLimit-* header'larını gönderme
  message: {
    error: 'Too many requests, please try again later.',
  },
});