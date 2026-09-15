const { URL } = require('url');

class HlsCleaner {
  constructor() {
    this.cleanCache = new Map(); // cache kết quả m3u8 tránh gọi nhiều lần gây treo
  }

  cleanM3u8(requestUrl, content, host) {
    if (!content || typeof content !== 'string') return content;

    const cacheKey = `${requestUrl}_${content.length}`;
    if (this.cleanCache.has(cacheKey)) {
      return this.cleanCache.get(cacheKey);
    }

    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return content;

    // 1. MASTER PLAYLIST (Chứa danh sách chất lượng video hoặc audio media)
    if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA')) {
      const result = [];
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Xử lý các track audio/phụ đề độc lập
        if (line.startsWith('#EXT-X-MEDIA:')) {
          line = line.replace(/URI="([^"]+)"/, (match, uri) => {
            try {
              const abs = new URL(uri, requestUrl).href;
              return `URI="${host}/m3u8/stream.m3u8?url=${encodeURIComponent(abs)}"`;
            } catch (e) {
              return match;
            }
          });
          result.push(line);
          continue;
        }

        result.push(line);

        // Xử lý variant stream bên dưới #EXT-X-STREAM-INF
        if (line.startsWith('#EXT-X-STREAM-INF') && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (!nextLine.startsWith('#')) {
            try {
              const variantUrl = new URL(nextLine, requestUrl).href;
              result.push(`${host}/m3u8/stream.m3u8?url=${encodeURIComponent(variantUrl)}`);
              i++;
            } catch (e) {
              result.push(nextLine);
              i++;
            }
          }
        }
      }
      const resText = result.join('\n');
      this.setCache(cacheKey, resText);
      return resText;
    }

    // 2. MEDIA PLAYLIST (.ts Segments): Lọc quảng cáo v7, v8, ads, convertv
    const segmentUrls = lines.filter(l => !l.startsWith('#'));
    const pathCounts = new Map();

    for (const u of segmentUrls) {
      const cleanU = u.replace(/convertv\d+\//gi, '');
      const pathDir = cleanU.includes('/') ? cleanU.substring(0, cleanU.lastIndexOf('/')) : '';
      pathCounts.set(pathDir, (pathCounts.get(pathDir) || 0) + 1);
    }

    let mainPath = '';
    let maxCount = 0;
    for (const [p, count] of pathCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mainPath = p;
      }
    }

    // Tách thành các block dựa theo #EXT-X-DISCONTINUITY
    const headerLines = [];
    const blocks = [];
    let currentBlock = [];
    let isHeader = true;

    for (const line of lines) {
      if (line.startsWith('#EXT-X-DISCONTINUITY')) {
        isHeader = false;
        if (currentBlock.length > 0) blocks.push(currentBlock);
        currentBlock = [];
      } else if (isHeader && line.startsWith('#EXT') && !line.startsWith('#EXTINF')) {
        headerLines.push(line);
      } else {
        if (!line.startsWith('#EXT-X-ENDLIST')) {
          isHeader = false;
          currentBlock.push(line);
        }
      }
    }
    if (currentBlock.length > 0) blocks.push(currentBlock);

    // Lọc bỏ quảng cáo
    const filteredBlocks = blocks.filter(block => {
      const segs = block.filter(l => !l.startsWith('#'));
      if (segs.length === 0) return false;

      // Nếu chứa url rõ ràng là qc
      if (segs.some(l => /\/(v\d+|ads|qc|intro|banner)\//i.test(l))) return false;

      // Nếu khác path chính và chỉ có vài segment (< 15) -> qc chèn
      const firstSeg = segs[0].replace(/convertv\d+\//gi, '');
      const blockPath = firstSeg.includes('/') ? firstSeg.substring(0, firstSeg.lastIndexOf('/')) : '';
      if (mainPath && blockPath !== mainPath && segs.length < 15) {
        return false;
      }

      return true;
    });

    // Nếu lọc xong mà bị rỗng (do nhận diện nhầm), giữ nguyên playlist gốc để không làm chết phim
    if (filteredBlocks.length === 0) {
      return content;
    }

    const output = [...headerLines];
    filteredBlocks.forEach((block, index) => {
      if (index > 0) {
        output.push('#EXT-X-DISCONTINUITY');
      }

      for (const line of block) {
        if (!line.startsWith('#')) {
          const cleanLine = line.replace(/convertv\d+\//gi, '');
          try {
            output.push(new URL(cleanLine, requestUrl).href);
          } catch (e) {
            output.push(cleanLine);
          }
        } else if (line.startsWith('#EXT-X-KEY')) {
          try {
            const keyMatch = line.match(/URI="([^"]+)"/);
            if (keyMatch) {
              const absKey = new URL(keyMatch[1], requestUrl).href;
              output.push(line.replace(keyMatch[1], absKey));
            } else {
              output.push(line);
            }
          } catch (e) {
            output.push(line);
          }
        } else {
          output.push(line);
        }
      }
    });

    if (content.includes('#EXT-X-ENDLIST')) {
      output.push('#EXT-X-ENDLIST');
    }

    const finalText = output.join('\n');
    this.setCache(cacheKey, finalText);
    return finalText;
  }

  setCache(key, value) {
    if (this.cleanCache.size > 200) {
      const firstKey = this.cleanCache.keys().next().value;
      this.cleanCache.delete(firstKey);
    }
    this.cleanCache.set(key, value);
  }
}

module.exports = new HlsCleaner();