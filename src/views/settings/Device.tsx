import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Database, RotateCcw, Share, ShieldCheck, Smartphone } from "lucide-react";
import { btnGhost, btnPrimary } from "../../components/ui";
import { storageEstimate } from "../../lib/offline";
import { fmtBytes } from "../../lib/templates";
import { useInstall, useOnline } from "../../lib/hooks";
import { resetUi } from "../../lib/uiStyle";
import { setThemePrefs } from "../../lib/themes";
import { setPlayerAppearance } from "../../lib/playerAppearance";
import { toast } from "../../lib/toast";
import { cn } from "../../utils/cn";
import { Group, Row } from "./parts";

interface Check {
  label: string;
  ok: boolean | null;
  note: string;
}

function audioSupport(): string {
  const a = document.createElement("audio");
  const list: [string, string][] = [
    ["MP3", 'audio/mpeg'],
    ["AAC", 'audio/aac'],
    ["OGG", 'audio/ogg; codecs="vorbis"'],
    ["Opus", 'audio/ogg; codecs="opus"'],
    ["FLAC", "audio/flac"],
  ];
  return list.map(([n, t]) => `${n} ${a.canPlayType(t) ? "✓" : "—"}`).join(" · ");
}

/** Что умеет это устройство и браузер — помогает понять, почему что-то не работает. */
function Diagnostics() {
  const online = useOnline();
  const [rows, setRows] = useState<Check[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const w = window as unknown as Record<string, unknown>;
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
      const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
      const a = document.createElement("audio");
      const hls = !!(w.MediaSource || w.ManagedMediaSource) || !!a.canPlayType("application/vnd.apple.mpegurl");
      const https = location.protocol === "https:";
      const list: Check[] = [
        { label: "Защищённое соединение", ok: window.isSecureContext, note: window.isSecureContext ? "Офлайн-режим, установка и шифрование паролей работают." : "Откройте приложение по https или localhost: иначе не заработают установка, офлайн и часть защиты." },
        { label: "Интернет", ok: online, note: online ? "Есть." : "Нет — работают каталог, избранное и скачанные плейлисты." },
        { label: "Офлайн-оболочка (Service Worker)", ok: !!reg?.active, note: reg?.active ? "Интерфейс откроется без сети." : "Не активна: появится после первой загрузки по https." },
        { label: "Хранилище данных (IndexedDB)", ok: !!window.indexedDB, note: window.indexedDB ? "Каталог и статистика сохраняются." : "Недоступно (например, приватный режим): данные не сохранятся." },
        { label: "Защита от очистки", ok: persisted, note: persisted ? "Браузер не удалит данные при нехватке места." : "Не включена — см. «Устройство» выше." },
        { label: "Управление с экрана блокировки", ok: "mediaSession" in navigator, note: "mediaSession" in navigator ? "Кнопки play/pause и переключение станций." : "Браузер не поддерживает." },
        { label: "Потоки HLS (.m3u8)", ok: hls, note: hls ? "Поддерживаются." : "Не поддерживаются — такие станции не заиграют." },
        { label: "Форматы звука", ok: null, note: audioSupport() },
        { label: "Эмбиент без сети (Web Audio)", ok: !!(w.AudioContext || w.webkitAudioContext), note: w.AudioContext || w.webkitAudioContext ? "Доступен." : "Недоступен." },
        { label: "http-станции", ok: !https, note: https ? "Страница по https: станции с адресом http браузер блокирует. Используйте https-адреса." : "Страница по http: http-станции будут играть." },
        { label: "Сканер QR", ok: "BarcodeDetector" in window, note: "BarcodeDetector" in window ? "Доступен." : "Нет — вставляйте ссылку на станцию вручную." },
        { label: "Не гасить экран", ok: "wakeLock" in navigator, note: "wakeLock" in navigator ? "Доступно." : "Не поддерживается этим браузером." },
      ];
      if (alive) setRows(list);
    })();
    return () => {
      alive = false;
    };
  }, [online]);

  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-3 px-4 py-3">
          {r.ok === null ? <span className="mt-0.5 h-4 w-4 shrink-0" /> : r.ok ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-ok" /> : <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-500" />}
          <div className="min-w-0">
            <div className="text-sm font-semibold">{r.label}</div>
            <div className={cn("text-xs leading-relaxed", r.ok === false ? "text-ink/80" : "text-muted")}>{r.note}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const TIPS: [string, string][] = [
  ["Станция не играет", "Нажмите «⋯» → «Проверить, отвечает ли поток». Если адрес начинается с http, а приложение открыто по https, браузер его заблокирует — найдите https-версию в «Обзоре»."],
  ["Нет названия трека", "Название читается только у серверов, которые разрешают чтение с других сайтов (CORS). Это ограничение браузера, не ошибка."],
  ["Подкаст не скачивается", "Сервер подкаста должен разрешать CORS. Если нет — слушать можно только онлайн."],
  ["Пропали данные", "Включите «Защитить от очистки» выше и делайте резервные копии в разделе «Данные»."],
];

export function Device() {
  const inst = useInstall();
  const online = useOnline();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    storageEstimate().then(setEst);
  }, []);

  return (
    <>
      <Group title="Установка">
        <Row
          title="На домашний экран"
          desc={inst.installed ? "Приложение установлено." : inst.ios ? "В Safari: «Поделиться» → «На экран Домой»." : inst.canInstall ? "Работает как отдельное приложение, управление с экрана блокировки." : "Меню браузера → «Установить приложение» (доступно по https/localhost)."}
        >
          {inst.canInstall && !inst.installed ? (
            <button className={btnPrimary} onClick={inst.install}>
              <Smartphone size={16} /> Установить
            </button>
          ) : inst.ios && !inst.installed ? (
            <Share size={20} className="shrink-0 text-muted" />
          ) : null}
        </Row>
      </Group>

      <Group title="Хранилище">
        <Row title="Данные приложения" desc="Каталог, избранное и статистика хранятся в IndexedDB на этом устройстве.">
          <Database size={20} className="shrink-0 text-muted" />
        </Row>
        <Row title="Защита данных от очистки" desc={persisted ? "Браузер не удалит каталог и статистику при нехватке места." : "Попросите браузер хранить данные постоянно — иначе при нехватке места они могут быть удалены."}>
          {persisted ? (
            <ShieldCheck size={22} className="shrink-0 text-ok" />
          ) : (
            <button
              className={btnGhost}
              onClick={async () => {
                const ok = (await navigator.storage?.persist?.()) ?? false;
                setPersisted(ok);
                toast(ok ? "Данные защищены" : "Браузер отклонил запрос — установите приложение на экран «Домой»", ok ? "ok" : "info");
              }}
            >
              <ShieldCheck size={16} /> Защитить
            </button>
          )}
        </Row>
        {est && est.quota > 0 && (
          <Row title="Занято места" desc={`${fmtBytes(est.usage)} из ${fmtBytes(est.quota)}`}>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent" style={{ width: `${Math.max(2, (est.usage / est.quota) * 100)}%` }} />
            </div>
          </Row>
        )}
      </Group>

      <Group title="Диагностика" hint="Если что-то не работает, начните отсюда: список показывает, чего не хватает устройству или браузеру.">
        <Diagnostics />
      </Group>

      <Group title="Если что-то не так">
        {TIPS.map(([q, a]) => (
          <details key={q} className="group px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold marker:content-none">
              <span className="mr-2 inline-block text-muted transition group-open:rotate-90">›</span>
              {q}
            </summary>
            <p className="mt-2 pl-5 text-xs leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </Group>

      <Group title="О приложении">
        <Row title="Pocket Radio" desc={`Интернет-радио в кармане. Работает ${online ? "онлайн" : "офлайн"}. Каталог станций — Radio Browser, фотографии — Pexels.`} />
        <Row title="Сбросить оформление" desc="Вернёт стандартные тему, стиль и логотип. Станции и аккаунт не затрагиваются.">
          <button
            className={btnGhost}
            onClick={() => {
              resetUi();
              setThemePrefs({ mode: "system", light: "paper", dark: "charcoal", accent: null });
              setPlayerAppearance({ layout: "focus", motion: "calm", colorWash: true });
              toast("Оформление сброшено", "ok");
            }}
          >
            <RotateCcw size={16} /> Сбросить
          </button>
        </Row>
      </Group>
    </>
  );
}
