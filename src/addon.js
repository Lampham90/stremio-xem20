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

// 1. MANIFEST (Tên: 'Ghiền Phim', Mô tả: 'Xem phim không quảng cáo')
// 26 danh mục đồng bộ 100% chuẩn theo thứ tự HomeScreen.kt của App Android Phimkk
const manifest = {
  id: 'community.ghienphim',
  version: '2.5.0',
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
      name: '🏆 Top Trending',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_phim_chieu_rap',
      name: '🎬 Cine Rạp',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_anime_nhat',
      name: '🇯🇵 Anime Hot',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_long_tieng',
      name: '🎙 Lồng Tiếng Cực Mạnh',
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
      id: 'kk_hh_trung_quoc',
      name: '🐉 HH3D Trung Quốc',
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
      id: 'kk_kinh_di',
      name: '💀 Đừng coi một mình',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_han',
      name: '🇰🇷 Drama Hàn Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_trung',
      name: '📺 Drama Trung Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_vn',
      name: '🇻🇳 Cine Việt Nè Ní',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_han',
      name: '🇰🇷 Điện ảnh Hàn',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_trung',
      name: '🇨🇳 Điện ảnh Trung',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_au_my',
      name: '🇺🇸 Bom tấn Âu Mỹ',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_le_thai',
      name: '🇹🇭 Điện ảnh Thái',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_vn',
      name: '🇻🇳 Drama Việt Nam',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_au_my',
      name: '🇺🇸 Drama Âu Mỹ',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_nhat',
      name: '🇯🇵 Drama Nhật Bản',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_bo_thai',
      name: '🇹🇭 Drama Thái Lan',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_trending_phim_bo',
      name: '🔥 Trending Phim Bộ',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_co_trang',
      name: '📜 Phim Cổ Trang',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_hanh_dong',
      name: '💥 Hành Động kịch tính',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_hai_huoc',
      name: '😂 Hài Hước giải trí',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_khoa_hoc',
      name: '🧠 Khoa Học Đời Sống',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'kk_tam_ly',
      name: '🎭 Tâm Lý tình cảm',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_tv_show',
      name: '📺 TV Show hot',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ]
};

router.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

// 2. CATALOG
router.get('/catalog/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const skip = parseInt(req.query.skip || '0', 10);
  const search = req.query.search;

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

// 3. META (Hiển thị chi tiết phim gốc)
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
      if (detail) {
        return res.json({
          meta: {
            id,
            type: detail.isSeries ? 'series' : 'movie',
            name: detail.title,
            poster: detail.poster,
            background: detail.background,
            releaseInfo: detail.year ? String(detail.year) : '',
            description: detail.description,
            genres: detail.genres,
            director: detail.director ? [detail.director] : [],
            cast: detail.cast || []
          }
        });
      }
    }

    res.status(404).json({ meta: null });
  } catch (err) {
    console.error('[Addon] Lỗi meta:', err.message);
    res.status(500).json({ meta: null });
  }
});

// 4. STREAMS (Phát phim chất lượng cao: XEM20 + KKPhim + NguonC)
router.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;

  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' || (req.headers.host && req.headers.host.includes('onrender.com'));
  const proto = isHttps ? 'https' : 'http';
  const host = req.headers.host ? `${proto}://${req.headers.host}` : config.baseUrl;

  try {
    let targetSlug = null;
    let targetSeason = 1;
    let targetEpisode = 1;
    let movieName = null;
    let movieOriginName = null;
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
        if (!movieYear && kkDetail.year) movieYear = parseInt(kkDetail.year, 10);
      }
    }

    const streams = [];

    // ========================================================
    // 1. NGUỒN XEM20 (ƯU TIÊN HÀNG ĐẦU 4K -> 1080P)
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
    // 2. NGUỒN KKPHIM (ĐÃ QUA BỘ LỌC HlsInterceptor SẠCH)
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
          const cleanM3u8Url = `${host}/m3u8/stream.m3u8?url=${encodeURIComponent(ep.link_m3u8)}`;
          const isDub = sName.toLowerCase().includes('lồng tiếng') || sName.toLowerCase().includes('thuyết minh');

          streams.push({
            _priority: isDub ? 5 : 6,
            name: `KKPhim 🌟 [${sName.toUpperCase()}]`,
            title: `${movieName} - Tập ${targetEpisode}\n🌟 Server VIP (${sName})`,
            url: cleanM3u8Url
          });
        }
      });
    }

    // ========================================================
    // 3. NGUỒN NGUONC (ĐÃ FIX QUA SEGMENT PROXY ĐẢM BẢO KHÔNG TREO)
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
            if (ep.embed) {
              streamUrl = `${host}/m3u8/nguonc.m3u8?embed=${encodeURIComponent(ep.embed)}`;
            } else if (ep.m3u8 || ep.link_m3u8) {
              streamUrl = `${host}/m3u8/stream.m3u8?url=${encodeURIComponent(ep.m3u8 || ep.link_m3u8)}`;
            }

            if (streamUrl) {
              streams.push({
                _priority: 8,
                name: `NguonC 🛡️ [${sName.toUpperCase()}]`,
                title: `${movieName || 'Phim'} - Tập ${targetEpisode}\n🛡️ Server Dự Phòng (${sName})`,
                url: streamUrl
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

// Helper tạo Headers tương thích 100% với AutoHeaderInterceptor.kt
function getAutoHeaders(targetUrl) {
  try {
    const urlObj = new URL(targetUrl);
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': urlObj.origin,
      'Referer': `${urlObj.origin}/`
    };
  } catch (e) {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*'
    };
  }
}

// 5. STREAM M3U8 SẠCH (KKPHIM - RESOLVE MASTER PLAYLIST VÀ LỌC BẰNG HlsInterceptor)
router.all(['/m3u8/stream.m3u8', '/clean/stream.m3u8'], async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  try {
    let m3u8Url = targetUrl;
    const upstreamRes = await axios.get(m3u8Url, {
      headers: getAutoHeaders(m3u8Url),
      timeout: 10000,
      responseType: 'text',
      agent: httpsAgent
    });

    let content = upstreamRes.data;

    // Nếu là Master Playlist, tự động resolve variant trực tiếp để ExoPlayer nhận media playlist sạch ngay trong 1 request
    if (content.includes('#EXT-X-STREAM-INF')) {
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF') && i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
          const variantUrl = new URL(lines[i + 1], m3u8Url).href;
          const varRes = await axios.get(variantUrl, {
            headers: getAutoHeaders(variantUrl),
            timeout: 10000,
            responseType: 'text',
            agent: httpsAgent
          });
          m3u8Url = variantUrl;
          content = varRes.data;
          break;
        }
      }
    }

    const cleanContent = hlsCleaner.cleanM3u8(m3u8Url, content);
    res.end(cleanContent);
  } catch (err) {
    console.error('[M3U8 Clean] Lỗi tải m3u8:', err.message);
    res.status(502).send('Error fetching M3U8 stream');
  }
});

// 6. NGUONC EMBED RESOLVER (REWRITE QUA SEGMENT PROXY ĐẢM BẢO 100% KHÔNG TREO)
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

    const cleanContent = hlsCleaner.cleanNguoncM3u8(rawM3u8, embedUrl, host);
    res.end(cleanContent);
  } catch (err) {
    console.error('[NguonC Clean] Lỗi:', err.message);
    res.status(502).send('Error processing NguonC stream');
  }
});

// 7. SEGMENT PROXY CHO NGUONC (GỬI KÈM REFERER TRÁNH 403 FORBIDDEN & TRÁNH TREO)
router.all('/m3u8/segment.ts', (req, res) => {
  const targetUrl = req.query.url;
  const ref = req.query.ref;
  if (!targetUrl) return res.status(400).end();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'video/MP2T');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  const upstreamReq = https.request(targetUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': ref || 'https://embed.streamc.xyz/'
    },
    agent: httpsAgent
  }, (upstreamRes) => {
    res.statusCode = upstreamRes.statusCode;
    if (upstreamRes.headers['content-length']) {
      res.setHeader('Content-Length', upstreamRes.headers['content-length']);
    }
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (e) => {
    console.error('[NguonC Segment Proxy Error]:', e.message);
    if (!res.headersSent) res.status(502).end();
  });

  req.on('close', () => {
    upstreamReq.destroy();
  });

  upstreamReq.end();
});

// 8. SMART PLAY STREAM ENDPOINT (XEM20 Direct CDN vs Proxy Bypass)
router.get('/play/:id', async (req, res) => {
  const downloadLinkId = req.params.id;
  const mode = req.query.mode || 'direct';

  if (!downloadLinkId) {
    return res.status(400).send('Missing downloadLinkId');
  }

  try {
    const playUrl = await xem20Client.getPlayUrl(downloadLinkId);
    if (!playUrl) {
      return res.status(404).send('Stream link expired or not found');
    }

    if (mode === 'proxy') {
      const upstreamReq = https.request(playUrl, {
        method: req.method,
        headers: {
          ...req.headers,
          host: new URL(playUrl).host,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        agent: httpsAgent
      }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
      });

      upstreamReq.on('error', (e) => {
        console.error('[Proxy Error]:', e.message);
        if (!res.headersSent) res.redirect(302, playUrl);
      });

      req.on('close', () => {
        upstreamReq.destroy();
      });

      upstreamReq.end();
    } else {
      res.redirect(302, playUrl);
    }
  } catch (err) {
    console.error('[Play Endpoint] Lỗi phân giải stream:', err.message);
    res.status(500).send('Internal Server Error');
  }
});

// 9. API /api/xem20/movie (Hỗ trợ tương thích cho Phimkk Android TV app)
router.get('/api/xem20/movie', async (req, res) => {
  const { title, originTitle, year } = req.query;
  if (!title && !originTitle) {
    return res.json({ success: false, message: 'Thiếu query title/originTitle' });
  }

  try {
    const searchQueries = [];
    if (originTitle) searchQueries.push(originTitle.trim());
    if (title && title !== originTitle) searchQueries.push(title.trim());

    let matchSlug = null;
    for (const q of searchQueries) {
      if (!q || q.length < 2) continue;
      const results = await xem20Client.search(q);
      if (results && results.length > 0) {
        let match = results[0];
        if (year) {
          const yearMatch = results.find(r => r.description && r.description.includes(String(year)));
          if (yearMatch) match = yearMatch;
        }
        matchSlug = match.slug;
        break;
      }
    }

    if (!matchSlug) {
      return res.json({ success: false, message: 'Không tìm thấy phim trên Xem20' });
    }

    const detail = await xem20Client.getMovieDetail(matchSlug);
    if (!detail) {
      return res.json({ success: false, message: 'Không lấy được chi tiết phim Xem20' });
    }

    const host = req.headers.host ? `${req.protocol}://${req.headers.host}` : config.baseUrl;

    function formatServerLabel(rel) {
      const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('4K') || rel.name.includes('2160p');
      const is1080 = rel.metaText.includes('1080P') || rel.name.includes('1080p');
      const quality = is4K ? '4KUHD' : (is1080 ? '1080p' : '720p');

      const isDub = rel.metaText.includes('Thuyết minh') || rel.metaText.includes('T.Minh') || rel.name.includes('TM.') || rel.name.includes('Thuyết Minh');
      const isSub = rel.metaText.includes('Phụ Đề') || rel.metaText.includes('P.Đề') || rel.name.includes('Vietsub') || rel.name.includes('Sub');

      let audioInfo = '';
      if (isDub && isSub) audioInfo = ' (thuyết minh + vietsub)';
      else if (isDub) audioInfo = ' (thuyết minh)';
      else if (isSub) audioInfo = ' (vietsub)';

      return `${quality}${audioInfo}`;
    }

    function getQualityPriority(rel) {
      const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('4K') || rel.name.includes('2160p');
      const is1080 = rel.metaText.includes('1080P') || rel.name.includes('1080p');
      if (is4K) return 1;
      if (is1080) return 2;
      return 3;
    }

    const servers = [];
    detail.releases.forEach((rel, index) => {
      const serverLabel = formatServerLabel(rel);
      const priority = getQualityPriority(rel);

      servers.push({
        _priority: priority,
        server_name: `${serverLabel} [CDN]`,
        server_data: [
          {
            name: rel.episode ? `Tập ${rel.episode}` : 'Full',
            slug: `ep-${rel.episode || 1}-cdn`,
            filename: rel.name,
            link_embed: '',
            link_m3u8: `${host}/play/${rel.downloadLinkId}?mode=direct`
          }
        ]
      });

      servers.push({
        _priority: priority + 0.5,
        server_name: `${serverLabel} [Bypass]`,
        server_data: [
          {
            name: rel.episode ? `Tập ${rel.episode}` : 'Full',
            slug: `ep-${rel.episode || 1}-proxy`,
            filename: rel.name,
            link_embed: '',
            link_m3u8: `${host}/play/${rel.downloadLinkId}?mode=proxy`
          }
        ]
      });
    });

    servers.sort((a, b) => a._priority - b._priority);
    servers.forEach(s => delete s._priority);

    res.json({
      success: true,
      movie: {
        id: detail.id,
        name: detail.title,
        slug: detail.slug,
        year: detail.year,
        poster: detail.poster,
        background: detail.background,
        isSeries: detail.isSeries,
        servers: servers
      }
    });
  } catch (err) {
    console.error('[API Xem20 Movie Error]:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Background keepalive ping đến Render resolver để không bao giờ bị cold start
setInterval(() => {
  axios.get('https://ghienphim-ktfd.onrender.com/health').catch(() => {});
}, 8 * 60 * 1000);

// Khởi tạo preload nhanh danh mục hàng đầu
setTimeout(async () => {
  try {
    console.log('[Init] Tải trước danh mục hàng đầu để nạp sẵn IMDb mapping...');
    await kkphim.getCatalog('kk_latest', 0);
    await kkphim.getCatalog('kk_phim_chieu_rap', 0);
    console.log('[Init] Preload hoàn tất!');
  } catch (e) {}
}, 2000);

module.exports = router;
