import { Zap } from "lucide-react";
import { Toggle, btnGhost } from "../../components/ui";
import { player, usePlayer } from "../../lib/player";
import { setAppPrefs, useAppPrefs, wakeSupported } from "../../lib/appPrefs";
import { Group, Row, Seg } from "./parts";

const START_TABS = [
  ["home", "Главная"],
  ["catalog", "Каталог"],
  ["playlists", "Плейлисты"],
  ["discover", "Обзор"],
  ["stats", "Статистика"],
] as const;

export function Playback() {
  const p = usePlayer();
  const a = useAppPrefs();
  return (
    <>
      <Group title="Воспроизведение">
        <Row title="Экономия трафика" desc="HLS — самое низкое качество, меньший буфер, без опроса метаданных трека.">
          <Toggle checked={p.dataSaver} onChange={(v) => player.setDataSaver(v)} label="Экономия трафика" />
        </Row>
        {wakeSupported && (
          <Row title="Не гасить экран" desc="Пока играет эфир, экран не засыпает: удобно для настольной станции и автомобиля.">
            <Toggle checked={a.wake} onChange={(v) => setAppPrefs({ wake: v })} label="Не гасить экран" />
          </Row>
        )}
        <Row title="Включать последнюю станцию при открытии" desc="Браузеры часто запрещают автозапуск звука — тогда станция будет готова, и останется нажать «играть».">
          <Toggle checked={a.autoplay} onChange={(v) => setAppPrefs({ autoplay: v })} label="Автозапуск последней станции" />
        </Row>
        <Row
          title="Таймер сна"
          desc={p.sleepAt ? `Остановится в ${new Date(p.sleepAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}` : "Включается в полноэкранном плеере; звук плавно затихает последние 20 секунд."}
        >
          {p.sleepAt ? (
            <button className={btnGhost} onClick={() => player.setSleep(null)}>
              Отключить
            </button>
          ) : (
            <Zap size={18} className="text-muted" />
          )}
        </Row>
      </Group>

      <Group title="Приложение">
        <Row title="Открывать с раздела" stack>
          <Seg label="Стартовый раздел" value={a.startTab === "settings" ? "home" : a.startTab} options={START_TABS} onChange={(v) => setAppPrefs({ startTab: v })} />
        </Row>
      </Group>
    </>
  );
}
