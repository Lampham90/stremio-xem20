const axios = require('axios');
const cinemeta = require('./cinemeta');

class KKPhimService {
  constructor() {
    this.phimApiBase = 'https://phimapi.com';
    this.imgBase = 'https://phimimg.com/';
    this.cache = new Map();
    this.cacheTtl = 5 * 60 * 1000;

    // Lưu ánh xạ 2 chiều IMDb ID <-> KKPhim slug để liên kết hoàn hảo với Cinemeta và Penguplay
    this.imdbToSlugMap = new Map();
    this.slugToImdbMap = new Map();

    // 26 danh mục đồng bộ 100% chuẩn theo thứ tự HomeScreen.kt của App Android Phimkk
    this.catEndpoints = {
      kk_latest: 'https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=',
      kk_phim_chieu_rap: 'https://phimapi.com/v1/api/danh-sach/phim-chieu-rap?page=',
      kk_anime_nhat: 'https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=',
      kk_long_tieng: 'https://phimapi.com/v1/api/danh-sach/phim-long-tieng?page=',
      kk_thuyet_minh: 'https://phimapi.com/v1/api/danh-sach/phim-thuyet-minh?page=',
      kk_hh_trung_quoc: 'https://phimapi.com/v1/api/quoc-gia/trung-quoc?page=',
      kk_anime_movie: 'https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=',
      kk_kinh_di: 'https://phimapi.com/v1/api/the-loai/kinh-di?page=',
      kk_bo_han: 'https://phimapi.com/v1/api/quoc-gia/han-quoc?page=',
      kk_bo_trung: 'https://phimapi.com/v1/api/quoc-gia/trung-quoc?page=',
      kk_le_vn: 'https://phimapi.com/v1/api/quoc-gia/viet-nam?page=',
      kk_le_han: 'https://phimapi.com/v1/api/quoc-gia/han-quoc?page=',
      kk_le_trung: 'https://phimapi.com/v1/api/quoc-gia/trung-quoc?page=',
      kk_le_au_my: 'https://phimapi.com/v1/api/quoc-gia/au-my?page=',
      kk_le_thai: 'https://phimapi.com/v1/api/quoc-gia/thai-lan?page=',
      kk_bo_vn: 'https://phimapi.com/v1/api/quoc-gia/viet-nam?page=',
      kk_bo_au_my: 'https://phimapi.com/v1/api/quoc-gia/au-my?page=',
      kk_bo_nhat: 'https://phimapi.com/v1/api/quoc-gia/nhat-ban?page=',
      kk_bo_thai: 'https://phimapi.com/v1/api/quoc-gia/thai-lan?page=',
      kk_trending_phim_bo: 'https://phimapi.com/v1/api/danh-sach/phim-bo?page=',
      kk_co_trang: 'https://phimapi.com/v1/api/the-loai/co-trang?page=',
      kk_hanh_dong: 'https://phimapi.com/v1/api/the-loai/hanh-dong?page=',
      kk_hai_huoc: 'https://phimapi.com/v1/api/the-loai/hai-huoc?page=',
      kk_khoa_hoc: 'https://phimapi.com/v1/api/the-loai/vien-tuong?page=',
      kk_tam_ly: 'https://phimapi.com/v1/api/the-loai/tam-ly?page=',
      kk_tv_show: 'https://phimapi.com/v1/api/danh-sach/tv-shows?page='
    };
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
    if (item.imdb?.id && typeof item.imdb.id === 'string' && item.imdb.id.startsWith('tt')) {
      return item.imdb.id;
    }
    if (item.imdbId && typeof item.imdbId === 'string' && item.imdbId.startsWith('tt')) {
      return item.imdbId;
    }
    return null;
  }

  buildMetaItem(item, catalogType) {
    const slug = item.slug || '';
    const imdbId = this.extractImdbId(item);
    const finalId = imdbId || `kk:${slug}`;

    if (imdbId && slug) {
      this.imdbToSlugMap.set(imdbId, slug);
      this.slugToImdbMap.set(slug, imdbId);
    }

    const poster = this.formatImageUrl(item.poster_url || item.poster || item.thumb_url);
    const background = this.formatImageUrl(item.thumb_url || item.thumb || item.poster_url);

    return {
      id: finalId,
      slug: slug,
      name: item.name,
      type: catalogType || (item.type === 'series' ? 'series' : 'movie'),
      poster,
      background,
      releaseInfo: item.year ? String(item.year) : '',
      description: this.cleanHtml(item.content || item.description || item.movieDescription || item.sub_type || `Phim (${item.year || ''})`)
    };
  }

  async getCatalog(catalogId, skip = 0) {
    const cacheKey = `cat_${catalogId}_${skip}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) return cached.data;

    const seriesCatalogs = new Set([
      'kk_anime_nhat', 'kk_long_tieng', 'kk_hh_trung_quoc',
      'kk_bo_han', 'kk_bo_trung', 'kk_bo_vn', 'kk_bo_au_my',
      'kk_bo_nhat', 'kk_bo_thai', 'kk_trending_phim_bo',
      'kk_co_trang', 'kk_tv_show'
    ]);
    const isSeries = seriesCatalogs.has(catalogId);
    const catalogType = isSeries ? 'series' : 'movie';

    let metas = [];
    const targetEndpoint = this.catEndpoints[catalogId] || `${this.phimApiBase}/v1/api/danh-sach/${catalogId.replace(/^kk_/, '')}?page=`;
    const page = Math.floor(skip / 24) + 1;

    try {
      const res = await axios.get(`${targetEndpoint}${page}`, { timeout: 8000 });
      const items = res.data?.data?.items || res.data?.items || [];
      metas = items.map(item => this.buildMetaItem(item, catalogType));
    } catch (err) {
      console.error(`[KKPhim] Lỗi getCatalog cho ${catalogId}:`, err.message);
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

      const poster = this.formatImageUrl(m.poster_url || m.thumb_url);
      const background = this.formatImageUrl(m.thumb_url || m.poster_url);

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
          const foundSlug = match.slug || (match.id.startsWith('kk:') ? match.id.replace('kk:', '') : null);
          if (foundSlug && !foundSlug.startsWith('tt')) {
            this.imdbToSlugMap.set(imdbId, foundSlug);
            this.slugToImdbMap.set(foundSlug, imdbId);
            return foundSlug;
          }
        }
      }
    } catch (e) {
      console.warn(`[KKPhim] Không tìm được slug cho ${imdbId}:`, e.message);
    }
    return null;
  }
}

module.exports = new KKPhimService();
