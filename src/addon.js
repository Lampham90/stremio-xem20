const express = require('express');
const axios = require('axios');
const xem20Client = require('./services/xem20Client');
const cinemeta = require('./services/cinemeta');
const kkphim = require('./services/kkphimService');
const nguonc = require('./services/nguoncService');
const hlsCleaner = require('./services/hlsCleaner');
const config = require('./config');

const router = express.Router();

// 1. MANIFEST
const manifest = {
  id: 'community.ghienphim',
  version: '2.3.0',
  name: 'Ghiền Phim',
  description: 'Xem phim không quảng cáo - Tích hợp Xem20, KKPhim và Nguồn C',
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
    }
  ]
};

router.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

// 2. CATALOG
router.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  const { id } = req.params;
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
    res.json({ metas: [] });
  }
});

// 3. META
router.get('/meta/:type/:id.json', async (req, res) => {
  const { id } = req.params;

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
    res.json({ meta: null });
  }
});

// 4. STREAM (Chạy song song 3 nguồn: Xem20, KKPhim, NguonC)
router.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' || (req.headers.host && req.headers.host.includes('onrender.com'));
  const proto = isHttps ? 'https' : 'http';
  const host = req.headers.host ? `${proto}://${req.headers.host}` : config.baseUrl;

  try {
    let targetSlug = null;
    let targetEpisode = 1;
    let movieName = '';
    let movieOriginName = '';
    let movieYear = null;
    const isSeries = type === 'series' || id.includes(':1:');

    if (id.startsWith('kk:')) {
      const parts = id.replace('kk:', '').split(':');
      targetSlug = parts[0];
      if (parts.length >= 3) targetEpisode = parseInt(parts[2], 10) || 1;
    } else if (id.startsWith('tt')) {
      const parts = id.split(':');
      const imdbId = parts[0];
      if (parts.length >= 3) targetEpisode = parseInt(parts[2], 10) || 1;

      targetSlug = await kkphim.findSlugByImdb(imdbId);
      const cm = await cinemeta.getMeta(type, imdbId);
      if (cm && cm.name) {
        movieOriginName = cm.name;
        movieName = cm.name;
        movieYear = cm.year ? parseInt(cm.year, 10) : null;
      }
    } else if (id.startsWith('xem20:')) {
      const parts = id.replace('xem20:', '').split(':');
      const xSlug = parts[0];
      if (parts.length >= 3) targetEpisode = parseInt(parts[2], 10) || 1;

      const xDetail = await xem20Client.getMovieDetail(xSlug);
      if (xDetail) {
        movieName = xDetail.title;
        movieYear = xDetail.year ? parseInt(xDetail.year, 10) : null;
      }
    }

    let kkDetail = null;
    if (targetSlug) {
      kkDetail = await kkphim.getMovieDetail(targetSlug);
      if (kkDetail) {
        movieName = kkDetail.title;
        if (!movieOriginName) movieOriginName = kkDetail.originTitle || '';
        if (!movieYear) movieYear = kkDetail.year;
      }
    }

    // ----------------------------------------------------
    // HÀM LẤY STREAMS TỪNG NGUỒN VỚI TIMEOUT AN TOÀN
    // ----------------------------------------------------
    const fetchXem20 = async () => {
      const streams = [];
      const bestSlug = await xem20Client.findBestMatchingMovie({
        originTitle: movieOriginName,
        title: movieName,
        year: movieYear,
        isSeries
      });

      if (!bestSlug) return streams;

      const xDetail = await xem20Client.getMovieDetail(bestSlug);
      if (!xDetail || !xDetail.releases || xDetail.releases.length === 0) return streams;

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
        const isDub = rel.metaText.includes('Thuyết minh') || rel.metaText.includes('T.Minh') || rel.name.includes('TM.');
        const isSub = rel.metaText.includes('Phụ Đề') || rel.metaText.includes('P.Đề') || rel.name.includes('Vietsub');
        const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('4K');
        const is1080 = rel.metaText.includes('1080P') || rel.name.includes('1080p');

        let qualityTag = is4K ? '4K UHD' : (is1080 ? '1080P FHD' : 'HD 720P');
        let audioTag = '';
        if (isDub && isSub) audioTag = '🔊 Thuyết Minh + 💬 Vietsub';
        else if (isDub) audioTag = '🔊 Thuyết Minh';
        else if (isSub) audioTag = '💬 Vietsub';

        streams.push({
          _priority: is4K ? 1 : 2,
          name: `XEM20 ⚡ [${qualityTag}]`,
          title: `${rel.name}\n⚡ Tốc độ cao (Direct DownFshare)${audioTag ? '\n' + audioTag : ''}`,
          url: `${host}/play/${rel.downloadLinkId}`
        });
      });

      return streams;
    };

    const fetchKKPhim = async () => {
      const streams = [];
      if (!kkDetail || !kkDetail.episodes) return streams;

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
            _priority: isDub ? 3 : 4,
            name: `KKPhim 🌟 [${sName.toUpperCase()}]`,
            title: `${movieName} - Tập ${targetEpisode}\n🌟 Đã lọc sạch quảng cáo (${sName})`,
            url: cleanM3u8Url,
            behaviorHints: {
              notWebReady: true,
              proxyHeaders: {
                request: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Referer': 'https://phimapi.com/'
                }
              }
            }
          });
        }
      });
      return streams;
    };

    const fetchNguonC = async () => {
      const streams = [];
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
        nguoncDetail.movie.episodes.forEach(s => {
          const sName = s.server_name || 'Nguồn C';
          const items = s.items || [];
          const ep = items.find(e => {
            const num = parseInt(e.name?.replace(/\D/g, '') || '', 10);
            return num === targetEpisode;
          }) || items[targetEpisode - 1] || items[0];

          if (ep && (ep.m3u8 || ep.link_m3u8)) {
            streams.push({
              _priority: 5,
              name: `NguonC 🛡️ [${sName.toUpperCase()}]`,
              title: `${movieName || 'Phim'} - Tập ${targetEpisode}\n🛡️ Dự phòng (${sName})`,
              url: ep.m3u8 || ep.link_m3u8,
              behaviorHints: {
                notWebReady: true,
                proxyHeaders: {
                  request: {
                    'Referer': 'https://phim.nguonc.com/'
                  }
                }
              }
            });
          }
        });
      }
      return streams;
    };

    // Chạy song song cả 3 nguồn với Promise.allSettled
    const results = await Promise.allSettled([
      fetchXem20(),
      fetchKKPhim(),
      fetchNguonC()
    ]);

    let finalStreams = [];
    results.forEach(res => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        finalStreams.push(...res.value);
      }
    });

    finalStreams.sort((a, b) => (a._priority || 99) - (b._priority || 99));
    finalStreams.forEach(s => delete s._priority);

    res.json({ streams: finalStreams });
  } catch (err) {
    console.error('[Addon] Lỗi stream:', err.message);
    res.json({ streams: [] });
  }
});

// 5. STREAM M3U8 SẠCH QUẢNG CÁO (KKPHIM)
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': targetUrl
      },
      timeout: 8000,
      responseType: 'text'
    });

    const cleanContent = hlsCleaner.cleanM3u8(targetUrl, upstreamRes.data, host);
    res.end(cleanContent);
  } catch (err) {
    console.error('[M3U8 Clean] Lỗi tải m3u8:', err.message);
    res.redirect(302, targetUrl);
  }
});

// 6. SMART PLAY STREAM ENDPOINT (XEM20 Direct 307 Redirect - Không bao giờ tốn RAM/Băng thông server)
router.get('/play/:id', async (req, res) => {
  const downloadLinkId = req.params.id;

  try {
    const directStreamUrl = await xem20Client.resolveStreamUrl(downloadLinkId);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Chuyển hướng trực tiếp để client tự stream từ DownFshare
    return res.redirect(307, directStreamUrl);
  } catch (err) {
    console.error(`[Play #${downloadLinkId}] Lỗi lấy stream:`, err.message);
    res.status(500).send('Không thể lấy stream từ máy chủ xem20.');
  }
});

// 7. API /api/xem20/movie (GIỮ NGUYÊN 100% CHO CÁC ỨNG DỤNG KHÁC GỌI NHƯ PHIMKK ANDROID TV)
router.get('/api/xem20/movie', async (req, res) => {
  const { title, originTitle, year } = req.query;
  if (!title && !originTitle) {
    return res.status(400).json({ success: false, message: 'Missing title or originTitle' });
  }

  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' || (req.headers.host && req.headers.host.includes('onrender.com'));
  const proto = isHttps ? 'https' : 'http';
  const host = req.headers.host ? `${proto}://${req.headers.host}` : config.baseUrl;

  try {
    const foundSlug = await xem20Client.findBestMatchingMovie({
      originTitle,
      title,
      year: year ? parseInt(year, 10) : null
    });

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
          const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('4K');
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
            linkM3u8: `${host}/play/${rel.downloadLinkId}`
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
        const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('4K');
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
              linkM3u8: `${host}/play/${rel.downloadLinkId}`
            }
          ]
        });
      });
    }

    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
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