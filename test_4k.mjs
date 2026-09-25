import { xem20Client } from './src/services/xem20Client.js';

async function main() {
  await xem20Client.ensureLoggedIn();
  const searchResults = await xem20Client.search('4K');
  console.log('Search count:', searchResults.length);
  for (const item of searchResults.slice(0, 5)) {
    console.log('--- Movie:', item.name, item.slug);
    const detail = await xem20Client.getMovieDetail(item.slug);
    if (detail && detail.releases) {
      for (const rel of detail.releases) {
        console.log('   Release:', rel.name, '| meta:', rel.metaText, '| id:', rel.downloadLinkId);
      }
    }
  }
}

main().catch(console.error);
