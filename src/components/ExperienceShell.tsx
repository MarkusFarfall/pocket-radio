import { ArrowLeft, ArrowRight, Plus, Play, UserRound, Radio, Maximize2 } from "lucide-react";
import type { ReactNode, Ref, UIEventHandler } from "react";
import type { AppDesign } from "../lib/appDesign";
import type { Tab } from "../views/shared";
import { NAV } from "../lib/nav";
import { player, usePlayer } from "../lib/player";
import { useIsDesktop } from "../lib/desktop";
import { AppLayout } from "./AppLayout";
import { Cover } from "./Cover";
import { DockPlayer, MiniPlayer, statusText } from "./PlayerUI";

export function ExperienceShell({ design, tab, onTab, online, stationCount, children, mainRef, onScroll, onAdd, onAccount, onPlayer, back, forward, canBack, canForward }: {
  design: Exclude<AppDesign, "classic">; tab: Tab; onTab: (tab: Tab) => void; online: boolean; stationCount: number;
  children: ReactNode; mainRef: Ref<HTMLElement>; onScroll: UIEventHandler<HTMLElement>; onAdd: () => void; onAccount: () => void; onPlayer: () => void;
  back: () => void; forward: () => void; canBack: boolean; canForward: boolean;
}) {
  const p = usePlayer();
  const desktop = useIsDesktop();
  const all = player.queueItems();
  const index = all.findIndex(s => s.id === p.station?.id);
  const queue = (index >= 0 ? all.slice(index + 1) : all).slice(0, 6);
  const brand = <button onClick={() => onTab("home")} className="design-brand-button" aria-label="На главную"><Radio size={26} /><span>pocket<span className="design-brand-second">radio<span className="design-brand-dot">.</span></span></span></button>;
  const navigation = NAV.map((n, i) => <button key={n.id} onClick={() => onTab(n.id)} aria-label={n.label} aria-current={tab === n.id ? "page" : undefined}><span className="design-nav-number">0{i + 1}</span><n.icon size={19} /><span className="design-nav-label">{n.label}</span></button>);
  const toolbar = <>
    <div className="design-history"><button onClick={back} disabled={!canBack} aria-label="Назад"><ArrowLeft size={18} /></button><button onClick={forward} disabled={!canForward} aria-label="Вперёд"><ArrowRight size={18} /></button></div>
    <div className="design-context"><b>{NAV.find(n => n.id === tab)?.label}</b><span>{online ? "В сети" : "Офлайн"} · {stationCount} станций</span></div>
    <button className="design-add" onClick={onAdd} aria-label="Добавить станцию"><Plus size={18} /><span>Добавить</span></button>
    {p.station && <button onClick={onPlayer} aria-label="Развернуть плеер"><Maximize2 size={18} /></button>}
    <button onClick={onAccount} aria-label="Аккаунт"><UserRound size={18} /></button>
  </>;
  const aside = <div className="console-inspector-content"><div className="design-section-label">NOW / СЕЙЧАС</div>{p.station ? <>
    <button className="console-current" onClick={onPlayer}><Cover s={p.station} size={64} /><span><strong>{p.meta?.title || p.station.name}</strong><small>{statusText(p)}</small></span><Maximize2 size={16} /></button>
    <div className="design-section-label">ОЧЕРЕДЬ / {queue.length.toString().padStart(2, "0")}</div><ol>{queue.map((s, i) => <li key={s.id}><button onClick={() => void player.play(s, p.queue, { sourcePlaylistId: p.sourcePlaylistId, sourceContext: p.sourceContext })}><span>0{i + 1}</span><strong>{s.name}</strong><Play size={13} /></button></li>)}</ol>
    {!queue.length && <p>Следующих треков пока нет. Добавьте музыку в плейлист.</p>}
  </> : <div className="console-inspector-empty"><Radio size={36} /><strong>Ожидание сигнала</strong><p>Включите станцию или плейлист. Здесь будут текущий источник и очередь.</p><button onClick={() => onTab("catalog")}>Открыть каталог →</button></div>}</div>;
  return <AppLayout design={design} brand={brand} navigation={navigation} toolbar={toolbar} mainRef={mainRef} onScroll={onScroll} aside={aside} player={p.station ? (desktop ? <DockPlayer onOpen={onPlayer} /> : <MiniPlayer onOpen={onPlayer} />) : <div className="design-player-empty"><Radio size={16} /><span>Выберите музыку — управление появится здесь</span><button onClick={() => onTab("catalog")}>В каталог →</button></div>}>{children}</AppLayout>;
}
