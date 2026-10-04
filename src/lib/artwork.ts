const cache = new Map<string, string>();

/** Рисует обложку станции (градиент + кольца + первая буква) для Media Session / экрана блокировки. */
export function artworkFor(name: string, _icon?: string): string {
  void _icon;
  const hit = cache.get(name);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const grad = g.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, `hsl(${hue} 46% 34%)`);
  grad.addColorStop(1, `hsl(${(hue + 28) % 360} 52% 16%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.lineWidth = 5;
  for (let r = 70; r < 560; r += 70) {
    g.beginPath();
    g.arc(400, 110, r, 0, Math.PI * 2);
    g.stroke();
  }
  const letter = (Array.from(name.trim().replace(/^[^\p{L}\p{N}]+/u, ""))[0] ?? "R").toUpperCase();
  g.font = "700 250px system-ui, -apple-system, 'Segoe UI', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.fillText(letter, 256, 276);
  const url = c.toDataURL("image/png");
  cache.set(name, url);
  return url;
}
