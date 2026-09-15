const { URL } = require('url');

class HlsCleaner {
  cleanM3u8(requestUrl, content, host) {
    if (!content || typeof content !== 'string') return content;
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return content;

    // 1. Master Playlist (chứa #EXT-X-STREAM-INF)
    if (content.includes('#EXT-X-STREAM-INF')) {
      const result = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          result.push(line);
          if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
            try {
              const variantUrl = new URL(lines[i + 1], requestUrl).href;
              result.push(`${host}/m3u8/stream.m3u8?url=${encodeURIComponent(variantUrl)}`);
            } catch (e) {
              result.push(lines[i + 1]);
            }
            i++;
          }
        } else {
          result.push(line);
        }
      }
      return result.join('\n');
    }

    // 2. Media Playlist
    const uris = lines.filter(l => !l.startsWith('#'));
    const pathCounts = new Map();
    for (const uri of uris) {
      const p = uri.includes('/') ? uri.substring(0, uri.lastIndexOf('/')) : '';
      pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
    }

    let mainPath = '';
    let maxCount = 0;
    for (const [p, c] of pathCounts.entries()) {
      if (c > maxCount) {
        maxCount = c;
        mainPath = p;
      }
    }

    const header = [];
    const blocks = [];
    let currentBlock = [];
    let isHeader = true;

    for (const line of lines) {
      if (line.startsWith('#EXT-X-DISCONTINUITY')) {
        isHeader = false;
        if (currentBlock.length > 0) blocks.push(currentBlock);
        currentBlock = [];
      } else if (isHeader && line.startsWith('#EXT') && !line.startsWith('#EXTINF')) {
        header.push(line);
      } else {
        if (!line.startsWith('#EXT-X-ENDLIST')) {
          isHeader = false;
          currentBlock.push(line);
        }
      }
    }
    if (currentBlock.length > 0) blocks.push(currentBlock);

    // Lọc bỏ triệt để các khối quảng cáo chèn ngang
    const cleanBlocks = blocks.filter(block => {
      const segmentsInBlock = block.filter(l => !l.startsWith('#'));
      if (segmentsInBlock.length === 0) return true;

      const firstUri = segmentsInBlock[0];
      const blockPath = firstUri.includes('/') ? firstUri.substring(0, firstUri.lastIndexOf('/')) : '';
      const isMainPath = blockPath === mainPath;
      const isLongBlock = segmentsInBlock.length > 40;
      const pathFrequency = (pathCounts.get(blockPath) || 0) / (uris.length || 1);
      const hasConvert = segmentsInBlock.some(l => /convertv\d+\//i.test(l));

      // Khối quảng cáo riêng biệt (như /v8/.../segment_0001.ts) có path lạ và ngắn -> bị loại bỏ
      return isMainPath || isLongBlock || pathFrequency > 0.2 || hasConvert;
    });

    const finalLines = [...header];
    for (const block of cleanBlocks) {
      for (const line of block) {
        if (!line.startsWith('#')) {
          // Xóa prefix convertv* để gọi trực tiếp phân đoạn video sạch gốc
          const cleanedLine = line.replace(/convertv\d+\//gi, '');
          let absUrl = cleanedLine;
          try {
            absUrl = new URL(cleanedLine, requestUrl).href;
          } catch (e) {}
          finalLines.push(absUrl);
        } else if (line.startsWith('#EXT-X-KEY')) {
          try {
            const keyMatch = line.match(/URI="([^"]+)"/);
            if (keyMatch) {
              const absKey = new URL(keyMatch[1], requestUrl).href;
              finalLines.push(line.replace(keyMatch[1], absKey));
            } else {
              finalLines.push(line);
            }
          } catch (e) {
            finalLines.push(line);
          }
        } else if (!line.startsWith('#EXT-X-DISCONTINUITY')) {
          // Loại bỏ toàn bộ tag DISCONTINUITY của quảng cáo để trình phát không bị khựng lại hay xoay vòng
          finalLines.push(line);
        }
      }
    }

    if (content.includes('#EXT-X-ENDLIST')) finalLines.push('#EXT-X-ENDLIST');
    return finalLines.join('\n');
  }

  cleanNguoncM3u8(rawM3u8, embedUrl, host) {
    if (!rawM3u8 || typeof rawM3u8 !== 'string') return rawM3u8;
    const embedOrigin = new URL(embedUrl).origin;
    const lines = rawM3u8.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const result = [];

    for (const line of lines) {
      if (!line.startsWith('#')) {
        // Rewrite tất cả các phân đoạn sang segment proxy có kèm Referer để tránh lỗi 403 Forbidden
        result.push(`${host}/m3u8/segment.ts?url=${encodeURIComponent(line)}&ref=${encodeURIComponent(embedOrigin)}`);
      } else {
        result.push(line);
      }
    }
    return result.join('\n');
  }
}

module.exports = new HlsCleaner();
