const axios = require('axios');

class CinemetaService {
  constructor() {
    this.cache = new Map();
  }

  async getMeta(type, imdbId) {
    if (!imdbId || !imdbId.startsWith('tt')) return null;

    if (this.cache.has(imdbId)) {
      return this.cache.get(imdbId);
    }

    try {
      const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, {
        timeout: 5000
      });

      if (res.data && res.data.meta) {
        const meta = {
          imdbId,
          name: res.data.meta.name,
          year: res.data.meta.year,
          type: res.data.meta.type
        };
        this.cache.set(imdbId, meta);
        return meta;
      }
    } catch (err) {
      console.warn(`[Cinemeta] Không lấy được thông tin cho ${imdbId}:`, err.message);
    }

    return null;
  }
}

module.exports = new CinemetaService();
