require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 7000,
  baseUrl: process.env.BASE_URL || 'http://localhost:7000',
  xem20: {
    baseUrl: process.env.XEM20_BASE_URL || 'https://xem20.net',
    username: process.env.XEM20_USERNAME || 'streamio_test10',
    password: process.env.XEM20_PASSWORD || 'TestPassword123!',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  cacheTtlMs: 2 * 60 * 60 * 1000 // 2 hours
};
