const axios = require('axios');

class KKPhimService {
  constructor() {
    this.workerBase = 'https://kkapp.pl9.workers.dev';
    this.phimApiBase = 'https://phimapi.com';
    this.imgBase = 'https://phimimg.com/';
    this.cache = new Map(); // key -> { data, expireAt }
    this.cacheTtl = 5 * 60 * 1000; // 5 minutes
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
        metas = items.map(item => ({
          id: `kk:${item.slug}`,
          name: item.name,
          type: item.tmdb?.type === 'tv' ? 'series' : 'movie',
          poster: this.formatImageUrl(item.poster_url),
          background: this.formatImageUrl(item.thumb_url),
          releaseInfo: item.year ? String(item.year) : '',
          description: `Phim mới cập nhật (${item.year || ''})`
        }));
      } catch (err) {
        console.error('[KKPhim] Lỗi fetch phim-moi-cap-nhat:', err.message);
      }
    } else {
      const workerSlug = catalogId.replace(/^kk_/, '');
      const page = Math.floor(skip / 40) + 1;

      try {
        const res = await axios.get(`${this.workerBase}/api/movies/category/${encodeURIComponent(workerSlug)}?page=${page}`, { timeout: 8000 });
        const items = Array.isArray(res.data) ? res.data : [];

        metas = items.map(item => {
          const isSeries = item.type === 'series' || (item.episode_total && item.episode_total > 1) || item.current_episode?.includes('Tập');
          return {
            id: `kk:${item.slug}`,
            name: item.name,
            type: isSeries ? 'series' : 'movie',
            poster: this.formatImageUrl(item.poster_url || item.poster || item.thumb_url),
            background: this.formatImageUrl(item.thumb_url || item.thumb || item.poster_url),
            releaseInfo: item.year ? String(item.year) : '',
            description: this.cleanHtml(item.description || item.movieDescription || item.sub_type || '')
          };
        });
      } catch (err) {
        console.warn(`[KKPhim] Worker fetch error cho ${workerSlug}, fallback sang phimapi:`, err.message);
        // Fallback to phimapi
        try {
          const typeSlug = workerSlug.includes('bo_') ? 'phim-bo' : (workerSlug.includes('hh_') || workerSlug.includes('anime') ? 'hoat-hinh' : 'phim-le');
          const page2 = Math.floor(skip / 24) + 1;
          const res = await axios.get(`${this.phimApiBase}/v1/api/danh-sach/${typeSlug}?page=${page2}`, { timeout: 8000 });
          const items = res.data?.data?.items || [];
          metas = items.map(item => ({
            id: `kk:${item.slug}`,
            name: item.name,
            type: typeSlug === 'phim-bo' ? 'series' : 'movie',
            poster: this.formatImageUrl(item.poster_url),
            background: this.formatImageUrl(item.thumb_url),
            releaseInfo: item.year ? String(item.year) : '',
            description: item.lang || ''
          }));
        } catch (e2) {
          console.error('[KKPhim] Fallback cũng lỗi:', e2.message);
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
        return {
          id: `kk:${item.slug}`,
          name: item.name,
          type: isSeries ? 'series' : 'movie',
          poster: this.formatImageUrl(item.poster_url),
          background: this.formatImageUrl(item.thumb_url),
          releaseInfo: item.year ? String(item.year) : '',
          description: `${item.origin_name || ''} · ${item.lang || ''} · ${item.episode_current || ''}`
        };
      });
    } catch (err) {
      console.error('[KKPhim] Lỗi search:', err.message);
      return [];
    }
  }

  async getMovieDetail(slug) {
    const cacheKey = `detail_${slug}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) return cached.data;

    try {
      const res = await axios.get(`${this.phimApiBase}/phim/${encodeURIComponent(slug)}`, { timeout: 8000 });
      const data = res.data;
      if (!data || !data.movie) return null;

      const movie = data.movie;
      const episodes = data.episodes || [];

      // Determine series vs movie
      let maxEp = 1;
      let hasEpisodes = false;
      episodes.forEach(server => {
        const list = server.server_data || [];
        if (list.length > 1) hasEpisodes = true;
        list.forEach(ep => {
          const num = parseInt(ep.name?.replace(/\D/g, '') || '1', 10);
          if (num > maxEp) maxEp = num;
        });
      });

      const isSeries = hasEpisodes || (movie.type === 'series') || (movie.episode_total && parseInt(movie.episode_total, 10) > 1);

      // Build video list for series
      const videos = [];
      if (isSeries) {
        // Collect unique episode identifiers across all servers
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
            id: `kk:${slug}:1:${num}`,
            title: `Tập ${num}`,
            season: 1,
            episode: num,
            released: new Date().toISOString()
          });
        });
      }

      const genres = (movie.category || []).map(c => c.name);
      const cast = Array.isArray(movie.actor) ? movie.actor : (typeof movie.actor === 'string' ? movie.actor.split(',').map(s => s.trim()) : []);

      const result = {
        slug,
        title: movie.name,
        originTitle: movie.origin_name || '',
        year: movie.year || null,
        poster: this.formatImageUrl(movie.poster_url),
        background: this.formatImageUrl(movie.thumb_url),
        description: this.cleanHtml(movie.content || ''),
        genres,
        director: Array.isArray(movie.director) ? movie.director.join(', ') : (movie.director || ''),
        cast,
        isSeries,
        videos,
        episodes,
        imdbScore: movie.imdb_score || movie.imdb?.vote_average || null,
        imdbId: movie.imdb_id || movie.imdb?.id || null
      };

      this.cache.set(cacheKey, { data: result, expireAt: Date.now() + this.cacheTtl });
      return result;
    } catch (err) {
      console.error(`[KKPhim] Lỗi getMovieDetail cho ${slug}:`, err.message);
      return null;
    }
  }
}

module.exports = new KKPhimService();
