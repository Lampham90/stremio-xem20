const axios = require('axios');

class NguoncService {
  constructor() {
    this.apiBase = 'https://phim.nguonc.com';
    this.resolverBase = 'https://ghienphim-ktfd.onrender.com';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    };
    this.cache = new Map();
  }

  async getMovieDetail(slug) {
    if (!slug) return null;
    try {
      const res = await axios.get(`${this.apiBase}/api/film/${encodeURIComponent(slug)}`, {
        headers: this.headers,
        timeout: 6000
      });
      if (res.data && res.data.status === 'success' && res.data.movie) {
        return res.data;
      }
    } catch (err) {}
    return null;
  }

  async searchMovie(keyword) {
    if (!keyword) return [];
    try {
      const clean = keyword.replace(/\+/g, ' ').trim();
      const res = await axios.get(`${this.apiBase}/api/film/search?keyword=${encodeURIComponent(clean)}`, {
        headers: this.headers,
        timeout: 6000
      });
      const items = res.data?.items || res.data?.data?.items || [];
      return Array.isArray(items) ? items : [];
    } catch (err) {
      return [];
    }
  }

  async resolveEmbed(embedUrl) {
    if (!embedUrl) return null;
    const cacheKey = `res_${embedUrl}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) return cached.m3u8;

    try {
      const res = await axios.get(`${this.resolverBase}/resolve?url=${encodeURIComponent(embedUrl)}`, {
        timeout: 10000
      });
      if (res.data && res.data.m3u8) {
        this.cache.set(cacheKey, { m3u8: res.data.m3u8, expireAt: Date.now() + 30 * 60 * 1000 });
        return res.data.m3u8;
      }
    } catch (err) {
      console.warn('[NguonC] Lỗi resolve embed:', err.message);
    }
    return null;
  }
}

module.exports = new NguoncService();
