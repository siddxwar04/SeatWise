/**
 * Downloads restaurant photos into apps/web/public/images/restaurants.
 * Run from repo root: node scripts/download-venue-photos.js
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const ROOT = path.resolve('apps/web/public/images/restaurants');

const COVERS = {
  'olive-and-grove': '1555396273-367ea4eb4db5',
  'kite-and-string': '1414235077428-338989a2e8c0',
  'forno-nove': '1513104890138-7c749659a591',
  'the-saffron-room': '1585937421612-70a008356fbe',
  'hachi-omakase': '1579871494447-9811cf80d66c',
  'copper-kettle-bakehouse': '1509440159596-0249088772ff',
  'nine-yards': '1540189549336-e6e99c3679fe',
  'basil-and-clay': '1621996346565-e3dbc646d9a9',
  'salt-and-tide': '1559339352-11d035aa65de',
  'mill-and-marrow': '1565557623262-b51c2513a641',
  'harbour-and-vine': '1510812431401-41d2bd2722f3',
  'tiffin-room-42': '1630383249896-424e482df921',
  'neon-gully': '1559314809-0d155014e29e',
  'the-marine-terrace': '1517248135467-4c7edcad34c4',
  'ficus-and-fig': '1517248135467-4c7edcad34c4',
  'malt-and-mash': '1436076863939-06870fe779c2',
  'curry-culture-lab': '1585937421612-70a008356fbe',
  'dosa-republic': '1589301760014-d929f3979dbc',
  'smoke-and-bone': '1558030006-450675393462',
  'sourdough-society': '1555507036-ab1f4038808a',
  'nizam-and-noor': '1512058564366-18510be2db19',
  'deccan-smokehouse': '1432139555190-58524dae6a55',
  'charminar-chai-rooms': '1571934811356-5cc061b6821f',
  'golconda-terrace': '1599487488170-d11ec9c172f0',
  'basil-hive': '1574071318508-1cdbab80d002',
  'kadal-and-coconut': '1498654896293-37aacf113fd9',
  'peppercorn-house': '1567188040759-fb8a883dc6d8',
  'marina-filter-room': '1495474472287-4d71bcdd2085',
  'sixty-feet-east': '1617093727343-374698b1b08d',
  'the-salt-cellar': '1467003909585-2f8a72700288',
  'haveli-nine': '1596797038530-2c107229654b',
  'the-chandni-table': '1512058564366-18510be2db19',
  'cloud-nine-aerocity': '1617093727343-374698b1b08d',
  'kebab-kothi': '1504674900247-0877df9cc836',
};

const GALLERIES = {
  'olive-and-grove': [
    '1517248135467-4c7edcad34c4',
    '1510812431401-41d2bd2722f3',
    '1544025162-d766402d5b3b',
    '1467003909585-2f8a72700288',
  ],
  'kite-and-string': [
    '1517248135467-4c7edcad34c4',
    '1540189549336-e6e99c3679fe',
    '1510812431401-41d2bd2722f3',
    '1467003909585-2f8a72700288',
  ],
  'the-saffron-room': [
    '1596797038530-2c107229654b',
    '1603360946369-dc9bb6250414',
    '1631452180519-c014fe946bcc',
    '1512058564366-18510be2db19',
  ],
  'hachi-omakase': [
    '1617093727343-374698b1b08d',
    '1517248135467-4c7edcad34c4',
    '1467003909585-2f8a72700288',
    '1559339352-11d035aa65de',
  ],
  'copper-kettle-bakehouse': [
    '1555507036-ab1f4038808a',
    '1495474472287-4d71bcdd2085',
    '1540189549336-e6e99c3679fe',
    '1517248135467-4c7edcad34c4',
  ],
};

const BY_CUISINE = {
  Mediterranean: GALLERIES['olive-and-grove'],
  'Small plates': GALLERIES['kite-and-string'],
  'North Indian': GALLERIES['the-saffron-room'],
  Japanese: GALLERIES['hachi-omakase'],
  Bakery: GALLERIES['copper-kettle-bakehouse'],
  Italian: [
    '1513104890138-7c749659a591',
    '1621996346565-e3dbc646d9a9',
    '1574071318508-1cdbab80d002',
    '1517248135467-4c7edcad34c4',
  ],
  Coastal: [
    '1559339352-11d035aa65de',
    '1498654896293-37aacf113fd9',
    '1517248135467-4c7edcad34c4',
    '1467003909585-2f8a72700288',
  ],
  European: [
    '1510812431401-41d2bd2722f3',
    '1467003909585-2f8a72700288',
    '1517248135467-4c7edcad34c4',
    '1540189549336-e6e99c3679fe',
  ],
  'Modern Indian': [
    '1631452180519-c014fe946bcc',
    '1596797038530-2c107229654b',
    '1603360946369-dc9bb6250414',
    '1517248135467-4c7edcad34c4',
  ],
  'South Indian': [
    '1589301760014-d929f3979dbc',
    '1630383249896-424e482df921',
    '1571934811356-5cc061b6821f',
    '1495474472287-4d71bcdd2085',
  ],
  'Pan-Asian': [
    '1617093727343-374698b1b08d',
    '1559314809-0d155014e29e',
    '1517248135467-4c7edcad34c4',
    '1467003909585-2f8a72700288',
  ],
  Brewpub: [
    '1436076863939-06870fe779c2',
    '1517248135467-4c7edcad34c4',
    '1559339352-11d035aa65de',
    '1495474472287-4d71bcdd2085',
  ],
  Barbecue: [
    '1432139555190-58524dae6a55',
    '1600891964599-f61ba0e24092',
    '1517248135467-4c7edcad34c4',
    '1467003909585-2f8a72700288',
  ],
  'Biryani & Kebab': [
    '1603360946369-dc9bb6250414',
    '1512058564366-18510be2db19',
    '1599487488170-d11ec9c172f0',
    '1517248135467-4c7edcad34c4',
  ],
  Chettinad: [
    '1567188040759-fb8a883dc6d8',
    '1631452180519-c014fe946bcc',
    '1517248135467-4c7edcad34c4',
    '1596797038530-2c107229654b',
  ],
};

const CUISINE_BY_SLUG = {
  'olive-and-grove': 'Mediterranean',
  'kite-and-string': 'Small plates',
  'forno-nove': 'Italian',
  'the-saffron-room': 'North Indian',
  'hachi-omakase': 'Japanese',
  'copper-kettle-bakehouse': 'Bakery',
  'nine-yards': 'Small plates',
  'basil-and-clay': 'Italian',
  'salt-and-tide': 'Coastal',
  'mill-and-marrow': 'Modern Indian',
  'harbour-and-vine': 'European',
  'tiffin-room-42': 'South Indian',
  'neon-gully': 'Pan-Asian',
  'the-marine-terrace': 'European',
  'ficus-and-fig': 'Mediterranean',
  'malt-and-mash': 'Brewpub',
  'curry-culture-lab': 'Modern Indian',
  'dosa-republic': 'South Indian',
  'smoke-and-bone': 'Barbecue',
  'sourdough-society': 'Bakery',
  'nizam-and-noor': 'Biryani & Kebab',
  'deccan-smokehouse': 'Barbecue',
  'charminar-chai-rooms': 'South Indian',
  'golconda-terrace': 'Modern Indian',
  'basil-hive': 'Italian',
  'kadal-and-coconut': 'Coastal',
  'peppercorn-house': 'Chettinad',
  'marina-filter-room': 'South Indian',
  'sixty-feet-east': 'Pan-Asian',
  'the-salt-cellar': 'European',
  'haveli-nine': 'North Indian',
  'the-chandni-table': 'Biryani & Kebab',
  'cloud-nine-aerocity': 'Pan-Asian',
  'kebab-kothi': 'North Indian',
};

const DEFAULT_GALLERY = [
  '1517248135467-4c7edcad34c4',
  '1467003909585-2f8a72700288',
  '1540189549336-e6e99c3679fe',
  '1510812431401-41d2bd2722f3',
];

function urlFor(id, w, h) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=72`;
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'SeatWisePhotoImport/1.0', Accept: 'image/*' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          get(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`${res.statusCode} ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('error', reject);
  });
}

const cache = new Map();

async function fetchPhoto(id, w, h) {
  const key = `${id}:${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const buf = await get(urlFor(id, w, h));
  if (buf.length < 4000) throw new Error(`too small (${buf.length}b) ${id}`);
  cache.set(key, buf);
  return buf;
}

function writeFile(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

async function main() {
  fs.mkdirSync(ROOT, { recursive: true });
  let ok = 0;
  let fail = 0;

  for (const [slug, id] of Object.entries(COVERS)) {
    const dest = path.join(ROOT, `${slug}.jpg`);
    try {
      const buf = await fetchPhoto(id, 1200, 800);
      writeFile(dest, buf);
      ok += 1;
      console.log(`cover  ${slug}  ${Math.round(buf.length / 1024)}kb`);
    } catch (err) {
      fail += 1;
      console.error(`FAIL cover ${slug}: ${err.message}`);
    }
  }

  for (const slug of [
    'olive-and-grove',
    'salt-and-tide',
    'curry-culture-lab',
    'nizam-and-noor',
    'kadal-and-coconut',
    'haveli-nine',
  ]) {
    const ids = GALLERIES[slug] ?? BY_CUISINE[CUISINE_BY_SLUG[slug]] ?? DEFAULT_GALLERY;
    for (let i = 0; i < Math.min(4, ids.length); i += 1) {
      const dest = path.join(ROOT, slug, `${i + 1}.jpg`);
      try {
        const buf = await fetchPhoto(ids[i], 800, 600);
        writeFile(dest, buf);
        ok += 1;
        console.log(`shot   ${slug}/${i + 1}  ${Math.round(buf.length / 1024)}kb`);
      } catch (err) {
        fail += 1;
        console.error(`FAIL shot ${slug}/${i + 1}: ${err.message}`);
      }
    }
  }

  console.log(`done  ok=${ok} fail=${fail}`);
  if (fail) process.exitCode = 1;
}

main();
