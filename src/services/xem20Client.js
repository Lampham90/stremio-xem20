const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const config = require('../config');

class Xem20Client {
  constructor() {
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar,
      withCredentials: true,
      headers: {
        'User-Agent': config.xem20.userAgent,
        'Referer': config.xem20.baseUrl + '/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 15000
    }));

    this.isLoggedIn = false;
    this.csrfToken = null;
    this.streamCache = new Map(); // downloadLinkId -> { url, expireAt }
    this.releaseMetadata = new Map(); // downloadLinkId -> { slug, token }
    this.searchCache = new Map(); // query -> { data, expireAt }
    this.detailCache = new Map(); // slug -> { data, expireAt }
  }

  async ensureLoggedIn() {
    if (this.isLoggedIn && this.csrfToken) {
      return;
    }
    await this.login();
  }

  async login(force = false) {
    try {
      console.log('[XEM20] Đang lấy CSRF token từ trang đăng nhập...');
      const loginPageRes = await this.client.get(`${config.xem20.baseUrl}/login`);
      const $ = cheerio.load(loginPageRes.data);
      this.csrfToken = $('input[name="_token"]').val();

      if (!this.csrfToken) {
        throw new Error('Không tìm thấy CSRF token trên trang đăng nhập xem20.net');
      }

      console.log('[XEM20] Đang đăng nhập với tài khoản:', config.xem20.username);
      const params = new URLSearchParams();
      params.append('_token', this.csrfToken);
      params.append('login', config.xem20.username);
      params.append('password', config.xem20.password);
      params.append('remember', 'on');

      const loginRes = await this.client.post(`${config.xem20.baseUrl}/login`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': config.xem20.baseUrl
        }
      });

      const $after = cheerio.load(loginRes.data);
      const nextToken = $after('meta[name="csrf-token"]').attr('content') || $after('input[name="_token"]').val();
      if (nextToken) this.csrfToken = nextToken;

      this.isLoggedIn = true;
      console.log('[XEM20] Đăng nhập thành công!');
    } catch (err) {
      console.error('[XEM20] Lỗi đăng nhập:', err.message);
      await this.tryRegisterFallback();
    }
  }

  async tryRegisterFallback() {
    try {
      const fallbackUser = 'user_' + Math.random().toString(36).substring(2, 9);
      const fallbackEmail = `${fallbackUser}@antigravity.test`;
      const fallbackPass = 'AgyPass@' + Math.floor(1000 + Math.random() * 9000);

      console.log('[XEM20] Thử đăng ký tài khoản tự động mới:', fallbackUser);
      const regPage = await this.client.get(`${config.xem20.baseUrl}/register`);
      const $ = cheerio.load(regPage.data);
      const token = $('input[name="_token"]').val();

      const params = new URLSearchParams();
      params.append('_token', token);
      params.append('name', fallbackUser);
      params.append('username', fallbackUser);
      params.append('email', fallbackEmail);
      params.append('password', fallbackPass);
      params.append('password_confirmation', fallbackPass);

      await this.client.post(`${config.xem20.baseUrl}/register`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': config.xem20.baseUrl
        }
      });

      this.isLoggedIn = true;
      this.csrfToken = token;
      console.log('[XEM20] Đăng ký tự động thành công!');
    } catch (err) {
      console.error('[XEM20] Lỗi khi tạo tài khoản dự phòng:', err.message);
    }
  }

  parseCard($, el, defaultType = 'movie') {
    const $el = $(el);
    let href = $el.attr('href') || '';
    if (!href) return null;

    let slug = href.replace(config.xem20.baseUrl, '').replace(/^\//, '').split('?')[0];
    if (!slug || slug.includes('#')) return null;

    const ignoreList = [
      'danh-sach', 'the-loai', 'quoc-gia', 'login', 'register',
      'tu-phim', 'loc-phim', 'profile', 'shop', 'wheel',
      'nam', 'dao-dien', 'dien-vien'
    ];
    if (ignoreList.some(prefix => slug === prefix || slug.startsWith(prefix + '/'))) {
      return null;
    }

    const title = $el.find('h3, .line-clamp-1, .line-clamp-2, p.font-semibold, p.text-sm').first().text().trim();
    if (!title) return null;

    const poster = $el.find('img').attr('src') || $el.find('img').attr('data-src') || '';
    const badge = $el.find('.absolute, span, .text-xs').map((_, s) => $(s).text().trim()).get().join(' · ');

    let type = defaultType;
    if (badge.includes('Tập') || badge.includes('Full') || href.includes('phim-bo') || slug.includes('phim-bo')) {
      type = 'series';
    }

    return {
      id: `xem20:${slug}`,
      slug,
      name: title,
      type,
      poster: poster.startsWith('//') ? 'https:' + poster : poster,
      description: badge
    };
  }

  async getCatalog(catalogType, skip = 0) {
    let url = config.xem20.baseUrl;
    let defaultType = 'movie';
    const page = Math.floor(skip / 18) + 1;

    if (catalogType === 'xem20_series') {
      url = `${config.xem20.baseUrl}/danh-sach/phim-bo?page=${page}`;
      defaultType = 'series';
    } else if (catalogType === 'xem20_movies') {
      url = `${config.xem20.baseUrl}/danh-sach/phim-le?page=${page}`;
      defaultType = 'movie';
    } else if (catalogType === 'xem20_new') {
      url = `${config.xem20.baseUrl}/danh-sach/moi-co-ban-tai?page=${page}`;
    }

    try {
      const res = await this.client.get(url);
      const $ = cheerio.load(res.data);
      const metas = [];

      $('a.cd-card').each((_, el) => {
        const meta = this.parseCard($, el, defaultType);
        if (meta && !metas.find(m => m.id === meta.id)) {
          metas.push(meta);
        }
      });

      return metas;
    } catch (err) {
      console.error(`[XEM20] Lỗi khi lấy catalog ${catalogType}:`, err.message);
      return [];
    }
  }

  async search(query) {
    if (!query) return [];
    const cleanQuery = query.trim().toLowerCase();
    const cached = this.searchCache.get(cleanQuery);
    if (cached && cached.expireAt > Date.now()) {
      return cached.data;
    }

    try {
      const url = `${config.xem20.baseUrl}/tim-kiem?keyword=${encodeURIComponent(query.trim())}`;
      const res = await this.client.get(url);
      const $ = cheerio.load(res.data);
      const metas = [];

      $('a.cd-card').each((_, el) => {
        const meta = this.parseCard($, el);
        if (meta && !metas.find(m => m.id === meta.id)) {
          metas.push(meta);
        }
      });

      this.searchCache.set(cleanQuery, {
        data: metas,
        expireAt: Date.now() + 60 * 60 * 1000 // Cache 1 giờ
      });

      return metas;
    } catch (err) {
      console.error('[XEM20] Lỗi tìm kiếm:', err.message);
      return [];
    }
  }

  async getMovieDetail(slug) {
    if (!slug) return null;
    const cleanSlug = slug.trim();
    const cached = this.detailCache.get(cleanSlug);
    if (cached && cached.expireAt > Date.now()) {
      return cached.data;
    }

    await this.ensureLoggedIn();
    const url = `${config.xem20.baseUrl}/${cleanSlug}`;

    try {
      let res = await this.client.get(url);
      let $ = cheerio.load(res.data);

      if ($('a[href*="/login"]').text().includes('Đăng nhập để tải')) {
        console.log('[XEM20] Cần đăng nhập lại để xem release forms...');
        await this.login(true);
        res = await this.client.get(url);
        $ = cheerio.load(res.data);
      }

      const pageToken = $('meta[name="csrf-token"]').attr('content') || $('input[name="_token"]').val();
      if (pageToken) this.csrfToken = pageToken;

      const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || slug;
      const overview = $('meta[name="description"]').attr('content') || $('p.line-clamp-3, .description').text().trim();
      const poster = $('meta[property="og:image"]').attr('content') || $('img.poster, .cd-poster img').attr('src');
      const background = $('meta[property="og:image"]').attr('content');

      const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/) || res.data.match(/\/nam\/(\d{4})/);
      const year = yearMatch ? yearMatch[1] : '';

      const genres = [];
      $('a[href*="/the-loai/"]').each((_, el) => {
        genres.push($(el).text().trim());
      });

      const releases = [];
      const episodeMap = new Map();

      $('article.cd-release').each((_, el) => {
        const $el = $(el);
        const name = $el.find('p.cd-release__name').text().trim();
        const metaText = $el.find('div.cd-release__meta').text().replace(/\s+/g, ' ').trim();

        const form = $el.find('form[data-download-form], form[action*="/download-links/"]');
        const action = form.attr('action') || '';
        const idMatch = action.match(/\/download-links\/(\d+)\/access/);
        const downloadLinkId = idMatch ? idMatch[1] : null;

        if (!downloadLinkId) return;

        const formToken = form.find('input[name="_token"]').val() || pageToken;
        this.releaseMetadata.set(downloadLinkId, {
          slug,
          token: formToken
        });

        let season = 1;
        let episode = null;

        const epMatch = name.match(/[Tt]ập\s*(\d+)/i) || name.match(/\bS(\d+)E(\d+)\b/i) || name.match(/\bE(\d+)\b/i);
        if (epMatch) {
          if (epMatch.length === 3 && epMatch[1] && epMatch[2]) {
            season = parseInt(epMatch[1], 10);
            episode = parseInt(epMatch[2], 10);
          } else {
            episode = parseInt(epMatch[1], 10);
          }
        }

        const releaseObj = {
          downloadLinkId,
          name,
          metaText,
          season,
          episode
        };

        releases.push(releaseObj);

        if (episode !== null) {
          if (!episodeMap.has(episode)) episodeMap.set(episode, []);
          episodeMap.get(episode).push(releaseObj);
        }
      });

      const isSeries = episodeMap.size > 0 || slug.includes('phim-bo') || releases.some(r => r.episode !== null);

      const movieDetailResult = {
        slug: cleanSlug,
        title,
        overview,
        poster,
        background,
        year,
        genres,
        isSeries,
        releases,
        episodeMap
      };

      this.detailCache.set(cleanSlug, {
        data: movieDetailResult,
        expireAt: Date.now() + 60 * 60 * 1000 // Cache 1 giờ
      });

      return movieDetailResult;
    } catch (err) {
      console.error(`[XEM20] Lỗi khi lấy chi tiết phim ${slug}:`, err.message);
      return null;
    }
  }

  async resolveStreamUrl(downloadLinkId) {
    const cached = this.streamCache.get(downloadLinkId);
    if (cached && cached.expireAt > Date.now()) {
      return cached.url;
    }

    await this.ensureLoggedIn();

    const meta = this.releaseMetadata.get(downloadLinkId) || {};
    let token = meta.token || this.csrfToken;
    const refererUrl = meta.slug ? `${config.xem20.baseUrl}/${meta.slug}` : `${config.xem20.baseUrl}/`;

    const accessUrl = `${config.xem20.baseUrl}/download-links/${downloadLinkId}/access`;
    console.log(`[XEM20] Đang lấy vé tải cho release #${downloadLinkId}...`);

    try {
      const params = new URLSearchParams();
      params.append('_token', token || '');

      const res = await this.client.post(accessUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': refererUrl,
          'Origin': config.xem20.baseUrl
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });

      const redirectUrl = res.headers['location'] || res.headers['Location'] || '';
      console.log(`[XEM20] Nhận redirect 302: ${redirectUrl}`);

      let hash = null;
      const hashMatch = redirectUrl.match(/\/x\/([a-f0-9]{32,64})/);

      if (hashMatch) {
        hash = hashMatch[1];
      } else if (res.data && typeof res.data === 'string') {
        const bodyMatch = res.data.match(/\/x\/([a-f0-9]{32,64})/);
        if (bodyMatch) hash = bodyMatch[1];
      }

      if (!hash) {
        throw new Error(`Không tìm thấy hash vé tải trong Location header (${redirectUrl})`);
      }

      const directStreamUrl = `https://dl.downfshare.top/x/${hash}/play`;
      console.log(`[XEM20] Lấy link stream thành công: ${directStreamUrl}`);

      this.streamCache.set(downloadLinkId, {
        url: directStreamUrl,
        expireAt: Date.now() + config.cacheTtlMs
      });

      return directStreamUrl;
    } catch (err) {
      console.error(`[XEM20] Lỗi khi lấy stream cho release #${downloadLinkId}:`, err.message);
      throw err;
    }
  }
}

module.exports = new Xem20Client();
