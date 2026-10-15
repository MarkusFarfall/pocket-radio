import { ArrowRight, ArrowUpRight, Disc3, Heart, Play, Plus, Search, Shuffle, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { ViewProps } from "./shared";
import type { PremiumDesign } from "../lib/appDesign";
import { Cover } from "../components/Cover";
import { PlaylistArtwork } from "../components/PlaylistArtwork";
import { usePlaylists } from "../lib/playlists";
import { gotoPlaylist } from "../lib/picker";
import { player } from "../lib/player";
import { installStarter } from "../lib/starter";
import { toast } from "../lib/toast";
import { SavedTracks } from "./Home";

export function PremiumHome({ design, stations, online, cachedIds, onPlay, onAdd, onScan, onDemo, go }: ViewProps & { design: PremiumDesign }) {
  const playlists = usePlaylists() ?? [];
  const [favorites, setFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const featured = useMemo(() => [...stations].sort((a,b) => Number(b.favorite)-Number(a.favorite) || (b.lastPlayedAt ?? 0)-(a.lastPlayedAt ?? 0)), [stations]);
  const first = featured[0];
  const queue = featured.map(s => s.id);
  const visible = design !== "focus" ? featured : featured.filter(s => (!favorites || s.favorite) && s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const setup = <div className="premium-setup"><button className="premium-primary" onClick={async () => { const n = await installStarter(); toast(n ? `Добавлено ${n} станций` : "Станции уже в каталоге", "ok"); }}><Sparkles size={16}/>Быстрый старт</button><button onClick={onAdd}><Plus size={16}/>Свой поток</button><button onClick={onScan}>Сканировать QR</button></div>;
  const random = () => {
    const pool = stations.filter(s => online || cachedIds.has(s.id) || s.kind === "lan");
    if (!pool.length) { toast("Нет доступных станций", "info"); return; }
    const ids = player.shuffleQueue(pool), next = pool.find(s => s.id === ids[0]);
    if (next) onPlay(next, ids);
  };
  const listen = first ? <button className="premium-primary" onClick={() => onPlay(first, queue)}><Play size={16} fill="currentColor"/>Слушать</button> : setup;
  const sectionTitle = (title: string, label: string, action: () => void) => <div className="premium-section-title"><h2>{title}</h2><button onClick={action}>{label}<ArrowUpRight size={16}/></button></div>;
  const empty = <div className="premium-empty"><Disc3 size={30}/><h3>Место для вашей музыки</h3><p>Добавьте свои станции или начните с готовой коллекции.</p>{setup}</div>;
  const shelves = <section className="premium-shelves">{sectionTitle(design === "nocturne" ? "Ваша вечерняя коллекция" : "В вашей коллекции", "Весь каталог", () => go("catalog"))}{featured.length ? <div className="premium-cover-shelf">{featured.slice(0,6).map(s => <button key={s.id} className="premium-cover-item" aria-label={`Слушать ${s.name}`} onClick={() => onPlay(s,queue)}><span className="premium-cover-image"><Cover s={s} size="fill"/><span className="premium-cover-play"><Play size={19} fill="currentColor"/></span></span><strong>{s.name}</strong><small>{s.genre || "Из вашей коллекции"}{!online && !cachedIds.has(s.id) && s.kind !== "lan" ? " · Нужна сеть" : ""}</small></button>)}</div> : empty}</section>;
  const collections = <section className="premium-collections">{sectionTitle("Плейлисты", "Все", () => go("playlists"))}{playlists.length ? <div className="premium-collection-grid">{playlists.slice(0,4).map(pl => <button key={pl.id} onClick={() => gotoPlaylist(pl.id)}><span className="premium-playlist-art"><PlaylistArtwork playlist={pl}/></span><span><strong>{pl.name}</strong><small>{pl.items.length} треков</small></span><ArrowUpRight size={16}/></button>)}</div> : <button className="premium-new-collection" onClick={() => go("playlists")}><span><Plus size={24}/></span><strong>Первая коллекция<small>Соберите музыку, к которой хочется возвращаться.</small></strong><ArrowRight size={18}/></button>}</section>;
  const rows = <div className="premium-track-list">{visible.slice(0,8).map((s,i) => <button key={s.id} onClick={() => onPlay(s, visible.map(x => x.id))} aria-label={`Слушать ${s.name}`}><span className="premium-track-number">{String(i+1).padStart(2,"0")}</span><Cover s={s} size={46}/><span className="premium-track-copy"><strong>{s.name}</strong><small>{[s.genre,s.city].filter(Boolean).join(" · ") || "Ваша коллекция"}</small></span>{s.favorite && <Heart size={14} fill="currentColor"/>}<Play size={15}/></button>)}{!visible.length && <p className="premium-no-results">{stations.length ? "Здесь пока ничего нет. Измените поиск или добавьте станции в избранное." : "Добавьте музыку, чтобы начать."}</p>}</div>;
  return <div className={`premium-home premium-home-${design}`} data-premium-home={design}>
    {design === "panorama" && <>
      <header className="premium-home-heading"><div><span className="premium-eyebrow">ВАША МУЗЫКА, ВАШ ТЕМП</span><h1>Хорошо быть здесь.</h1><p>Знакомые голоса. Новые любимые частоты.</p></div><button className="premium-subtle" onClick={first ? random : onDemo}><Shuffle size={17}/>{first ? "Случайный выбор" : "Найти музыку"}</button></header>
      <section className="panorama-feature"><div className="panorama-feature-copy"><span className="premium-eyebrow">ВРЕМЯ ДЛЯ СЕБЯ</span><h2>Остановиться.<br/>И послушать.</h2><p>{first ? first.name : "Начните с музыки, которая вам близка."}</p>{listen}</div><div className="panorama-feature-tag" aria-hidden="true">pocket radio / listening space</div></section>
      {shelves}{collections}
    </>}
    {design === "focus" && <>
      <header className="premium-home-heading"><div><span className="premium-eyebrow">ТОЛЬКО ТО, ЧТО ВАЖНО</span><h1>Всё начинается со звука.</h1><p>Меньше отвлечений. Больше вашей музыки.</p></div></header>
      <div className="focus-home-workspace"><section className="focus-feature"><div className="focus-feature-art">{first ? <Cover s={first} size="fill"/> : <div className="premium-silent-art"><Disc3 size={68} strokeWidth={1}/></div>}</div><span className="premium-eyebrow">{first ? "ИЗ ВАШЕЙ КОЛЛЕКЦИИ" : "ПЕРВОЕ ВКЛЮЧЕНИЕ"}</span><h2>{first?.name || "Пусть зазвучит."}</h2><p>{first?.genre || "Выберите свою первую станцию."}</p>{listen}</section><section className="focus-selection"><div className="focus-list-tools"><div className="premium-filter-tabs"><button aria-pressed={!favorites} onClick={() => setFavorites(false)}>Всё</button><button aria-pressed={favorites} onClick={() => setFavorites(true)}>Избранное</button></div><button aria-label="Открыть каталог" onClick={() => go("catalog")}><ArrowUpRight size={18}/></button></div><label className="premium-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти свою музыку" aria-label="Найти в своей коллекции"/></label>{rows}</section></div>
      {collections}
    </>}
    {design === "atelier" && <>
      <header className="premium-home-heading"><div><span className="premium-eyebrow">ЛИЧНАЯ ФОНОТЕКА</span><h1>Собрано вами.</h1><p>Музыка, у которой есть своё место.</p></div><button className="premium-subtle" onClick={() => go("playlists")}><Plus size={17}/>Собрать плейлист</button></header>
      <section className="atelier-album"><div className="atelier-album-copy"><span className="premium-eyebrow">{playlists.length ? "ВАША КОЛЛЕКЦИЯ" : "НА ПЕРВОЙ ПОЛКЕ"}</span><h2>{playlists[0]?.name || "Любимое.\nБережно собрано."}</h2><p>{playlists[0] ? `${playlists[0].items.length} треков · Личный плейлист` : "Станции, свои записи и маленькие музыкальные открытия."}</p>{playlists[0] ? <button className="premium-primary" onClick={() => gotoPlaylist(playlists[0].id)}>Открыть коллекцию<ArrowRight size={16}/></button> : listen}</div><div className="atelier-album-art" aria-hidden="true">{playlists.length ? playlists.slice(0,3).reverse().map(pl => <div key={pl.id}><PlaylistArtwork playlist={pl}/></div>) : featured.length ? featured.slice(0,3).reverse().map(s => <div key={s.id}><Cover s={s} size="fill"/></div>) : <><div className="atelier-sleeve"/><div className="atelier-sleeve"/><div className="atelier-sleeve"><Disc3 size={90} strokeWidth={.7}/></div></>}</div></section>
      <div className="atelier-lower">{collections}<section className="atelier-recent">{sectionTitle("Близкие частоты", "Все", () => go("catalog"))}{rows}</section></div>
      {shelves}
    </>}
    {design === "nocturne" && <>
      <section className="nocturne-feature"><div><span className="premium-eyebrow">ВАШ ЛИЧНЫЙ СЕАНС</span><h1>Всё остальное<br/>может подождать.</h1><p>{first ? first.name : "Останьтесь наедине с музыкой."}</p>{listen}</div><span className="nocturne-feature-caption" aria-hidden="true">Меньше света. Больше звука.</span></section>
      <div className="nocturne-shortcuts"><span>{stations.length} станций в коллекции</span><button onClick={first ? random : onDemo}><Shuffle size={16}/>{first ? "Довериться случаю" : "Открыть новое"}</button></div>
      {shelves}{collections}
    </>}
    <div className="premium-saved-tracks"><SavedTracks/></div>
    <button className="premium-discover" onClick={onDemo}><Sparkles size={22}/><span><strong>Всегда есть что открыть.</strong><small>Станции, подборки и музыка за пределами вашей коллекции.</small></span><ArrowRight size={20}/></button>
  </div>;
}
