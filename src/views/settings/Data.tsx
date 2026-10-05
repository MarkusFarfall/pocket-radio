import { useRef, useState } from "react";
import { Activity, CircleCheck, CircleX, Download, FileDown, FileUp, Link2, Loader2, Trash2 } from "lucide-react";
import type { Station } from "../../lib/types";
import { Toggle, btnGhost, btnPrimary, inputCls } from "../../components/ui";
import { player } from "../../lib/player";
import { clearHistory, db, deleteStations, exportJSON } from "../../lib/db";
import { download, exportM3U } from "../../lib/m3u";
import { importFile, importText, importUrl } from "../../lib/importer";
import { checkStations, type CheckProgress } from "../../lib/health";
import { removeVod } from "../../lib/offline";
import { fmtBytes } from "../../lib/templates";
import { useOfflineItems } from "../../lib/hooks";
import { itemStationId, usePlaylists } from "../../lib/playlists";
import { toast } from "../../lib/toast";
import { cn } from "../../utils/cn";
import { Group, Row } from "./parts";

export function Data({ stations, online }: { stations: Station[]; online: boolean }) {
  const offline = useOfflineItems();
  const playlists = usePlaylists() ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const stopCheck = useRef(false);
  const [paste, setPaste] = useState("");
  const [withStats, setWithStats] = useState(true);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [check, setCheck] = useState<CheckProgress | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const broken = stations.filter((s) => s.health && !s.health.ok);
  const checked = stations.filter((s) => s.health).length;
  const byId = new Map(stations.map((s) => [s.id, s]));
  const offlineMeta = new Map(
    playlists.flatMap((p) =>
      p.items.map((i) => [itemStationId(i.id), { title: i.title, url: i.url, playlist: p.name }] as const)
    )
  );

  const runCheck = async () => {
    stopCheck.current = false;
    const r = await checkStations(stations, setCheck, () => stopCheck.current);
    toast(r.bad ? `Проверено ${r.done}: не отвечают ${r.bad}` : `Проверено ${r.done}: все отвечают`, r.bad ? "error" : "ok");
    if (stopCheck.current) setCheck(null);
  };

  return (
    <>
      <Group title="Резервная копия и экспорт">
        <Row title="Скачать" desc="JSON — каталог, плейлисты и прогресс; скачанное аудио в копию не входит. M3U — список станций для других плееров." stack>
          <label className="flex items-center justify-between gap-3 text-sm">
            Включить историю и статистику
            <Toggle checked={withStats} onChange={setWithStats} label="Экспорт со статистикой" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className={btnGhost} onClick={async () => download(`pocket-radio-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportJSON(withStats), "application/json")}>
              <FileDown size={16} /> JSON
            </button>
            <button className={btnGhost} disabled={!stations.length} onClick={() => download("pocket-radio-stations.m3u", exportM3U(stations), "audio/x-mpegurl")}>
              <FileDown size={16} /> M3U
            </button>
          </div>
        </Row>
      </Group>

      <Group title="Импорт">
        <Row title="Из файла" desc="Файлы .json, .m3u, .m3u8, .pls. Дубликаты по адресу пропускаются. Файл можно просто перетащить в окно приложения." stack>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.m3u,.m3u8,.pls,text/plain,application/json,audio/x-mpegurl"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await importFile(f);
              e.target.value = "";
            }}
          />
          <button className={btnGhost} onClick={() => fileRef.current?.click()}>
            <FileUp size={16} /> Выбрать файл
          </button>
        </Row>
        <Row title="По ссылке" desc="Адрес M3U/PLS/JSON-плейлиста в интернете (нужен CORS на сервере)." stack>
          <div className="flex gap-2">
            <input className={inputCls} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com/radio.m3u" inputMode="url" />
            <button
              className={btnPrimary + " shrink-0"}
              disabled={!/^https?:\/\//i.test(linkUrl.trim()) || linkBusy || !online}
              onClick={async () => {
                setLinkBusy(true);
                if (await importUrl(linkUrl.trim())) setLinkUrl("");
                setLinkBusy(false);
              }}
              aria-label="Импортировать по ссылке"
            >
              {linkBusy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
            </button>
          </div>
        </Row>
        <Row title="Из текста" desc="Вставьте содержимое M3U или JSON." stack>
          <textarea className={cn(inputCls, "min-h-[84px] font-mono text-xs")} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"#EXTM3U\n#EXTINF:-1,Моя станция\nhttps://…"} />
          <button
            className={btnPrimary}
            disabled={!paste.trim()}
            onClick={async () => {
              if (await importText(paste)) setPaste("");
            }}
          >
            Импортировать из текста
          </button>
        </Row>
      </Group>

      <Group title="Здоровье станций">
        <Row
          title="Проверка доступности"
          desc={
            check
              ? `Проверено ${check.done} из ${check.total}${check.bad ? ` · не отвечают: ${check.bad}` : ""}`
              : checked
                ? `Проверено ${checked} из ${stations.length}${broken.length ? ` · не отвечают: ${broken.length}` : " · все отвечают"}`
                : "Беззвучно откроет каждый поток и покажет, какие станции перестали отвечать."
          }
          stack={!!check || broken.length > 0}
        >
          <div className="flex items-center gap-2">
            {check && check.done < check.total ? (
              <>
                <Loader2 size={18} className="animate-spin text-accent" />
                <button className={btnGhost} onClick={() => (stopCheck.current = true)}>
                  Стоп
                </button>
              </>
            ) : (
              <button className={btnGhost} disabled={!stations.length || !online} onClick={runCheck}>
                <Activity size={16} /> {checked ? "Перепроверить" : "Проверить все"}
              </button>
            )}
          </div>
          {check && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent transition-all" style={{ width: `${(check.done / Math.max(1, check.total)) * 100}%` }} />
            </div>
          )}
        </Row>
        {broken.length > 0 && (
          <div className="space-y-1 p-3">
            {broken.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-bg p-2.5 text-sm">
                <CircleX size={16} className="shrink-0 text-bad" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted">{s.health?.msg}</div>
                </div>
                <button
                  onClick={async () => {
                    if (player.getState().station?.id === s.id) player.stop();
                    await deleteStations([s.id]);
                    toast("Станция удалена", "info");
                  }}
                  className="rounded-lg p-1.5 text-muted hover:text-bad"
                  aria-label="Удалить станцию"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              className={btnGhost + " mt-1 w-full !text-bad"}
              onClick={async () => {
                if (broken.some((s) => player.getState().station?.id === s.id)) player.stop();
                await deleteStations(broken.map((s) => s.id));
                toast(`Удалено станций: ${broken.length}`, "info");
              }}
            >
              <Trash2 size={16} /> Удалить все недоступные ({broken.length})
            </button>
          </div>
        )}
        {checked > 0 && broken.length === 0 && !check && (
          <div className="flex items-center gap-2 p-4 text-sm text-ok">
            <CircleCheck size={16} /> Все проверенные станции отвечают
          </div>
        )}
      </Group>

      <Group title="Офлайн-аудио">
        <Row title="Доступно офлайн" desc={offline.length ? `Файлов: ${offline.length}` : "Песни и серии скачиваются из плейлиста кнопкой «Скачать офлайн». Файлы хранятся только на этом устройстве."} stack={offline.length > 0}>
          {offline.length > 0 && (
            <ul className="space-y-1">
              {offline.map((o) => {
                const s = byId.get(o.stationId);
                const item = offlineMeta.get(o.stationId);
                return (
                  <li key={o.stationId} className="flex items-center gap-3 rounded-xl bg-bg p-2.5 text-sm">
                    <Download size={16} className="shrink-0 text-ok" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s?.name ?? item?.title ?? "Офлайн-аудио"}</span>
                      {item?.playlist && <span className="block truncate text-xs text-muted">{item.playlist}</span>}
                    </span>
                    <span className="font-mono text-xs text-muted">{fmtBytes(o.size)}</span>
                    <button
                      onClick={() => (s ? removeVod(s) : removeVod({ id: o.stationId, url: item?.url ?? "" }))}
                      className="rounded-lg p-1.5 text-muted hover:text-bad"
                      aria-label="Удалить из кэша"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Row>
      </Group>

      <Group title="Очистка">
        <Row title="Очистить историю" desc="Удалит сессии, ошибки и счётчики прослушивания. Станции останутся.">
          <button
            className={btnGhost}
            onClick={async () => {
              player.stop();
              await player.flush(false);
              await clearHistory();
              toast("История и статистика очищены", "info");
            }}
          >
            Очистить
          </button>
        </Row>
        <Row title="Удалить все станции" desc="Каталог, избранное, сохранённые треки и загрузки станций из каталога будут стёрты. Музыкальные плейлисты останутся.">
          {confirmAll ? (
            <div className="flex gap-2">
              <button className={btnGhost} onClick={() => setConfirmAll(false)}>
                Нет
              </button>
              <button
                className="inline-flex items-center rounded-xl bg-bad px-4 py-2.5 text-sm font-semibold text-white"
                onClick={async () => {
                  player.stop();
                  for (const s of stations) await removeVod(s);
                  await db.stations.clear();
                  await db.tracks.clear();
                  await clearHistory();
                  setConfirmAll(false);
                  toast("Всё удалено", "info");
                }}
              >
                Удалить
              </button>
            </div>
          ) : (
            <button className={cn(btnGhost, "!text-bad")} onClick={() => setConfirmAll(true)} disabled={!stations.length} aria-label="Удалить все станции">
              <Trash2 size={16} />
            </button>
          )}
        </Row>
      </Group>
    </>
  );
}
