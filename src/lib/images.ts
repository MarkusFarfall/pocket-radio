/** Уменьшает выбранную картинку и хранит её прямо в плейлисте как JPEG data URL. */
export async function imageFileToDataUrl(file: File, size = 640): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Выберите изображение");
  if (file.size > 15 * 1024 * 1024) throw new Error("Изображение слишком большое (максимум 15 МБ)");
  const source: CanvasImageSource & { width: number; height: number; close?: () => void } =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(file)
      : await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Браузер не смог прочитать изображение"));
          };
          img.src = url;
        });
  const side = Math.min(source.width, source.height);
  const sx = Math.floor((source.width - side) / 2);
  const sy = Math.floor((source.height - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#17181d";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  source.close?.();
  return canvas.toDataURL("image/jpeg", 0.86);
}

/**
 * Сохраняет внешнюю обложку внутрь IndexedDB. Если сервер запрещает CORS,
 * возвращает исходный URL — Service Worker всё равно попробует кэшировать картинку.
 */
export async function snapshotImage(url: string, size = 640): Promise<string> {
  if (!url || url.startsWith("data:")) return url;
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return url;
    return await imageFileToDataUrl(new File([await r.blob()], "cover.jpg", { type: r.headers.get("content-type") || "image/jpeg" }), size);
  } catch {
    return url;
  }
}