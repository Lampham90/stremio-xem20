const express = require('express');
const https = require('https');
const axios = require('axios');
const xem20Client = require('./services/xem20Client');
const cinemeta = require('./services/cinemeta');
const kkphim = require('./services/kkphimService');
const nguonc = require('./services/nguoncService');
const hlsCleaner = require('./services/hlsCleaner');
const config = require('./config');

const router = express.Router();

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: 60000
});

// 1. MANIFEST (Đổi tên thành 'Ghiền Phim', mô tả 'Xem phim không quảng cáo', hỗ trợ tt/kk/xem20)
const manifest = {
  id: 'community.ghienphim',
  version: '2.1.0',
  name: 'Ghiền Phim',
  description: 'Xem phim không quảng cáo',
  logo: 'https://xem20.net/storage/logo/favicon_xem14.png',
  background: 'https://xem20.net/storage/poster1/download.jpg',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'kk:', 'xem20:'],
  catalogs: [
    {
      type: 'movie',
      id: 'kk_latest',
      name: '🔥 Phim Mới Cập Nhật',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_phim_chieu_rap',
      name: '🎬 Phim Chiếu Rạp',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_long_tieng',
      name: '🎙️ Phim Lồng Tiếng',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_thuyet_minh',
      name: '🎤 Phim Thuyết Minh',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_han',
      name: '🇰🇷 Phim Bộ Hàn Quốc',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_trung',
      name: '📺 Phim Bộ Trung Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_au_my',
      name: '🇺🇸 Phim Bộ Âu Mỹ',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_vn',
      name: '🇻🇳 Phim Bộ Việt Nam',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_thai',
      name: '🇹🇭 Phim Bộ Thái Lan',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_nhat',
      name: '🇯🇵 Phim Bộ Nhật Bản',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_anime_nhat',
      name: '🇯🇵 Anime Hot',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_hh_trung_quoc',
      name: '🐉 Hoạt Hình 3D Trung Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_anime_movie',
      name: '🍿 Anime Movie Hot',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_vn',
      name: '🇻🇳 Phim Lẻ Việt Nam',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_au_my',
      name: '🇺🇸 Bom Tấn Âu Mỹ',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_han',
      name: '🇰🇷 Điện Ảnh Hàn Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_trung',
      name: '🇨🇳 Điện Ảnh Trung Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_thai',
      name: '🇹🇭 Điện Ảnh Thái Lan',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_hanh_dong',
      name: '💥 Phim Hành Động',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_kinh_di',
      name: '💀 Phim Kinh Dị',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_hai_huoc',
      name: '😂 Phim Hài Hước',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_co_trang',
      name: '📜 Phim Cổ Trang',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_khoa_hoc',
      name: '🧠 Phim Khoa Học',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_tam_ly',
      name: '🎭 Phim Tâm Lý',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_tv_show',
      name: '📺 TV Shows',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ]
};

router.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

// 2. CATALOG
router.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  const { type, id } = req.params;
  const extraStr = req.params.extra || '';
  const searchParams = new URLSearchParams(extraStr);
  const search = searchParams.get('search') || req.query.search;
  const skip = parseInt(searchParams.get('skip') || req.query.skip || '0', 10);

  try {
    let metas = [];
    if (search) {
      metas = await kkphim.search(search);
    } else {
      metas = await kkphim.getCatalog(id, skip);
    }

    res.json({ metas });
  } catch (err) {
    console.error('[Addon] Lỗi catalog:', err.message);
    res.json({ metas: [] });
  }
});

// 3. META
router.get('/meta/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;

  try {
    let targetSlug = null;

    if (id.startsWith('kk:')) {
      targetSlug = id.replace('kk:', '');
    } else if (id.startsWith('tt')) {
      targetSlug = await kkphim.findSlugByImdb(id);
    }

    if (targetSlug) {
      const detail = await kkphim.getMovieDetail(targetSlug);
      if (detail) {
        const meta = {
          id: id,
          type: detail.isSeries ? 'series' : 'movie',
          name: detail.title,
          genres: detail.genres,
          poster: detail.poster,
          background: detail.background,
          description: detail.description,
          releaseInfo: detail.year ? String(detail.year) : '',
          director: detail.director ? [detail.director] : [],
          cast: detail.cast || [],
          imdbRating: detail.imdbScore ? String(detail.imdbScore) : undefined
        };

        if (detail.isSeries && detail.videos && detail.videos.length > 0) {
          // Chuẩn hóa ID của các video theo ID hiện tại (tt... hoặc kk:...)
          meta.videos = detail.videos.map(v => ({
            ...v,
            id: `${id}:1:${v.episode}`
          }));
        }

        return res.json({ meta });
      }
    }

    if (id.startsWith('xem20:')) {
      const slug = id.replace('xem20:', '');
      const detail = await xem20Client.getMovieDetail(slug);
      if (!detail) return res.json({ meta: null });

      const meta = {
        id: `xem20:${slug}`,
        type: detail.isSeries ? 'series' : 'movie',
        name: detail.title,
        genres: detail.genres,
        poster: detail.poster,
        background: detail.background,
        description: detail.overview,
        releaseInfo: detail.year
      };

      if (detail.isSeries) {
        const episodes = [];
        const sortedEps = Array.from(detail.episodeMap.keys()).sort((a, b) => a - b);
        for (const epNum of sortedEps) {
          episodes.push({
            id: `xem20:${slug}:1:${epNum}`,
            title: `Tập ${epNum}`,
            season: 1,
            episode: epNum,
            released: new Date().toISOString()
          });
        }
        meta.videos = episodes;
      }

      return res.json({ meta });
    }

    res.json({ meta: null });
  } catch (err) {
    console.error('[Addon] Lỗi meta:', err.message);
    res.json({ meta: null });
  }
});

// 4. STREAM (Tìm Xem20 4K, KKPhim, NguonC với đường dẫn .m3u8 chuẩn)
router.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' || (req.headers.host && req.headers.host.includes('onrender.com'));
  const proto = isHttps ? 'https' : 'http';
  const host = req.headers.host ? `${proto}://${req.headers.host}` : config.baseUrl;

  try {
    let targetSlug = null;
    let targetSeason = 1;
    let targetEpisode = 1;
    let movieName = '';
    let movieOriginName = '';
    let movieYear = null;
    let kkDetail = null;

    if (id.startsWith('kk:')) {
      const parts = id.replace('kk:', '').split(':');
      targetSlug = parts[0];
      if (parts.length >= 3) {
        targetSeason = parseInt(parts[1], 10) || 1;
        targetEpisode = parseInt(parts[2], 10) || 1;
      }
    } else if (id.startsWith('tt')) {
      const parts = id.split(':');
      const imdbId = parts[0];
      if (parts.length >= 3) {
        targetSeason = parseInt(parts[1], 10) || 1;
        targetEpisode = parseInt(parts[2], 10) || 1;
      }

      targetSlug = await kkphim.findSlugByImdb(imdbId);

      const cm = await cinemeta.getMeta(type, imdbId);
      if (cm && cm.name) {
        movieOriginName = cm.name;
        if (!movieName) movieName = cm.name;
        movieYear = cm.year ? parseInt(cm.year, 10) : null;
      }
    } else if (id.startsWith('xem20:')) {
      const parts = id.replace('xem20:', '').split(':');
      const xSlug = parts[0];
      if (parts.length >= 3) {
        targetSeason = parseInt(parts[1], 10) || 1;
        targetEpisode = parseInt(parts[2], 10) || 1;
      }
      const xDetail = await xem20Client.getMovieDetail(xSlug);
      if (xDetail) {
        movieName = xDetail.title;
        movieYear = xDetail.year ? parseInt(xDetail.year, 10) : null;
      }
    }

    if (targetSlug) {
      kkDetail = await kkphim.getMovieDetail(targetSlug);
      if (kkDetail) {
        movieName = kkDetail.title;
        if (!movieOriginName) movieOriginName = kkDetail.originTitle || '';
        if (!movieYear) movieYear = kkDetail.year;
      }
    }

    const streams = [];

    // ========================================================
    // 1. NGUỒN XEM20 (ƯU TIÊN SỐ 1 - 4K UHD & 1080P FHD)
    // ========================================================
    try {
      const searchQueries = [];
      if (movieOriginName) searchQueries.push(movieOriginName);
      if (movieName && movieName !== movieOriginName) searchQueries.push(movieName);

      let xem20Slug = null;
      for (const q of searchQueries) {
        if (!q || q.length < 2) continue;
        const results = await xem20Client.search(q);
        if (results && results.length > 0) {
          let match = results[0];
          if (movieYear) {
            const yearMatch = results.find(r => r.description && r.description.includes(String(movieYear)));
            if (yearMatch) match = yearMatch;
          }
          xem20Slug = match.slug;
          break;
        }
      }

      if (xem20Slug) {
        const xDetail = await xem20Client.getMovieDetail(xem20Slug);
        if (xDetail && xDetail.releases && xDetail.releases.length > 0) {
          let matchingReleases = [];
          if (xDetail.isSeries || targetEpisode > 1) {
            if (xDetail.episodeMap && xDetail.episodeMap.has(targetEpisode)) {
              matchingReleases = xDetail.episodeMap.get(targetEpisode);
            } else {
              matchingReleases = xDetail.releases.filter(r => r.episode === targetEpisode);
              if (matchingReleases.length === 0) matchingReleases = xDetail.releases;
            }
          } else {
            matchingReleases = xDetail.releases;
          }

          matchingReleases.forEach(rel => {
            const isDub = rel.metaText.includes('Thuyết minh') || rel.metaText.includes('T.Minh') || rel.name.includes('TM.') || rel.name.includes('Thuyết Minh');
            const isSub = rel.metaText.includes('Phụ Đề') || rel.metaText.includes('P.Đề') || rel.name.includes('Vietsub') || rel.name.includes('Sub');
            const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('4K') || rel.name.includes('2160p');
            const is1080 = rel.metaText.includes('1080P') || rel.name.includes('1080p');

            let qualityTag = is4K ? '4K UHD' : (is1080 ? '1080P FHD' : 'HD 720P');

            let audioTag = '';
            if (isDub && isSub) audioTag = '🔊 Thuyết Minh + 💬 Vietsub';
            else if (isDub) audioTag = '🔊 Thuyết Minh';
            else if (isSub) audioTag = '💬 Vietsub';

            const sortPriority = is4K ? 1 : (is1080 ? 2 : 3);

            // Direct CDN
            streams.push({
              _priority: sortPriority,
              name: `XEM20 ⚡ [${qualityTag}]`,
              title: `${rel.name}\n⚡ Siêu Tốc (Direct CDN)${audioTag ? '\n' + audioTag : ''}`,
              url: `${host}/play/${rel.downloadLinkId}?mode=direct`
            });

            // Proxy Bypass
            streams.push({
              _priority: sortPriority + 0.5,
              name: `XEM20 🛡️ [${qualityTag}]`,
              title: `${rel.name}\n🛡️ Dự Phòng (Proxy Bypass)${audioTag ? '\n' + audioTag : ''}`,
              url: `${host}/play/${rel.downloadLinkId}?mode=proxy`
            });
          });
        }
      }
    } catch (eX) {
      console.warn('[Addon] Lỗi tìm nguồn Xem20:', eX.message);
    }

    // ========================================================
    // 2. NGUỒN KKPHIM (ĐÃ SỬA: ĐƯỜNG DẪN .M3U8 & DIRECT CDN)
    // ========================================================
    if (kkDetail && kkDetail.episodes && kkDetail.episodes.length > 0) {
      kkDetail.episodes.forEach(server => {
        const sName = server.server_name || 'VIP';
        const serverData = server.server_data || [];
        const ep = serverData.find(e => {
          const num = parseInt(e.name?.replace(/\D/g, '') || '', 10);
          return num === targetEpisode;
        }) || serverData[targetEpisode - 1] || serverData[0];

        if (ep && ep.link_m3u8) {
          // 1. Luồng M3U8 chuẩn qua bộ lọc (đảm bảo đuôi .m3u8)
          const cleanM3u8Url = `${host}/m3u8/stream.m3u8?url=${encodeURIComponent(ep.link_m3u8)}`;
          const isDub = sName.toLowerCase().includes('lồng tiếng') || sName.toLowerCase().includes('thuyết minh');

          streams.push({
            _priority: isDub ? 5 : 6,
            name: `KKPhim 🌟 [${sName.toUpperCase()}]`,
            title: `${movieName} - Tập ${targetEpisode}\n🌟 Server VIP (${sName})`,
            url: cleanM3u8Url,
            behaviorHints: {
              notWebReady: true,
              proxyHeaders: {
                request: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                  'Referer': 'https://phimapi.com/'
                }
              }
            }
          });

          // 2. Luồng Direct CDN trực tiếp từ nguồn
          streams.push({
            _priority: (isDub ? 5 : 6) + 0.5,
            name: `KKPhim ⚡ [${sName.toUpperCase()}]`,
            title: `${movieName} - Tập ${targetEpisode}\n⚡ Server Trực Tiếp (${sName})`,
            url: ep.link_m3u8,
            behaviorHints: {
              notWebReady: true,
              proxyHeaders: {
                request: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                  'Referer': 'https://phimapi.com/'
                }
              }
            }
          });
        }
      });
    }

    // ========================================================
    // 3. NGUỒN NGUONC (ĐÃ SỬA: ĐƯỜNG DẪN .M3U8)
    // ========================================================
    try {
      let nguoncDetail = null;
      if (targetSlug) {
        nguoncDetail = await nguonc.getMovieDetail(targetSlug);
      }
      if (!nguoncDetail && (movieOriginName || movieName)) {
        const kw = (movieOriginName || movieName).replace(/\((19|20)\d{2}\)/, '').trim();
        const searchItems = await nguonc.searchMovie(kw);
        if (searchItems.length > 0) {
          nguoncDetail = await nguonc.getMovieDetail(searchItems[0].slug);
        }
      }

      if (nguoncDetail && nguoncDetail.movie && nguoncDetail.movie.episodes) {
        const nServers = nguoncDetail.movie.episodes;
        nServers.forEach(s => {
          const sName = s.server_name || 'Nguồn C';
          const items = s.items || [];
          const ep = items.find(e => {
            const num = parseInt(e.name?.replace(/\D/g, '') || '', 10);
            return num === targetEpisode;
          }) || items[targetEpisode - 1] || items[0];

          if (ep) {
            let streamUrl = '';
            if (ep.m3u8 || ep.link_m3u8) {
              streamUrl = `${host}/m3u8/stream.m3u8?url=${encodeURIComponent(ep.m3u8 || ep.link_m3u8)}`;
            } else if (ep.embed) {
              streamUrl = `${host}/m3u8/nguonc.m3u8?embed=${encodeURIComponent(ep.embed)}`;
            }

            if (streamUrl) {
              streams.push({
                _priority: 8,
                name: `NguonC 🛡️ [${sName.toUpperCase()}]`,
                title: `${movieName || 'Phim'} - Tập ${targetEpisode}\n🛡️ Server Dự Phòng (${sName})`,
                url: streamUrl,
                behaviorHints: {
                  notWebReady: true,
                  proxyHeaders: {
                    request: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      'Referer': 'https://phim.nguonc.com/'
                    }
                  }
                }
              });
            }
          }
        });
      }
    } catch (eN) {
      console.warn('[Addon] Lỗi tìm nguồn NguonC:', eN.message);
    }

    streams.sort((a, b) => (a._priority || 99) - (b._priority || 99));
    streams.forEach(s => delete s._priority);

    res.json({ streams });
  } catch (err) {
    console.error('[Addon] Lỗi stream:', err.message);
    res.json({ streams: [] });
  }
});

// 5. STREAM M3U8 SẠCH (CÓ ĐUÔI .M3U8 ĐỂ EXOPLAYER & STREMIO PHÁT NGAY)
router.all(['/m3u8/stream.m3u8', '/clean/stream.m3u8'], async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');

  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' || (req.headers.host && req.headers.host.includes('onrender.com'));
  const proto = isHttps ? 'https' : 'http';
  const host = req.headers.host ? `${proto}://${req.headers.host}` : config.baseUrl;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  try {
    const upstreamRes = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': targetUrl
      },
      timeout: 10000,
      responseType: 'text'
    });

    const cleanContent = hlsCleaner.cleanM3u8(targetUrl, upstreamRes.data, host);
    res.end(cleanContent);
  } catch (err) {
    console.error('[M3U8 Clean] Lỗi tải m3u8:', err.message);
    // Nếu lỗi proxy, redirect trực tiếp về nguồn gốc để player tự phát
    res.redirect(302, targetUrl);
  }
});

// 6. NGUONC EMBED RESOLVER (CÓ ĐUÔI .M3U8)
router.all(['/m3u8/nguonc.m3u8', '/clean/nguonc.m3u8'], async (req, res) => {
  const embedUrl = req.query.embed;
  if (!embedUrl) return res.status(400).send('Missing embed');

  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' || (req.headers.host && req.headers.host.includes('onrender.com'));
  const proto = isHttps ? 'https' : 'http';
  const host = req.headers.host ? `${proto}://${req.headers.host}` : config.baseUrl;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  try {
    const rawM3u8 = await nguonc.resolveEmbed(embedUrl);
    if (!rawM3u8) return res.status(502).send('Failed to resolve NguonC embed stream');

    const cleanContent = hlsCleaner.cleanM3u8(embedUrl, rawM3u8, host);
    res.end(cleanContent);
  } catch (err) {
    console.error('[NguonC Clean] Lỗi:', err.message);
    res.status(502).send('Error resolving embed');
  }
});

// 7. SMART PLAY STREAM ENDPOINT (XEM20 Direct CDN vs Proxy Bypass)
router.get('/play/:id', async (req, res) => {
  const downloadLinkId = req.params.id;
  const mode = req.query.mode || 'direct';

  try {
    const directStreamUrl = await xem20Client.resolveStreamUrl(downloadLinkId);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (mode === 'direct') {
      return res.redirect(307, directStreamUrl);
    }

    const clientRange = req.headers.range;
    const streamHeaders = {
      'User-Agent': config.xem20.userAgent,
      'Referer': config.xem20.baseUrl + '/',
      'Connection': 'keep-alive'
    };

    if (clientRange) {
      streamHeaders['Range'] = clientRange;
    }

    const upstreamReq = https.request(directStreamUrl, {
      method: 'GET',
      headers: streamHeaders,
      agent: httpsAgent
    }, (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode;
      const copyHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'last-modified',
        'etag'
      ];
      copyHeaders.forEach((h) => {
        if (upstreamRes.headers[h]) {
          res.setHeader(h, upstreamRes.headers[h]);
        }
      });
      upstreamRes.pipe(res);
    });

    upstreamReq.on('error', (e) => {
      console.error(`[Play #${downloadLinkId}] [Proxy Error]:`, e.message);
      if (!res.headersSent) res.status(502).end();
    });

    req.on('close', () => {
      upstreamReq.destroy();
    });

    upstreamReq.end();
  } catch (err) {
    console.error(`[Play #${downloadLinkId}] Lỗi lấy stream:`, err.message);
    res.status(500).send('Không thể phát video này từ máy chủ xem20.');
  }
});

// 8. API /api/xem20/movie (Hỗ trợ tương thích cho Phimkk Android TV app)
router.get('/api/xem20/movie', async (req, res) => {
  const { title, originTitle, year } = req.query;
  if (!title && !originTitle) {
    return res.status(400).json({ success: false, message: 'Missing title or originTitle' });
  }

  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' || (req.headers.host && req.headers.host.includes('onrender.com'));
  const proto = isHttps ? 'https' : 'http';
  const host = req.headers.host ? `${proto}://${req.headers.host}` : config.baseUrl;

  try {
    const searchQueries = [];
    if (originTitle) searchQueries.push(originTitle.trim());
    if (title && title !== originTitle) searchQueries.push(title.trim());

    let foundSlug = null;
    for (const q of searchQueries) {
      if (!q || q.length < 2) continue;
      const results = await xem20Client.search(q);
      if (results && results.length > 0) {
        let match = results[0];
        if (year) {
          const yMatch = results.find(r => r.description && r.description.includes(String(year)));
          if (yMatch) match = yMatch;
        }
        foundSlug = match.slug;
        break;
      }
    }

    if (!foundSlug) {
      return res.json({ success: false, servers: [] });
    }

    const detail = await xem20Client.getMovieDetail(foundSlug);
    if (!detail || !detail.releases || detail.releases.length === 0) {
      return res.json({ success: false, servers: [] });
    }

    const servers = [];
    if (detail.isSeries && detail.episodeMap && detail.episodeMap.size > 0) {
      const sortedEps = Array.from(detail.episodeMap.keys()).sort((a, b) => a - b);
      const releaseTypes = new Map();

      for (const epNum of sortedEps) {
        const rels = detail.episodeMap.get(epNum) || [];
        for (const rel of rels) {
          const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('4K') || rel.name.includes('2160p');
          const is1080 = rel.metaText.includes('1080P') || rel.name.includes('1080p');
          const isDub = rel.metaText.includes('Thuyết minh') || rel.metaText.includes('T.Minh') || rel.name.includes('Thuyết Minh');
          const isSub = rel.metaText.includes('Phụ đề') || rel.metaText.includes('P.Đề') || rel.name.includes('Vietsub');

          let sName = is4K ? '4K UHD' : '1080P FHD';
          if (isDub && !isSub) sName += ' (TM)';
          else if (isSub && !isDub) sName += ' (Sub)';

          if (!releaseTypes.has(sName)) releaseTypes.set(sName, []);
          releaseTypes.get(sName).push({
            name: `Tập ${epNum}`,
            slug: `tap-${epNum}`,
            linkM3u8: `${host}/play/${rel.downloadLinkId}?mode=direct`
          });
        }
      }

      for (const [sName, epList] of releaseTypes.entries()) {
        servers.push({
          serverName: sName,
          serverData: epList
        });
      }
    } else {
      detail.releases.forEach(rel => {
        const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('4K') || rel.name.includes('2160p');
        const is1080 = rel.metaText.includes('1080P') || rel.name.includes('1080p');
        const isDub = rel.metaText.includes('Thuyết minh') || rel.metaText.includes('T.Minh') || rel.name.includes('Thuyết Minh');
        const isSub = rel.metaText.includes('Phụ đề') || rel.metaText.includes('P.Đề') || rel.name.includes('Vietsub');

        let qualityTag = is4K ? '4K UHD' : (is1080 ? '1080P FHD' : 'HD 720P');
        let audioTag = '';
        if (isDub && isSub) audioTag = 'Thuyết Minh + Vietsub';
        else if (isDub) audioTag = 'Thuyết Minh';
        else if (isSub) audioTag = 'Vietsub';

        const serverName = `${qualityTag}${audioTag ? ' (' + audioTag + ')' : ''}`;

        servers.push({
          serverName: serverName,
          serverData: [
            {
              name: 'Full',
              slug: 'full',
              linkM3u8: `${host}/play/${rel.downloadLinkId}?mode=direct`
            }
          ]
        });
      });
    }

    res.json({
      success: true,
      servers: servers
    });
  } catch (err) {
    console.error('[API /api/xem20/movie] Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
