// Local person-detection model (setup-time only; the app never downloads at runtime).
//
//   node scripts/setup-model.mjs          verify/download into public/models/coco-ssd
//   node scripts/setup-model.mjs --force  download again
//
// Person detector: COCO-SSD MobileNet v2 converted for TensorFlow.js (Apache-2.0,
//   https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd).
//
// Every file is checked against the SHA-256 recorded below, so a changed upstream file is reported
// instead of being used silently. public/models is gitignored.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public', 'models', 'coco-ssd');
const force = process.argv.includes('--force');

const MODEL_BASE = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssd_mobilenet_v2/';
const MODEL_FILES = {
  'group1-shard10of17': '00708e5eb3618db0e2ae0016e9388f4a6a4e0204ef3ffde93b4b21f9d9b87e07',
  'group1-shard11of17': 'd536877af8ab67447466a4eaaaf367c92b5121cb9b1ab2debee48148fc112d05',
  'group1-shard12of17': '05ee4d2d9097b8b1a2a5ad19b22fd58aae54ba5b9df78b5bc25619dfb3534c20',
  'group1-shard13of17': 'cf0129e048b54276ed8cbfdd1e9dbcb963d6d04464e081a12e2407bbdaaded2a',
  'group1-shard14of17': '3bd70a2f2bb3ec92ee2bf43e1e5d2d4e3185d2c838ad7f8ea416d2803a71f98d',
  'group1-shard15of17': '8daa30ac8d212298f3f6e51862a85faa0e81f0d62658e3b8da1abeb97d5e0b00',
  'group1-shard16of17': '176838e8ebd4ba229b0174114413cf0131811c5a7c86edab256871be3b3ed488',
  'group1-shard17of17': '996c59c8c58a24537cacf45eb61df0c6aed597f90a2efb89c57ba6c646b42fdd',
  'group1-shard1of17': '48cb1f78d82d3cb5027227bf623ada3cb78522fd2cf433b5c9b0f7c44c9b89fb',
  'group1-shard2of17': '4eaad24b1c94d37b17c9b7de2910f6c014f8702097747cb30ef13f9a9f77a474',
  'group1-shard3of17': 'a68e717805990ceda47dbf64bd7a68d39f06d7bb587f69e4bb84f8e5dd6c5740',
  'group1-shard4of17': '5f41bb602e5954a79fa4007faa698fa0127fef7fca6f7e2d8b42ccd027b76e25',
  'group1-shard5of17': 'd3ff3e9127d3739155c31a196ad063fd36b234df7cd7427a0c64a6f216bedca3',
  'group1-shard6of17': 'e932f59296c708bdaa4180e7a184271a492e9eefd08096babbda0558fb20eac8',
  'group1-shard7of17': '50798743a355a0c1903d5e67823711dfff4d239e8ea2eb9c8755fb4358f0bd92',
  'group1-shard8of17': '585a9ac2b8d3446ffb5f3e9d30a313e600ebd1fbbf8fd9db0e29568699d4fb69',
  'group1-shard9of17': '81ce5d6613e507a6a9fe1bf4c7ef3331347b1647d4d525b2d255362ac7ebac47',
  'model.json': '219190a98d6940a7c4d63c38b27e1c4f9841088a829459093ef071f09e5ccb3c',
};

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function download(url, target, expectedHash) {
  if (!force && fs.existsSync(target) && sha256(fs.readFileSync(target)) === expectedHash) {
    console.log(`ok       ${path.relative(root, target)}`);
    return;
  }
  const response = await fetch(url, { headers: { 'User-Agent': 'RestaurantCamera-model-setup/1.0' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = sha256(buffer);
  if (actual !== expectedHash) throw new Error(`${url}: unexpected SHA-256 ${actual} (expected ${expectedHash})`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  console.log(`saved    ${path.relative(root, target)} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

for (const [file, hash] of Object.entries(MODEL_FILES)) {
  await download(MODEL_BASE + file, path.join(outputDir, file), hash);
}
console.log('The local person-detection model is ready. Connect a real RTSP camera in the app.');
