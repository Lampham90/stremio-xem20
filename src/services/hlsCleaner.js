const { URL } = require('url');

class HlsCleaner {
  cleanM3u8(requestUrl, content, host) {
    if (!content || typeof content !== 'string') return content;
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return content;

    // 1. Master Playlist
    if (content.includes('#EXT-X-STREAM-INF')) {
      const result = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          result.push(line);
          if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
            try {
              const variantUrl = new URL(lines[i + 1], requestUrl).href;
              result.push(`${host}/m3u8/clean?url=${encodeURIComponent(variantUrl)}`);
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
    const convertRegex = /convertv\d+\//gi;
    const pathCounts = new Map();
    const uris = lines.filter(l => !l.startsWith('#'));
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

    const cleanBlocks = blocks.filter(block => {
      const segmentsInBlock = block.filter(l => !l.startsWith('#'));
      if (segmentsInBlock.length === 0) return true;

      const firstUri = segmentsInBlock[0];
      const blockPath = firstUri.includes('/') ? firstUri.substring(0, firstUri.lastIndexOf('/')) : '';
      const isMainPath = blockPath === mainPath;
      const isLongBlock = segmentsInBlock.length > 40;
      const pathFrequency = (pathCounts.get(blockPath) || 0) / (uris.length || 1);
      const hasConvert = segmentsInBlock.some(l => convertRegex.test(l));

      return isMainPath || isLongBlock || pathFrequency > 0.2 || hasConvert;
    });

    const finalLines = [...header];
    for (const block of cleanBlocks) {
      for (const line of block) {
        if (!line.startsWith('#')) {
          const cleanedLine = line.replace(convertRegex, '');
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
        } else {
          finalLines.push(line);
        }
      }
    }

    const result = [];
    for (const line of finalLines) {
      if (line === '#EXT-X-DISCONTINUITY' && result[result.length - 1] === '#EXT-X-DISCONTINUITY') continue;
      result.push(line);
    }

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
}

module.exports = new HlsCleaner();
