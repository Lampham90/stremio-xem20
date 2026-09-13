const axios = require('axios');
const cinemeta = require('./cinemeta');

class KKPhimService {
  constructor() {
    this.workerBase = 'https://kkapp.pl9.workers.dev';
    this.phimApiBase = 'https://phimapi.com';
    this.imgBase = 'https://phimimg.com/';
    this.cache = new Map();
    this.cacheTtl = 5 * 60 * 1000;

    // Lưu ánh xạ 2 chiều IMDb ID <-> KKPhim slug để Stremio liên kết với Penguplay và Cinemeta
    this.imdbToSlugMap = new Map();
    this.slugToImdbMap = new Map();

    // Cache cho worker perfect categories
    this.perfectData = null;
    this.perfectExpireAt = 0;
  }

  formatImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${this.imgBase}${url.replace(/^\/+/, '')}`;
  }

  cleanHtml(str) {
    if (!str) return '';
    return str.replace(/<[^>]*>?/gm, '').trim();
  }

  extractImdbId(item) {
    if (!item) return null;
    if (item.imdb_json) {
      try {
        const parsed = JSON.parse(item.imdb_json);
        if (parsed.id && parsed.id.startsWith('tt')) return parsed.id;
      } catch (e) {}
    }
    if (item.imdb?.id && item.imdb.id.startsWith('tt')) {
      return item.imdb.id;
    }
    if (item.imdbId && item.imdbId.startsWith('tt')) {
      return item.imdbId;
    }
    return null;
  }

  buildMetaItem(item, isSeries) {
    const imdbId = this.extractImdbId(item);
    const finalId = imdbId || `kk:${item.slug}`;
    if (imdbId) {
      this.imdbToSlugMap.set(imdbId, item.slug);
      this.slugToImdbMap.set(item.slug, imdbId);
    }

    // Nếu có IMDb ID -> Sử dụng poster và background sắc nét từ TMDB / Metahub
    let poster = this.formatImageUrl(item.poster_url || item.poster || item.thumb_url);
    let background = this.formatImageUrl(item.thumb_url || item.thumb || item.poster_url);

    if (imdbId) {
      poster = `https://images.metahub.space/poster/medium/${imdbId}/img`;
      background = `https://images.metahub.space/background/medium/${imdbId}/img`;
    }

    return {
      id: finalId,
      name: item.name,
      type: isSeries ? 'series' : 'movie',
      poster,
      background,
      releaseInfo: item.year ? String(item.year) : '',
      description: this.cleanHtml(item.description || item.movieDescription || item.sub_type || `Phim (${item.year || ''})`)
    };
  }

  async getPerfectCategories() {
    if (this.perfectData && this.perfectExpireAt > Date.now()) {
      return this.perfectData;
    }
    try {
      const res = await axios.get(`${this.workerBase}/api/movies/perfect`, { timeout: 10000 });
      if (res.data && typeof res.data === 'object') {
        this.perfectData = res.data;
        this.perfectExpireAt = Date.now() + 10 * 60 * 1000;
        return this.perfectData;
      }
    } catch (e) {
      console.warn('[KKPhim] Lỗi tải perfect categories:', e.message);
    }
    return {};
  }

  async getCatalog(catalogId, skip = 0) {
    const cacheKey = `cat_${catalogId}_${skip}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) return cached.data;

    let metas = [];

    if (catalogId === 'kk_latest') {
      const page = Math.floor(skip / 24) + 1;
      try {
        const res = await axios.get(`${this.phimApiBase}/danh-sach/phim-moi-cap-nhat?page=${page}`, { timeout: 8000 });
        const items = res.data?.items || [];
        metas = items.map(item => {
          const isSeries = item.tmdb?.type === 'tv' || (item.episode_total && item.episode_total > 1);
          return this.buildMetaItem(item, isSeries);
        });
      } catch (err) {
        console.error('[KKPhim] Lỗi fetch phim-moi-cap-nhat:', err.message);
      }
    } else {
      const catKey = catalogId.replace(/^kk_/, '');
      const perfect = await this.getPerfectCategories();
      const items = perfect[catKey] || [];

      const isSeriesCatalog = catKey.startsWith('bo_') || catKey === 'anime_nhat' || catKey === 'hh_trung_quoc';
      const slicedItems = items.slice(skip, skip + 24);

      metas = slicedItems.map(item => {
        const isSeries = isSeriesCatalog || item.type === 'series' || (item.episode_total && item.episode_total > 1);
        return this.buildMetaItem(item, isSeries);
      });
    }

    this.cache.set(cacheKey, { data: metas, expireAt: Date.now() + this.cacheTtl });
    return metas;
  }

  async search(keyword) {
    if (!keyword || !keyword.trim()) return [];
    try {
      const cleanKw = keyword.replace(/\+/g, ' ').trim();
      const res = await axios.get(`${this.phimApiBase}/v1/api/tim-kiem?keyword=${encodeURIComponent(cleanKw)}&limit=30`, { timeout: 8000 });
      const items = res.data?.data?.items || [];
      return items.map(item => {
        const isSeries = item.episode_current && !item.episode_current.toLowerCase().includes('full');
        return this.buildMetaItem(item, isSeries);
      });
    } catch (err) {
      console.error('[KKPhim] Lỗi search:', err.message);
      return [];
    }
  }

  async getMovieDetail(slug) {
    if (!slug) return null;
    const cacheKey = `detail_${slug}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) return cached.data;

    try {
      const res = await axios.get(`${this.phimApiBase}/phim/${slug}`, { timeout: 8000 });
      const data = res.data;
      if (!data || !data.movie) return null;

      const m = data.movie;
      const isSeries = m.type === 'series' || (m.episode_total && m.episode_total > 1) || m.episode_current?.includes('Tập');

      const videos = [];
      const episodes = data.episodes || [];
      if (episodes.length > 0) {
        const firstServer = episodes[0]?.server_data || [];
        firstServer.forEach(ep => {
          const epNum = parseInt(ep.name?.replace(/\D/g, '') || '1', 10);
          videos.push({
            id: `kk:${slug}:1:${epNum}`,
            title: ep.name || `Tập ${epNum}`,
            season: 1,
            episode: epNum,
            released: new Date().toISOString()
          });
        });
      }

      const imdbId = this.extractImdbId(m);
      if (imdbId) {
        this.imdbToSlugMap.set(imdbId, slug);
        this.slugToImdbMap.set(slug, imdbId);
      }

      let poster = this.formatImageUrl(m.poster_url || m.thumb_url);
      let background = this.formatImageUrl(m.thumb_url || m.poster_url);
      if (imdbId) {
        poster = `https://images.metahub.space/poster/medium/${imdbId}/img`;
        background = `https://images.metahub.space/background/medium/${imdbId}/img`;
      }

      const result = {
        id: imdbId || `kk:${slug}`,
        imdbId: imdbId,
        slug: slug,
        title: m.name,
        originTitle: m.origin_name,
        isSeries: isSeries,
        year: m.year,
        poster,
        background,
        description: this.cleanHtml(m.content),
        genres: (m.category || []).map(c => c.name),
        director: m.director?.[0] || '',
        cast: m.actor || [],
        imdbScore: m.imdb?.vote_average || undefined,
        episodes: episodes,
        videos: videos
      };

      this.cache.set(cacheKey, { data: result, expireAt: Date.now() + this.cacheTtl });
      return result;
    } catch (err) {
      console.error(`[KKPhim] Lỗi getMovieDetail cho ${slug}:`, err.message);
      return null;
    }
  }

  async findSlugByImdb(imdbId) {
    if (!imdbId) return null;
    if (this.imdbToSlugMap.has(imdbId)) {
      return this.imdbToSlugMap.get(imdbId);
    }

    try {
      const cm = await cinemeta.getMeta('movie', imdbId) || await cinemeta.getMeta('series', imdbId);
      if (cm && cm.name) {
        const searchResults = await this.search(cm.name);
        if (searchResults.length > 0) {
          const match = searchResults[0];
          const slug = match.id.replace('kk:', '');
          this.imdbToSlugMap.set(imdbId, slug);
          this.slugToImdbMap.set(slug, imdbId);
          return slug;
        }
      }
    } catch (e) {
      console.warn(`[KKPhim] Không tìm được slug cho ${imdbId}:`, e.message);
    }
    return null;
  }
}

module.exports = new KKPhimService();
