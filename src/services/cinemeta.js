const axios = require('axios');

class CinemetaService {
  constructor() {
    this.cache = new Map();
    this.searchCache = new Map();
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

  async findImdbId(title, year = null, type = 'movie') {
    if (!title) return null;
    const cleanTitle = title.replace(/\((19|20)\d{2}\)/, '').trim();
    const cacheKey = `${cleanTitle.toLowerCase()}_${year || ''}_${type}`;
    if (this.searchCache.has(cacheKey)) return this.searchCache.get(cacheKey);

    try {
      const res = await axios.get(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(cleanTitle)}.json`, {
        timeout: 5000
      });
      const metas = res.data?.metas || [];
      if (metas.length > 0) {
        let match = metas[0];
        if (year) {
          const yearMatch = metas.find(m => m.year && String(m.year) === String(year));
          if (yearMatch) match = yearMatch;
        }
        if (match && match.id && match.id.startsWith('tt')) {
          this.searchCache.set(cacheKey, match.id);
          this.cache.set(match.id, {
            imdbId: match.id,
            name: match.name,
            year: match.year,
            type: match.type || type
          });
          return match.id;
        }
      }
    } catch (e) {}

    this.searchCache.set(cacheKey, null);
    return null;
  }
}

module.exports = new CinemetaService();
