const { URL } = require('url');

class HlsCleaner {
  cleanM3u8(requestUrl, content, host) {
    if (!content || typeof content !== 'string') return content;
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return content;

    // 1. Master Playlist: Điều hướng các variant m3u8 về lại addon để lọc tiếp
    if (content.includes('#EXT-X-STREAM-INF')) {
      const result = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        result.push(line);
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
      return result.join('\n');
    }

    // 2. Media Playlist: Phân tích và lọc bỏ triệt để các đoạn quảng cáo (v7, v8, ads, convertv...)
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

    // Chia danh sách segment thành các khối (blocks) dựa vào tag #EXT-X-DISCONTINUITY
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

    // Lọc bỏ block là quảng cáo
    const filteredBlocks = blocks.filter(block => {
      const segs = block.filter(l => !l.startsWith('#'));
      if (segs.length === 0) return false;

      // 1. Nhận diện folder quảng cáo rõ ràng
      const isAdUrl = segs.some(l => /\/(v\d+|ads|qc|intro)\//i.test(l));
      if (isAdUrl) return false;

      // 2. Khác path gốc và số lượng ít segment -> quảng cáo chèn ngang
      const firstSeg = segs[0].replace(/convertv\d+\//gi, '');
      const blockPath = firstSeg.includes('/') ? firstSeg.substring(0, firstSeg.lastIndexOf('/')) : '';
      if (mainPath && blockPath !== mainPath && segs.length < 15) {
        return false;
      }

      return true;
    });

    // Ghép lại playlist chuẩn: Giữ #EXT-X-DISCONTINUITY ở giữa các block nội dung để player Stremio không bị lỗi
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

    return output.join('\n');
  }
}

module.exports = new HlsCleaner();