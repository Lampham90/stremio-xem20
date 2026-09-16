import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import { LRUCache } from 'lru-cache';
import { config } from '../config';

export interface Xem20Card {
  id: string;
  slug: string;
  name: string;
  type: string;
  poster: string;
  description: string;
}

export interface Xem20Release {
  downloadLinkId: string;
  name: string;
  metaText: string;
  season: number;
  episode: number | null;
}

export interface Xem20MovieDetail {
  slug: string;
  title: string;
  overview: string;
  poster: string;
  background?: string;
  year: string;
  genres: string[];
  isSeries: boolean;
  releases: Xem20Release[];
  episodeMap: Map<number, Xem20Release[]>;
}

export class Xem20Client {
  private jar: CookieJar;
  private client: AxiosInstance;
  public isLoggedIn: boolean = false;
  private csrfToken: string | null = null;
  private loginPromise: Promise<void> | null = null;

  // Caches with bounded size and TTL to prevent memory leaks
  private streamCache: LRUCache<string, string>;
  private releaseMetadata: LRUCache<string, { slug: string; token: string }>;
  private searchCache: LRUCache<string, Xem20Card[]>;
  private detailCache: LRUCache<string, Xem20MovieDetail>;

  constructor() {
    this.jar = new CookieJar();
    this.client = wrapper(
      axios.create({
        jar: this.jar,
        withCredentials: true,
        headers: {
          'User-Agent': config.xem20.userAgent,
          'Referer': `${config.xem20.baseUrl}/`,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 10000,
      })
    );

    this.streamCache = new LRUCache<string, string>({
      max: 500,
      ttl: 2 * 60 * 60 * 1000, // 2 hours
    });
    this.releaseMetadata = new LRUCache<string, { slug: string; token: string }>({
      max: 1000,
      ttl: 6 * 60 * 60 * 1000,
    });
    this.searchCache = new LRUCache<string, Xem20Card[]>({
      max: 500,
      ttl: 60 * 60 * 1000, // 1 hour
    });
    this.detailCache = new LRUCache<string, Xem20MovieDetail>({
      max: 300,
      ttl: 60 * 60 * 1000,
    });
  }

  /**
   * Cleans and sanitizes search queries to match Xem20 search patterns
   */
  public cleanQuery(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/\((19|20)\d{2}\)/g, '')            // Remove years like (2024)
      .replace(/\b(19|20)\d{2}\b/g, '')            // Remove standalone year numbers
      .replace(/\b(season|ss|phần|tập)\s*\d+/gi, '') // Remove season or episode markers
      .replace(/[:\-–—_/,.?!#@+*]/g, ' ')           // Replace punctuation with space
      .replace(/\s+/g, ' ')                        // Collapse multiple spaces
      .trim();
  }

  /**
   * Generates candidate queries for searching Xem20
   */
  public buildSearchCandidates(name: string, originName?: string): string[] {
    const candidates = new Set<string>();

    if (name) {
      const cName = this.cleanQuery(name);
      if (cName.length >= 2) candidates.add(cName);

      // If title has a colon / subtitle, take the main prefix
      const mainPart = name.split(/[:–—\-]/)[0].trim();
      const cMain = this.cleanQuery(mainPart);
      if (cMain.length >= 2) candidates.add(cMain);
    }

    if (originName && originName !== name) {
      const cOrigin = this.cleanQuery(originName);
      if (cOrigin.length >= 2) candidates.add(cOrigin);

      const mainOrigin = originName.split(/[:–—\-]/)[0].trim();
      const cMainOrigin = this.cleanQuery(mainOrigin);
      if (cMainOrigin.length >= 2) candidates.add(cMainOrigin);
    }

    return Array.from(candidates);
  }

  async ensureLoggedIn(): Promise<void> {
    if (this.isLoggedIn && this.csrfToken) return;
    if (this.loginPromise) return this.loginPromise;

    this.loginPromise = this.login().finally(() => {
      this.loginPromise = null;
    });

    return this.loginPromise;
  }

  async login(force = false): Promise<void> {
    try {
      console.log('[XEM20] Đang lấy CSRF token từ trang đăng nhập...');
      const loginPageRes = await this.client.get(`${config.xem20.baseUrl}/login`);
      const $ = cheerio.load(loginPageRes.data);
      this.csrfToken = $('input[name="_token"]').val() as string || null;

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
          'Origin': config.xem20.baseUrl,
        },
      });

      const $after = cheerio.load(loginRes.data);
      const nextToken = $after('meta[name="csrf-token"]').attr('content') || $after('input[name="_token"]').val() as string;
      if (nextToken) this.csrfToken = nextToken;

      this.isLoggedIn = true;
      console.log('[XEM20] Đăng nhập thành công!');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[XEM20] Lỗi đăng nhập:', errorMsg);
      await this.tryRegisterFallback();
    }
  }

  async tryRegisterFallback(): Promise<void> {
    try {
      const fallbackUser = 'user_' + Math.random().toString(36).substring(2, 9);
      const fallbackEmail = `${fallbackUser}@streamio.test`;
      const fallbackPass = 'AgyPass@' + Math.floor(1000 + Math.random() * 9000);

      console.log('[XEM20] Thử đăng ký tài khoản tự động mới:', fallbackUser);
      const regPage = await this.client.get(`${config.xem20.baseUrl}/register`);
      const $ = cheerio.load(regPage.data);
      const token = $('input[name="_token"]').val() as string;

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
          'Origin': config.xem20.baseUrl,
        },
      });

      this.isLoggedIn = true;
      this.csrfToken = token;
      console.log('[XEM20] Đăng ký tự động thành công!');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[XEM20] Lỗi khi tạo tài khoản dự phòng:', errorMsg);
    }
  }

  parseCard($: cheerio.CheerioAPI, el: any, defaultType = 'movie'): Xem20Card | null {
    const $el = $(el);
    const href = $el.attr('href') || '';
    if (!href) return null;

    const slug = href.replace(config.xem20.baseUrl, '').replace(/^\//, '').split('?')[0];
    if (!slug || slug.includes('#')) return null;

    const ignoreList = [
      'danh-sach', 'the-loai', 'quoc-gia', 'login', 'register',
      'tu-phim', 'loc-phim', 'profile', 'shop', 'wheel',
      'nam', 'dao-dien', 'dien-vien',
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
      description: badge,
    };
  }

  async search(query: string): Promise<Xem20Card[]> {
    if (!query) return [];
    const cleanQ = this.cleanQuery(query).toLowerCase();
    if (!cleanQ) return [];

    const cached = this.searchCache.get(cleanQ);
    if (cached) return cached;

    try {
      const url = `${config.xem20.baseUrl}/tim-kiem?keyword=${encodeURIComponent(cleanQ)}`;
      const res = await this.client.get(url, { timeout: 3500 });
      const $ = cheerio.load(res.data);
      const metas: Xem20Card[] = [];

      $('a.cd-card').each((_, el) => {
        const meta = this.parseCard($, el);
        if (meta && !metas.find(m => m.id === meta.id)) {
          metas.push(meta);
        }
      });

      this.searchCache.set(cleanQ, metas);
      return metas;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[XEM20] Lỗi tìm kiếm (${cleanQ}):`, errorMsg);
      return [];
    }
  }

  /**
   * Fast parallel search over multiple candidate queries with a strict timeout budget
   */
  async findMovieFast(candidates: string[], year?: number | string | null, timeoutMs = 2500): Promise<string | null> {
    if (!candidates || candidates.length === 0) return null;

    const searchPromise = (async () => {
      // Run queries in parallel
      const results = await Promise.all(candidates.map(q => this.search(q)));
      const allCards = results.flat();

      if (allCards.length === 0) return null;

      // Prioritize match by year if available
      if (year) {
        const yearStr = String(year);
        const matchByYear = allCards.find(c => c.description && c.description.includes(yearStr));
        if (matchByYear) return matchByYear.slug;
      }

      // Otherwise return first valid card
      return allCards[0].slug;
    })();

    const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
    return Promise.race([searchPromise, timeoutPromise]);
  }

  async getMovieDetail(slug: string): Promise<Xem20MovieDetail | null> {
    if (!slug) return null;
    const cleanSlug = slug.trim();
    const cached = this.detailCache.get(cleanSlug);
    if (cached) return cached;

    await this.ensureLoggedIn();
    const url = `${config.xem20.baseUrl}/${cleanSlug}`;

    try {
      let res = await this.client.get(url, { timeout: 4000 });
      let $ = cheerio.load(res.data);

      if ($('a[href*="/login"]').text().includes('Đăng nhập để tải')) {
        console.log('[XEM20] Cần đăng nhập lại để xem release forms...');
        await this.login(true);
        res = await this.client.get(url, { timeout: 4000 });
        $ = cheerio.load(res.data);
      }

      const pageToken = $('meta[name="csrf-token"]').attr('content') || $('input[name="_token"]').val() as string;
      if (pageToken) this.csrfToken = pageToken;

      const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || slug;
      const overview = $('meta[name="description"]').attr('content') || $('p.line-clamp-3, .description').text().trim();
      const poster = $('meta[property="og:image"]').attr('content') || $('img.poster, .cd-poster img').attr('src') || '';
      const background = $('meta[property="og:image"]').attr('content') || undefined;

      const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/) || res.data.match(/\/nam\/(\d{4})/);
      const year = yearMatch ? yearMatch[1] : '';

      const genres: string[] = [];
      $('a[href*="/the-loai/"]').each((_, el) => {
        genres.push($(el).text().trim());
      });

      const releases: Xem20Release[] = [];
      const episodeMap = new Map<number, Xem20Release[]>();

      $('article.cd-release').each((_, el) => {
        const $el = $(el);
        const name = $el.find('p.cd-release__name').text().trim();
        const metaText = $el.find('div.cd-release__meta').text().replace(/\s+/g, ' ').trim();

        const form = $el.find('form[data-download-form], form[action*="/download-links/"]');
        const action = form.attr('action') || '';
        const idMatch = action.match(/\/download-links\/(\d+)\/access/);
        const downloadLinkId = idMatch ? idMatch[1] : null;

        if (!downloadLinkId) return;

        const formToken = (form.find('input[name="_token"]').val() as string) || pageToken || this.csrfToken || '';
        this.releaseMetadata.set(downloadLinkId, {
          slug,
          token: formToken,
        });

        let season = 1;
        let episode: number | null = null;

        const epMatch = name.match(/[Tt]ập\s*(\d+)/i) || name.match(/\bS(\d+)E(\d+)\b/i) || name.match(/\bE(\d+)\b/i);
        if (epMatch) {
          if (epMatch.length === 3 && epMatch[1] && epMatch[2]) {
            season = parseInt(epMatch[1], 10);
            episode = parseInt(epMatch[2], 10);
          } else {
            episode = parseInt(epMatch[1], 10);
          }
        }

        const releaseObj: Xem20Release = {
          downloadLinkId,
          name,
          metaText,
          season,
          episode,
        };

        releases.push(releaseObj);

        if (episode !== null) {
          if (!episodeMap.has(episode)) episodeMap.set(episode, []);
          episodeMap.get(episode)!.push(releaseObj);
        }
      });

      const isSeries = episodeMap.size > 0 || slug.includes('phim-bo') || releases.some(r => r.episode !== null);

      const movieDetailResult: Xem20MovieDetail = {
        slug: cleanSlug,
        title,
        overview,
        poster,
        background,
        year,
        genres,
        isSeries,
        releases,
        episodeMap,
      };

      this.detailCache.set(cleanSlug, movieDetailResult);
      return movieDetailResult;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[XEM20] Lỗi khi lấy chi tiết phim ${slug}:`, errorMsg);
      return null;
    }
  }

  async resolveStreamUrl(downloadLinkId: string): Promise<string> {
    const cached = this.streamCache.get(downloadLinkId);
    if (cached) return cached;

    await this.ensureLoggedIn();

    const meta = this.releaseMetadata.get(downloadLinkId) || { slug: '', token: '' };
    const token = meta.token || this.csrfToken || '';
    const refererUrl = meta.slug ? `${config.xem20.baseUrl}/${meta.slug}` : `${config.xem20.baseUrl}/`;

    const accessUrl = `${config.xem20.baseUrl}/download-links/${downloadLinkId}/access`;
    console.log(`[XEM20] Đang lấy vé tải cho release #${downloadLinkId}...`);

    try {
      const params = new URLSearchParams();
      params.append('_token', token);

      const res = await this.client.post(accessUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': refererUrl,
          'Origin': config.xem20.baseUrl,
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const redirectUrl = res.headers['location'] || res.headers['Location'] || '';
      let hash: string | null = null;
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

      this.streamCache.set(downloadLinkId, directStreamUrl);
      return directStreamUrl;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[XEM20] Lỗi khi lấy stream cho release #${downloadLinkId}:`, errorMsg);
      throw err;
    }
  }
}

export const xem20Client = new Xem20Client();