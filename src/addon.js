const express = require('express');
const https = require('https');
const http = require('http');
const xem20Client = require('./services/xem20Client');
const cinemeta = require('./services/cinemeta');
const config = require('./config');

const router = express.Router();

// 1. MANIFEST
const manifest = {
  id: 'community.xem20',
  version: '1.0.1',
  name: 'XEM20 - Phim Thuyết Minh & Vietsub',
  description: 'Xem phim chất lượng cao 4K UHD, 1080p Bluray, Thuyết minh và Vietsub trực tiếp từ xem20.net (Xem14)',
  logo: 'https://xem20.net/storage/logo/favicon_xem14.png',
  background: 'https://xem20.net/storage/poster1/download.jpg',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'xem20_movies',
      name: 'XEM20 - Phim Lẻ',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'series',
      id: 'xem20_series',
      name: 'XEM20 - Phim Bộ',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'movie',
      id: 'xem20_new',
      name: 'XEM20 - Mới Có Bản Tải',
      extra: [
        { name: 'skip', isRequired: false }
      ]
    }
  ],
  idPrefixes: ['xem20:', 'tt']
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
      metas = await xem20Client.search(search);
    } else {
      metas = await xem20Client.getCatalog(id, skip);
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

  if (!id.startsWith('xem20:')) {
    return res.json({ meta: null });
  }

  const slug = id.replace('xem20:', '');

  try {
    const detail = await xem20Client.getMovieDetail(slug);
    if (!detail) {
      return res.json({ meta: null });
    }

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

    res.json({ meta });
  } catch (err) {
    console.error('[Addon] Lỗi meta:', err.message);
    res.json({ meta: null });
  }
});

// 4. STREAM
router.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  // Always respect HTTPS on Render / reverse proxies
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' || (req.headers.host && req.headers.host.includes('onrender.com'));
  const proto = isHttps ? 'https' : 'http';
  const host = req.headers.host ? `${proto}://${req.headers.host}` : config.baseUrl;

  try {
    let slug = null;
    let targetSeason = 1;
    let targetEpisode = null;

    if (id.startsWith('xem20:')) {
      const parts = id.split(':');
      slug = parts[1];
      if (parts.length >= 4) {
        targetSeason = parseInt(parts[2], 10) || 1;
        targetEpisode = parseInt(parts[3], 10);
      }
    } else if (id.startsWith('tt')) {
      const parts = id.split(':');
      const imdbId = parts[0];
      if (parts.length >= 3) {
        targetSeason = parseInt(parts[1], 10) || 1;
        targetEpisode = parseInt(parts[2], 10);
      }

      const cm = await cinemeta.getMeta(type, imdbId);
      if (cm && cm.name) {
        console.log(`[Addon] Tìm kiếm phim từ Cinemeta: ${cm.name} (${cm.year || ''})`);
        const searchResults = await xem20Client.search(cm.name);
        if (searchResults.length > 0) {
          slug = searchResults[0].slug;
          console.log(`[Addon] Khớp với phim xem20: ${slug}`);
        }
      }
    }

    if (!slug) {
      return res.json({ streams: [] });
    }

    const detail = await xem20Client.getMovieDetail(slug);
    if (!detail) {
      return res.json({ streams: [] });
    }

    let matchingReleases = [];

    if (detail.isSeries || targetEpisode !== null) {
      if (targetEpisode !== null && detail.episodeMap.has(targetEpisode)) {
        matchingReleases = detail.episodeMap.get(targetEpisode);
      } else {
        matchingReleases = detail.releases.filter(r => r.episode === targetEpisode);
        if (matchingReleases.length === 0) {
          matchingReleases = detail.releases;
        }
      }
    } else {
      matchingReleases = detail.releases;
    }

    const streams = matchingReleases.map(rel => {
      const isDub = rel.metaText.includes('Thuyết minh') || rel.name.includes('TM.') || rel.name.includes('Thuyết Minh');
      const isSub = rel.metaText.includes('Phụ Đề') || rel.metaText.includes('P.Đề') || rel.name.includes('Vietsub') || rel.name.includes('Sub');
      const is4K = rel.metaText.includes('4K') || rel.metaText.includes('2160P') || rel.name.includes('2160p');
      const is1080 = rel.metaText.includes('1080P') || rel.name.includes('1080p');

      let qualityTag = 'HD 720P';
      if (is4K) qualityTag = '4K UHD';
      else if (is1080) qualityTag = '1080P FHD';

      let audioTag = '';
      if (isDub && isSub) audioTag = '🔊 Thuyết Minh + 💬 Phụ Đề';
      else if (isDub) audioTag = '🔊 Thuyết Minh';
      else if (isSub) audioTag = '💬 Vietsub';

      return {
        name: `XEM20 [${qualityTag}]`,
        title: `${rel.name}\n${audioTag ? audioTag + ' · ' : ''}${rel.metaText}`,
        url: `${host}/play/${rel.downloadLinkId}`
      };
    });

    res.json({ streams });
  } catch (err) {
    console.error('[Addon] Lỗi stream:', err.message);
    res.json({ streams: [] });
  }
});

// 5. PLAY STREAM ENDPOINT: DIRECT 307 REDIRECT FOR MAX SPEED
router.get('/play/:id', async (req, res) => {
  const downloadLinkId = req.params.id;
  try {
    const directStreamUrl = await xem20Client.resolveStreamUrl(downloadLinkId);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Chuyển hướng 307 để Stremio kết nối trực tiếp tới máy chủ CDN (dl.downfshare.top)
    // Giúp tận dụng tối đa tốc độ mạng nội địa, xem 4K/1080p mượt mà không bị nghẽn qua Render
    console.log(`[Play #${downloadLinkId}] Chuyển hướng 307 trực tiếp tới: ${directStreamUrl}`);
    return res.redirect(307, directStreamUrl);
  } catch (err) {
    console.error(`[Addon] Không thể phát stream #${downloadLinkId}:`, err.message);
    res.status(502).send('Lỗi khi lấy stream video từ xem20: ' + err.message);
  }
});

module.exports = router;
