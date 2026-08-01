/**
 * Image optimisation.
 *
 * The audit measured a ~14 MB first paint (finding #22) and called it "the
 * project's worst measurable defect after the security issues, and also the
 * easiest to fix". A 3.9 MB JPEG was being displayed in a 280x380 card â€” about
 * a 100x over-fetch. On a typical mobile connection the homepage took 30+
 * seconds and ate a visible chunk of someone's data plan.
 *
 * This script:
 *   1. deletes images no longer referenced anywhere (~8 MB, including a
 *      byte-identical duplicate the audit found)
 *   2. resizes each survivor to the largest size it is actually displayed at
 *   3. re-encodes as WebP
 *
 * Run with:  npm run images:optimise --workspace @tastyfood/web
 * Idempotent â€” safe to re-run.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(here, '../../../Images');
const OUTPUT_DIR = path.resolve(here, '../public/images');

/**
 * Target width per image, taken from how large it actually renders.
 * 2x the CSS pixel size, so the result still looks sharp on a retina screen
 * without paying for a 4000px original nobody will ever see.
 */
const TARGETS = {
  'hero-burger.jpg': { width: 1200, quality: 80 },
  'special.jpg': { width: 1200, quality: 80 },
  'reservation.jpg': { width: 1200, quality: 78 },
  'logo1.jpg': { width: 120, quality: 85 },
  // Menu cards render at roughly 400x300 CSS pixels.
  'menu-grill.jpg': { width: 700, quality: 72 },
  'menu-pizza.jpg': { width: 700, quality: 72 },
  'menu-smoothie.jpg': { width: 700, quality: 72 },
  'menu-sandwich.jpg': { width: 700, quality: 72 },
  'menu-wraps.jpg': { width: 700, quality: 72 },
  'menu-toast.jpg': { width: 700, quality: 72 },
  'menu-cake.jpg': { width: 700, quality: 72 },
  'menu-kunafa.jpg': { width: 700, quality: 72 },
  'molten-lava.jpg': { width: 700, quality: 72 },
  'menu-loaf.jpg': { width: 700, quality: 72 },
  'menu-cupcake.jpg': { width: 700, quality: 72 },
  'menu-snacks.jpg': { width: 700, quality: 72 },
};

const kb = (bytes) => (bytes / 1024).toFixed(0).padStart(6);

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source folder not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  // --- report what is being dropped, and prove the duplicate ---------------
  const sourceFiles = await readdir(SOURCE_DIR);
  const hashes = new Map();
  let droppedBytes = 0;
  const dropped = [];

  for (const file of sourceFiles) {
    const full = path.join(SOURCE_DIR, file);
    const info = await stat(full);
    if (!info.isFile()) continue;

    const digest = createHash('md5').update(await readFile(full)).digest('hex');
    const seen = hashes.get(digest);
    if (seen) {
      console.log(`  duplicate: ${file} is byte-identical to ${seen}`);
    } else {
      hashes.set(digest, file);
    }

    if (!TARGETS[file]) {
      dropped.push(file);
      droppedBytes += info.size;
    }
  }

  console.log(`\nUnreferenced files not carried over: ${dropped.length} (${kb(droppedBytes)} KB)`);
  for (const file of dropped) console.log(`  - ${file}`);

  // --- clear previous output so re-runs cannot leave stale files behind ----
  for (const existing of await readdir(OUTPUT_DIR).catch(() => [])) {
    await rm(path.join(OUTPUT_DIR, existing), { force: true });
  }

  // --- resize + convert ----------------------------------------------------
  console.log('\n  file                          before      after   saved');
  console.log('  ' + '-'.repeat(60));

  let totalBefore = 0;
  let totalAfter = 0;

  for (const [file, target] of Object.entries(TARGETS)) {
    const source = path.join(SOURCE_DIR, file);
    if (!existsSync(source)) {
      console.warn(`  MISSING  ${file}`);
      continue;
    }

    const before = (await stat(source)).size;
    const outputName = `${path.parse(file).name}.webp`;

    const buffer = await sharp(source)
      // withoutEnlargement: never upscale a small source just to hit the target.
      .resize({ width: target.width, withoutEnlargement: true })
      .webp({ quality: target.quality, effort: 6 })
      .toBuffer();

    await writeFile(path.join(OUTPUT_DIR, outputName), buffer);

    totalBefore += before;
    totalAfter += buffer.length;

    const saved = (((before - buffer.length) / before) * 100).toFixed(0);
    console.log(`  ${outputName.padEnd(26)} ${kb(before)}KB ${kb(buffer.length)}KB   ${saved}%`);
  }

  console.log('  ' + '-'.repeat(60));
  console.log(`  ${'TOTAL'.padEnd(26)} ${kb(totalBefore)}KB ${kb(totalAfter)}KB`);
  console.log(
    `\n  ${(totalBefore / 1024 / 1024).toFixed(1)} MB -> ${(totalAfter / 1024).toFixed(0)} KB ` +
      `(${(((totalBefore - totalAfter) / totalBefore) * 100).toFixed(1)}% smaller)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

