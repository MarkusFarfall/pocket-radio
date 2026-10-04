import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Camera, Copy, Image as ImageIcon, Share2 } from "lucide-react";
import type { Station } from "../lib/types";
import { buildShareLink } from "../lib/templates";
import { toast } from "../lib/toast";
import { Cover, Modal, btnGhost, btnPrimary, inputCls } from "./ui";

export function stationLink(s: Station) {
  return buildShareLink({
    name: s.name,
    url: s.url,
    kind: s.kind,
    genre: s.genre,
    mood: s.mood,
    city: s.city,
    tags: s.tags,
    icon: s.icon,
    note: s.note,
    bitrate: s.bitrate,
  });
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Ссылка скопирована", "ok");
  } catch {
    toast("Не удалось скопировать — выделите ссылку вручную", "error");
  }
}

export async function shareStation(s: Station) {
  const url = stationLink(s);
  if (navigator.share) {
    try {
      await navigator.share({ title: `Радио «${s.name}»`, text: `Добавь станцию «${s.name}» в Pocket Radio`, url });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  await copyText(url);
}

export function QrShowModal({ station, onClose }: { station: Station | null; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const link = station ? stationLink(station) : "";
  const [tooLong, setTooLong] = useState(false);

  useEffect(() => {
    if (!station || !canvas.current) return;
    QRCode.toCanvas(canvas.current, link, { width: 248, margin: 2, errorCorrectionLevel: "L", color: { dark: "#1c1a16", light: "#ffffff" } })
      .then(() => setTooLong(false))
      .catch(() => setTooLong(true));
  }, [station, link]);

  return (
    <Modal open={!!station} onClose={onClose} title="QR-код станции" size="sm">
      {station && (
        <div className="flex flex-col items-center gap-4 p-5">
          <div className="flex items-center gap-3 self-stretch">
            <Cover s={station} size={44} className="rounded-xl" />
            <div className="min-w-0">
              <div className="truncate font-display font-bold">{station.name}</div>
              <div className="truncate text-xs text-muted">{station.url}</div>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-2 shadow-inner ring-1 ring-line">
            {tooLong ? <div className="flex h-[248px] w-[248px] items-center justify-center p-6 text-center text-sm text-neutral-600">Слишком длинные данные для QR. Сократите заметку или используйте ссылку.</div> : <canvas ref={canvas} className="rounded-2xl" />}
          </div>
          <p className="text-center text-xs text-muted">На другом устройстве: Каталог → «+» → «Сканировать QR».</p>
          <input readOnly value={link} className={inputCls + " font-mono text-xs"} onFocus={(e) => e.currentTarget.select()} />
          <div className="grid w-full grid-cols-2 gap-2">
            <button className={btnGhost} onClick={() => copyText(link)}>
              <Copy size={16} /> Копировать
            </button>
            <button className={btnPrimary} onClick={() => shareStation(station)}>
              <Share2 size={16} /> Поделиться
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface Detector {
  detect(src: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (o: { formats: string[] }) => Detector;

export function QrScanModal({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (!Ctor) {
      setErr("Ваш браузер не умеет сканировать QR. Вставьте ссылку на станцию вручную.");
      return;
    }
    let stop = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    const det = new Ctor({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stop) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stop) return;
          try {
            const r = await det.detect(v);
            if (r.length) {
              onResult(r[0].rawValue);
              return;
            }
          } catch {
            /* кадр не готов */
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setErr("Нет доступа к камере. Можно выбрать фото с QR-кодом.");
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, Ctor, onResult]);

  const fromFile = async (f: File | undefined) => {
    if (!f || !Ctor) return;
    try {
      const bmp = await createImageBitmap(f);
      const r = await new Ctor({ formats: ["qr_code"] }).detect(bmp);
      if (r.length) onResult(r[0].rawValue);
      else toast("QR-код на фото не найден", "error");
    } catch {
      toast("Не удалось прочитать изображение", "error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Сканировать QR" size="sm">
      <div className="space-y-4 p-5">
        {!err && (
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-black">
            <video ref={video} muted playsInline className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80" />
            <span className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/80">Наведите камеру на QR станции</span>
          </div>
        )}
        {err && (
          <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
            <Camera size={18} className="mt-0.5 shrink-0 text-muted" />
            {err}
          </div>
        )}
        {Ctor && (
          <label className={btnGhost + " w-full cursor-pointer"}>
            <ImageIcon size={16} /> Выбрать фото с QR
            <input type="file" accept="image/*" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
          </label>
        )}
      </div>
    </Modal>
  );
}
