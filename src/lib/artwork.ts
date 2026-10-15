/** True for generic audio visualizations/thumbnails that should never be treated as album art. */
export function isPlaceholderArtwork(source?: string | null): boolean {
  if (!source || /^data:image\//i.test(source)) return false;
  let decoded = source;
  try {
    decoded = decodeURIComponent(source);
  } catch {
    // Inspect the raw URL when its percent escapes are malformed.
  }
  const normalized = decoded.replace(/\\/g, "/").toLowerCase();
  if (/archive\.org\/services\/img\//i.test(normalized)) return true;
  return /(?:^|[\/_.-])(?:waveform|spectrogram|__ia|itemimage|audio[-_]?preview|visuali[sz]ation)(?=$|[\/_.?#-])/i.test(normalized);
}

/** Detects Archive-style black-and-light audio wave thumbnails, including old saved data URLs. */
export function isGeneratedWaveformCover(image: HTMLImageElement): boolean {
  if (typeof document === "undefined" || !image.complete || image.naturalWidth < 48 || image.naturalHeight < 48) return false;
  try {
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const luminance = (x: number, y: number) => {
      const at = (y * 32 + x) * 4;
      return pixels[at] * 0.2126 + pixels[at + 1] * 0.7152 + pixels[at + 2] * 0.0722;
    };
    let dark = 0;
    let light = 0;
    let chroma = 0;
    let count = 0;
    let edgeDark = 0;
    let edgeCount = 0;
    let centerLight = 0;
    let centerCount = 0;
    const columnLight: number[] = [];
    for (let x = 3; x < 29; x++) {
      let inBand = 0;
      for (let y = 0; y < 32; y++) {
        const value = luminance(x, y);
        const at = (y * 32 + x) * 4;
        const high = Math.max(pixels[at], pixels[at + 1], pixels[at + 2]);
        const low = Math.min(pixels[at], pixels[at + 1], pixels[at + 2]);
        chroma += high - low;
        count++;
        if (value < 75) dark++;
        if (value > 180) light++;
        if (y < 6 || y >= 26) {
          edgeCount++;
          if (value < 75) edgeDark++;
        }
        if (y >= 12 && y <= 19) {
          centerCount++;
          if (value > 180) centerLight++;
        }
        if (y >= 8 && y <= 23 && value > 180) inBand++;
      }
      columnLight.push(inBand / 16);
    }
    const average = columnLight.reduce((sum, value) => sum + value, 0) / columnLight.length;
    const spread = Math.sqrt(columnLight.reduce((sum, value) => sum + (value - average) ** 2, 0) / columnLight.length);
    return dark / count > 0.25 && light / count > 0.2 && chroma / count < 50 &&
      edgeDark / edgeCount > 0.85 && centerLight / centerCount > 0.78 && spread > 0.07;
  } catch {
    // Cross-origin images without CORS approval cannot be inspected; their URL is filtered separately.
    return false;
  }
}

/** One policy for storage and display: keep real data artwork and upgrade legacy HTTP logos. */
export function artworkUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const source = value.trim();
  if (isPlaceholderArtwork(source)) return undefined;
  if (/^data:image\/(?:jpeg|jpg|png|webp|gif|avif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)[;,]/i.test(source)) return source;
  try {
    const url = new URL(source.startsWith("//") ? `https:${source}` : source);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    url.protocol = "https:";
    return url.href;
  } catch { return undefined; }
}
