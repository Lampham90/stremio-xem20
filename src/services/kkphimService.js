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

  buildMetaItem(item, catalogType) {
    const imdbId = this.extractImdbId(item);
    const finalId = imdbId || `kk:${item.slug}`;
    if (imdbId) {
      this.imdbToSlugMap.set(imdbId, item.slug);
      this.slugToImdbMap.set(item.slug, imdbId);
    }

    // 1. POSTER: Giữ nguyên poster gốc của phim theo yêu cầu
    const poster = this.formatImageUrl(item.poster_url || item.poster || item.thumb_url);

    // 2. BACKGROUND: Sử dụng hình nền TMDB sắc nét cho banner đầu trang trên Home
    let background = this.formatImageUrl(item.thumb_url || item.thumb || item.poster_url);
    if (imdbId) {
      background = `https://images.metahub.space/background/medium/${imdbId}/img`;
    }

    return {
      id: finalId,
      name: item.name,
      type: catalogType || (item.type === 'series' ? 'series' : 'movie'),
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

    const isSeriesCatalog = catalogId.startsWith('kk_bo_') || catalogId === 'kk_anime_nhat' || catalogId === 'kk_hh_trung_quoc';
    const catalogType = isSeriesCatalog ? 'series' : 'movie';

    let metas = [];

    if (catalogId === 'kk_latest') {
      const page = Math.floor(skip / 24) + 1;
      try {
        const res = await axios.get(`${this.phimApiBase}/danh-sach/phim-moi-cap-nhat?page=${page}`, { timeout: 8000 });
        const items = res.data?.items || [];
        metas = items.map(item => this.buildMetaItem(item, catalogType));
      } catch (err) {
        console.error('[KKPhim] Lỗi fetch phim-moi-cap-nhat:', err.message);
      }
    } else {
      const catKey = catalogId.replace(/^kk_/, '');
      const perfect = await this.getPerfectCategories();
      const items = perfect[catKey] || [];

      if (items.length > 0) {
        const slicedItems = items.slice(skip, skip + 24);
        metas = slicedItems.map(item => this.buildMetaItem(item, catalogType));
      } else {
        // Fallback sang phimapi nếu category worker trống
        try {
          const page = Math.floor(skip / 24) + 1;
          const res = await axios.get(`${this.phimApiBase}/v1/api/danh-sach/${encodeURIComponent(catKey)}?page=${page}`, { timeout: 8000 });
          const list = res.data?.data?.items || [];
          metas = list.map(item => this.buildMetaItem(item, catalogType));
        } catch (e) {
          console.warn(`[KKPhim] Fallback fetch error cho ${catKey}:`, e.message);
        }
      }
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
        return this.buildMetaItem(item, isSeries ? 'series' : 'movie');
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
      const res = await axios.get(`${this.phimApiBase}/phim/${encodeURIComponent(slug)}`, { timeout: 8000 });
      const data = res.data;
      if (!data || !data.movie) return null;

      const m = data.movie;
      const episodes = data.episodes || [];

      let hasEpisodes = false;
      episodes.forEach(server => {
        const list = server.server_data || [];
        if (list.length > 1) hasEpisodes = true;
      });

      const isSeries = hasEpisodes || (m.type === 'series') || (m.episode_total && parseInt(m.episode_total, 10) > 1);

      const imdbId = this.extractImdbId(m);
      if (imdbId) {
        this.imdbToSlugMap.set(imdbId, slug);
        this.slugToImdbMap.set(slug, imdbId);
      }

      const idToUse = imdbId || `kk:${slug}`;

      const videos = [];
      if (isSeries) {
        const epSet = new Set();
        episodes.forEach(s => {
          (s.server_data || []).forEach(ep => {
            const epNum = parseInt(ep.name?.replace(/\D/g, '') || '1', 10) || 1;
            epSet.add(epNum);
          });
        });

        const sortedNums = Array.from(epSet).sort((a, b) => a - b);
        if (sortedNums.length === 0) sortedNums.push(1);

        sortedNums.forEach(num => {
          videos.push({
            id: `${idToUse}:1:${num}`,
            title: `Tập ${num}`,
            season: 1,
            episode: num,
            released: new Date().toISOString()
          });
        });
      }

      // Poster giữ nguyên ảnh gốc của phim
      const poster = this.formatImageUrl(m.poster_url || m.thumb_url);

      // Background: Sử dụng TMDB Backdrop sắc nét trong chi tiết phim
      let background = this.formatImageUrl(m.thumb_url || m.poster_url);
      if (imdbId) {
        background = `https://images.metahub.space/background/medium/${imdbId}/img`;
      }

      const result = {
        id: idToUse,
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
        director: Array.isArray(m.director) ? m.director.join(', ') : (m.director || ''),
        cast: Array.isArray(m.actor) ? m.actor : (typeof m.actor === 'string' ? m.actor.split(',').map(s => s.trim()) : []),
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
