// Gera vídeos Y4M para a câmara simulada do Chrome: um código EAN-13 desenhado
// no centro da moldura do leitor, sobre um "rótulo" branco, ligeiramente desfocado.
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function ean13Modules(code) {
  const d = code.split('').map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';
  return bits;
}

/** Sem `code`, gera só o rótulo branco (leitor sem código à vista). */
export async function makeVideo(code, out, cy = 306) {
  const W = 1280;
  const H = 720;
  const MODULE = 3;
  const BAR_H = 120;
  const bits = code ? ean13Modules(code) : '0'.repeat(95);
  const barW = bits.length * MODULE;
  const x0 = Math.round((W - barW) / 2);
  const y0 = Math.round(cy - BAR_H / 2);

  const gray = Buffer.alloc(W * H, 200);
  const pad = 40;
  for (let y = y0 - pad; y < y0 + BAR_H + pad; y++) for (let x = x0 - pad; x < x0 + barW + pad; x++) gray[y * W + x] = 250;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    for (let y = y0; y < y0 + BAR_H; y++) for (let x = 0; x < MODULE; x++) gray[y * W + x0 + i * MODULE + x] = 20;
  }
  const blurred = await sharp(gray, { raw: { width: W, height: H, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();

  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frames = [];
  for (let f = 0; f < 10; f++) frames.push(Buffer.from('FRAME\n'), blurred, chroma);
  writeFileSync(out, Buffer.concat([header, ...frames]));
}
