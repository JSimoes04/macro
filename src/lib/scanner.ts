import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/**
 * Leitor de códigos de barras com ZXing (WebAssembly). O Safari do iPhone não tem
 * a API BarcodeDetector, por isso a descodificação é feita aqui. O ficheiro .wasm
 * vem com a app (e fica em cache), para funcionar sem depender de uma CDN.
 */
let ready: Promise<unknown> | null = null;

export function loadScanner(): Promise<unknown> {
  ready ??= prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  }).catch((err: unknown) => {
    ready = null;
    throw err;
  });
  return ready;
}

const OPTIONS: ReaderOptions = {
  formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  maxNumberOfSymbols: 1,
};

export async function decodeImage(image: ImageData): Promise<string | null> {
  const results = await readBarcodes(image, OPTIONS);
  const hit = results.find((r) => r.isValid && r.text);
  return hit ? hit.text : null;
}
