import { ArrowUpRight, Disc3, Play, Plus, Shuffle, Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { ViewProps } from "./shared";
import type { AppDesign } from "../lib/appDesign";
import { Cover } from "../components/Cover";
import { PlaylistArtwork } from "../components/PlaylistArtwork";
import { usePlaylists } from "../lib/playlists";
import { gotoPlaylist } from "../lib/picker";
import { player } from "../lib/player";
import { installStarter } from "../lib/starter";
import { toast } from "../lib/toast";
import { useSessions } from "../lib/hooks";
import { todaySeconds } from "../lib/stats";
import { fmtDuration } from "../lib/templates";
import { SavedTracks } from "./Home";

export function ExperienceHome({ design, stations, online, cachedIds, onPlay, onAdd, onScan, onDemo, go }: ViewProps & { design: Exclude<AppDesign, "classic"> }) {
  const playlists = usePlaylists() ?? [];
  const sessions = useSessions();
  const featured = useMemo(() => [...stations].sort((a,b) => Number(b.favorite) - Number(a.favorite) || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)).slice(0,8), [stations]);
  const first = featured[0];
  const queue = featured.map(s => s.id);
  const recent = [...stations].filter(s => s.lastPlayedAt).sort((a,b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)).slice(0,5);
  const setup = <div className="home-design-actions"><button className="home-action-primary" onClick={async () => { const n = await installStarter(); toast(n ? `Добавлено ${n} станций` : "Станции уже в каталоге", "ok"); }}><Sparkles size={17} /> Быстрый старт</button><button onClick={onAdd}><Plus size={17} /> Свой поток</button><button onClick={onScan}>Сканировать QR</button></div>;
  const pickRandom = () => {
    const pool = stations.filter(s => online || cachedIds.has(s.id) || s.kind === "lan");
    if (!pool.length) { toast("Нет доступных станций", "info"); return; }
    const ids = player.shuffleQueue(pool); const next = pool.find(s => s.id === ids[0]);
    if (next) onPlay(next, ids);
  };
  const shelves = <section className="home-design-shelf"><div className="home-section-heading"><h2>{design === "editorial" ? "Частоты коллекции" : "В вашей коллекции"}</h2><button onClick={() => go("catalog")}>Весь каталог <ArrowUpRight size={16} /></button></div>{featured.length ? <div className="home-cover-grid">{featured.map((s,i) => <button key={s.id} className="home-cover-card" onClick={() => onPlay(s, queue)} aria-label={`Слушать ${s.name}`}><span className="home-cover-image"><Cover s={s} size="fill" /><span className="home-cover-play"><Play size={20} fill="currentColor" /></span></span><span className="home-cover-index">{String(i+1).padStart(2,"0")} / {s.genre || "РАДИО"}</span><strong>{s.name}</strong><small>{!online && !cachedIds.has(s.id) && s.kind !== "lan" ? "Нужна сеть" : s.city || "Ваша коллекция"}</small></button>)}</div> : <div className="home-empty-collection"><Disc3 size={36} /><div><h3>Здесь будет ваша музыка</h3><p>Добавьте станции, импортируйте коллекцию или начните с готового набора.</p>{setup}</div></div>}</section>;
  const listSection = <section className="home-design-playlists"><div className="home-section-heading"><h2>Плейлисты</h2><button onClick={() => go("playlists")}>Открыть <ArrowUpRight size={16} /></button></div>{playlists.length ? <div className="home-playlist-grid">{playlists.slice(0,4).map(pl => <button key={pl.id} onClick={() => gotoPlaylist(pl.id)}><span className="home-playlist-art"><PlaylistArtwork playlist={pl} /></span><span><strong>{pl.name}</strong><small>{pl.items.length} треков</small></span><ArrowUpRight size={18} /></button>)}</div> : <button className="home-playlist-empty" onClick={() => go("playlists")}><Plus size={26} /><span><strong>Соберите свой первый плейлист</strong><small>Локальные файлы, альбомы и подкасты — в одной коллекции.</small></span><ArrowUpRight size={18} /></button>}</section>;
  const metrics = <div className="home-console-metrics"><div><span>ИСТОЧНИКИ</span><strong>{stations.length.toString().padStart(2,"0")}</strong></div><div><span>ИЗБРАННОЕ</span><strong>{stations.filter(s => s.favorite).length.toString().padStart(2,"0")}</strong></div><div><span>ПЛЕЙЛИСТЫ</span><strong>{playlists.length.toString().padStart(2,"0")}</strong></div><div><span>СЕГОДНЯ В ЭФИРЕ</span><strong>{fmtDuration(todaySeconds(sessions),true)}</strong></div></div>;
  return <div className={`experience-home experience-home-${design}`}>
    {design === "editorial" && <>
      <header className="editorial-home-heading"><span>ВАШЕ ЛИЧНОЕ МУЗЫКАЛЬНОЕ ИЗДАНИЕ</span><h1>Искусство<br /><em>слушать.</em></h1><p>Знакомые частоты. Новые открытия.<br />Музыка, которую выбираете вы.</p></header>
      <div className="editorial-frontpage"><div className="editorial-lead"><div className="editorial-lead-art">{first ? <Cover s={first} size="fill" /> : <div className="home-art-composition"><i /><span>PR<br />01</span></div>}</div><div className="editorial-lead-copy"><span className="design-section-label">{first ? "В ФОКУСЕ / ВАША КОЛЛЕКЦИЯ" : "НАЧНИТЕ СВОЮ ИСТОРИЮ"}</span><h2>{first?.name || "У каждой минуты свой саундтрек."}</h2>{first ? <button className="home-action-primary" onClick={() => onPlay(first, queue)}><Play size={18} /> Слушать</button> : setup}</div></div><aside className="editorial-index"><span className="design-section-label">СОДЕРЖАНИЕ</span>{[["catalog","Частоты и станции",`${stations.length} в коллекции`],["playlists","Личная фонотека",`${playlists.length} плейлистов`],["discover","За пределами привычного","Поиск, подборки, подкасты"],["stats","Дневник слушателя","Время и история"]].map(([id,title,sub],i) => <button key={id} onClick={() => go(id as "catalog"|"playlists"|"discover"|"stats")}><span>0{i+1}</span><strong>{title}<small>{sub}</small></strong><ArrowUpRight size={17} /></button>)}</aside></div>
      {shelves}{listSection}
    </>}
    {design === "library" && <>
      <header className="library-home-heading"><div><span className="design-section-label">ВАША МУЗЫКА / ВАШ РИТМ</span><h1>Хорошая музыка.<br /><span>Уже рядом.</span></h1></div><button onClick={first ? pickRandom : onDemo}><Shuffle size={18} /> {first ? "Удивить меня" : "Найти музыку"}</button></header>
      <div className="library-feature"><div className="library-feature-copy"><span className="design-section-label">{first ? "СНОВА ВКЛЮЧИТЬ" : "НАЧАЛО КОЛЛЕКЦИИ"}</span><h2>{first?.name || "Ваши будущие любимые."}</h2><p>{first ? [first.genre,first.city].filter(Boolean).join(" · ") || "Из вашей музыкальной коллекции" : "Станции, альбомы и свои файлы. Всё, к чему хочется возвращаться."}</p>{first ? <button className="home-action-primary" onClick={() => onPlay(first,queue)}><Play size={18} fill="currentColor" /> Слушать</button> : setup}</div><div className="library-feature-art">{first ? <Cover s={first} size="fill" /> : <div className="home-art-composition"><i /><span>SIDE<br />A</span></div>}</div></div>
      {listSection}{shelves}
    </>}
    {design === "console" && <>
      <header className="console-home-heading"><span className="design-section-label">WORKSPACE / ОБЗОР СИСТЕМЫ</span><h1>Рабочий пульт<span>_</span></h1><p>{online ? "Сеть доступна" : "Работа без сети"} · Локальные данные устройства</p></header>
      {metrics}<div className="console-home-workspace"><section className="console-recent"><div className="home-section-heading"><h2>{recent.length ? "Последние включения" : "Источники"}</h2><button onClick={() => go("catalog")}>Все →</button></div>{(recent.length ? recent : featured).map((s,i) => <button className="console-source-row" key={s.id} onClick={() => onPlay(s,stations.map(x=>x.id))}><span>{String(i+1).padStart(2,"0")}</span><Cover s={s} size={36} /><strong>{s.name}<small>{s.genre || s.kind}</small></strong><Play size={16} /></button>)}{!stations.length && <div className="console-source-empty"><p>Источники не добавлены.</p>{setup}</div>}</section><section className="console-operations"><span className="design-section-label">БЫСТРЫЕ ОПЕРАЦИИ</span><button onClick={onAdd}><Plus size={20} /><span>Новый источник<small>URL / LAN / HLS</small></span><ArrowUpRight size={18}/></button><button onClick={() => go("playlists")}><Disc3 size={20}/><span>Локальные файлы<small>Плейлисты и загрузки</small></span><ArrowUpRight size={18}/></button><button onClick={onDemo}><Sparkles size={20}/><span>Готовые подборки<small>Открыть обзор</small></span><ArrowUpRight size={18}/></button></section></div>{listSection}
    </>}
    <div className="home-saved-tracks"><SavedTracks /></div>
    <button className="design-discover-link" onClick={onDemo}><span>ОТКРЫТЬ НОВОЕ</span><strong>За пределами вашей коллекции</strong><ArrowUpRight size={28}/></button>
  </div>;
}
