import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Heart, SlidersHorizontal, Volume2, MoreHorizontal, Pause, SkipBack, SkipForward } from "lucide-react";
import { PlayerExperience, type PlayerExperienceSlots } from "./PlayerExperience";
import type { PlayerAppearance } from "../lib/playerAppearance";

/** Decorative only: never opens an AudioContext or pretends to measure the audio. */
export function PlayerScene() {
  return <div className="player-scene" aria-hidden="true">
    <span className="scene-orb scene-orb-one" /><span className="scene-orb scene-orb-two" />
    <span className="scene-grid" />
  </div>;
}

export function PlayerDial() {
  return <div className="player-dial" aria-hidden="true">
    <span>POCKET / FM</span><span className="dial-scale"><i /></span><span>STEREO</span>
  </div>;
}

/** Shares the real player's skin, artwork, animation and decorative components. */
export function PlayerTemplatePreview({ appearance, large = false, desktop = false }: { appearance: PlayerAppearance; large?: boolean; desktop?: boolean }) {
  if (appearance.skin !== "classic") return <ExperiencePreview appearance={appearance} large={large} desktop={desktop} />;
  return <div aria-hidden="true" className={`player-template-preview player-skin player-skin-${appearance.skin} player-layout-${appearance.layout} player-motion-${appearance.motion} ${large ? "preview-large" : ""} ${desktop ? "preview-desktop" : ""}`} data-color-wash={appearance.colorWash ? "on" : "off"}>
    <PlayerScene />
    <div className="preview-topline"><span>POCKET RADIO</span><span>● STEREO</span></div>
    <div className="preview-body">
      <div className="player-art-wrap preview-art-wrap">
        <span className="player-wave player-wave-1" /><span className="player-wave player-wave-2" />
        <div className="player-art preview-art"><span className="preview-art-orbit" /><span className="preview-art-label">SIDE<br />A / 01</span></div>
      </div>
      <div className="preview-copy"><span className="preview-eyebrow">ВАША МУЗЫКА</span><strong>В своём ритме</strong><span>Pocket Radio · Предпросмотр</span>
        <div className="preview-progress"><i /></div>
        <div className="preview-controls"><SkipBack size={13} fill="currentColor" /><span><Pause size={16} fill="currentColor" /></span><SkipForward size={13} fill="currentColor" /></div>
      </div>
    </div>
    <PlayerDial />
  </div>;
}

/** Stop decorative work when the page is hidden; audio playback is untouched. */
export function usePlayerMotionActive(playing: boolean, open: boolean) {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return playing && open && visible;
}

function ExperiencePreview({ appearance, large, desktop }: { appearance: PlayerAppearance; large: boolean; desktop: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: .4, left: 0, top: 0 });
  const width = desktop ? 920 : 360;
  useLayoutEffect(() => {
    const update = () => {
      if (!frame.current || !stage.current) return;
      const w = frame.current.clientWidth, h = frame.current.clientHeight, contentHeight = stage.current.offsetHeight;
      if (w <= 10 || h <= 10 || !contentHeight) return;
      const scale = Math.min((w - 10) / width, (h - 10) / contentHeight);
      const next = { scale, left: (w - width * scale) / 2, top: (h - contentHeight * scale) / 2 };
      setFit(old => Math.abs(old.scale - next.scale) < .0001 && Math.abs(old.left - next.left) < .1 && Math.abs(old.top - next.top) < .1 ? old : next);
    };
    const observer = new ResizeObserver(update);
    if (frame.current) observer.observe(frame.current);
    if (stage.current) observer.observe(stage.current);
    update();
    return () => observer.disconnect();
  }, [width]);
  const slots: PlayerExperienceSlots = {
    header: <><span>⌄</span><span>POCKET RADIO</span><span>•••</span></>,
    artwork: <div className="ex-demo-art" />,
    title: <h2>Там, где<br />тише.</h2>,
    subtitle: "Вечерняя коллекция · Pocket Radio",
    status: "Сейчас играет",
    source: null,
    transport: <><span className="ex-demo-button"><SkipBack size={22} /><span>Назад</span></span><span className="ex-demo-button ex-primary"><Pause size={26} /><span>Пауза</span></span><span className="ex-demo-button"><SkipForward size={22} /><span>Далее</span></span></>,
    timeline: <><div className="ex-demo-timeline"><i /></div><div className="ex-demo-times"><span>01:24</span><span>04:12</span></div></>,
    tools: <>{[Volume2, Heart, SlidersHorizontal, MoreHorizontal].map((Icon,i) => <span key={i} className="ex-demo-tool"><Icon size={16} /></span>)}</>,
    queue: <><div className="ex-queue-heading"><h3>Далее</h3><span>02 ТРЕКА</span></div><ol>{["Медленный свет", "После полуночи"].map((name, i) => <li key={name}><span className="ex-demo-track"><span className="ex-queue-index">0{i + 1}</span><span className="ex-queue-copy"><strong>{name}</strong><small>Вечерняя коллекция</small></span></span></li>)}</ol></>,
  };
  return <div ref={frame} aria-hidden="true" className={`experience-thumbnail player-template-preview player-skin player-skin-${appearance.skin} ${large ? "preview-large" : ""} ${desktop ? "preview-desktop" : ""}`}>
    <div ref={stage} className="ex-preview-stage" style={{ width, transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})` }}>
      <PlayerExperience appearance={appearance} slots={slots} preview />
    </div>
  </div>;
}
