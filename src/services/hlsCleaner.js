const { URL } = require('url');

class HlsCleaner {
  /**
   * Bộ lọc HLS làm sạch quảng cáo tái hiện 100% logic HlsInterceptor.kt
   */
  filterSmartByBlock(requestUrlStr, content) {
    if (!content || typeof content !== 'string') return content;
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return content;

    const convertRegex = /convertv\d+\//gi;

    // 1. Thống kê tần suất xuất hiện của các path phân đoạn
    const pathCounts = new Map();
    const uris = lines.filter(l => !l.startsWith('#'));
    for (const uri of uris) {
      const p = uri.includes('/') ? uri.substring(0, uri.lastIndexOf('/')) : '';
      pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
    }

    let mainPath = '';
    let maxCount = -1;
    for (const [p, c] of pathCounts.entries()) {
      if (c > maxCount) {
        maxCount = c;
        mainPath = p;
      }
    }

    // 2. Chia các phân đoạn thành các Block phân tách bởi #EXT-X-DISCONTINUITY
    const header = [];
    const blocks = [];
    let currentBlock = [];
    let isHeader = true;

    for (const line of lines) {
      if (line.startsWith('#EXT-X-DISCONTINUITY')) {
        isHeader = false;
        if (currentBlock.length > 0) blocks.push(currentBlock);
        currentBlock = [line];
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

    // 3. Lọc bỏ các Block quảng cáo chèn ngang
    const cleanBlocks = blocks.filter(block => {
      const segmentsInBlock = block.filter(l => !l.startsWith('#'));
      if (segmentsInBlock.length === 0) return true;

      const firstUri = segmentsInBlock[0];
      const blockPath = firstUri.includes('/') ? firstUri.substring(0, firstUri.lastIndexOf('/')) : '';
      const isMainPath = blockPath === mainPath;
      const isLongBlock = segmentsInBlock.length > 40;
      const pathFrequency = (pathCounts.get(blockPath) || 0) / (uris.length || 1);
      const hasConvert = segmentsInBlock.some(l => /convertv\d+\//i.test(l));

      // Giữ lại block chính hoặc block video gốc đã chuyển đổi, loại bỏ block quảng cáo riêng biệt
      return isMainPath || isLongBlock || pathFrequency > 0.2 || hasConvert;
    });

    // 4. Xử lý xóa bỏ convertv* để trỏ về phân đoạn video sạch gốc
    const finalLines = [...header];
    for (const block of cleanBlocks) {
      for (const line of block) {
        if (!line.startsWith('#')) {
          // Xóa bỏ convertv* khỏi text (ví dụ: convertv8/dTJR6KN5.ts -> dTJR6KN5.ts)
          const cleanedLine = line.replace(convertRegex, '');
          let absoluteUrl = cleanedLine;
          try {
            absoluteUrl = new URL(cleanedLine, requestUrlStr).href;
          } catch (e) {}
          finalLines.push(absoluteUrl);
        } else if (line.startsWith('#EXT-X-KEY')) {
          try {
            const keyMatch = line.match(/URI="([^"]+)"/);
            if (keyMatch) {
              const absKey = new URL(keyMatch[1], requestUrlStr).href;
              finalLines.push(line.replace(keyMatch[1], absKey));
            } else {
              finalLines.push(line);
            }
          } catch (e) {
            finalLines.push(line);
          }
        } else {
          finalLines.push(line);
        }
      }
    }

    // 5. Khử trùng lặp #EXT-X-DISCONTINUITY liên tiếp
    const result = [];
    for (const line of finalLines) {
      if (line === '#EXT-X-DISCONTINUITY' && result[result.length - 1] === '#EXT-X-DISCONTINUITY') continue;
      result.push(line);
    }

    // Dọn dẹp các tag thừa ở cuối file
    while (
      result.length > 0 &&
      (result[result.length - 1].startsWith('#EXT-X-DISCONTINUITY') ||
        result[result.length - 1].startsWith('#EXT-X-KEY') ||
        result[result.length - 1].startsWith('#EXTINF'))
    ) {
      result.pop();
    }

    if (content.includes('#EXT-X-ENDLIST')) result.push('#EXT-X-ENDLIST');
    return result.join('\n');
  }

  cleanM3u8(requestUrl, content) {
    return this.filterSmartByBlock(requestUrl, content);
  }

  cleanNguoncM3u8(rawM3u8, embedUrl, host) {
    if (!rawM3u8 || typeof rawM3u8 !== 'string') return rawM3u8;
    const embedOrigin = new URL(embedUrl).origin;
    const lines = rawM3u8.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const result = [];

    for (const line of lines) {
      if (!line.startsWith('#')) {
        result.push(`${host}/m3u8/segment.ts?url=${encodeURIComponent(line)}&ref=${encodeURIComponent(embedOrigin)}`);
      } else {
        result.push(line);
      }
    }
    return result.join('\n');
  }
}

module.exports = new HlsCleaner();
