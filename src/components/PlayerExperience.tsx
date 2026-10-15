import type { CSSProperties, ReactNode } from "react";
import type { PlayerAppearance } from "../lib/playerAppearance";

/** Layout only. Live controls and inert preview content use exactly the same composition. */
export interface PlayerExperienceSlots {
  header: ReactNode;
  artwork: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  status: ReactNode;
  source: ReactNode;
  transport: ReactNode;
  timeline: ReactNode;
  tools: ReactNode;
  queue: ReactNode;
  feedback?: ReactNode;
}

function Cassette({ label, artwork }: { label: ReactNode; artwork: ReactNode }) {
  return <div className="ex-cassette" data-part="cassette">
    <i className="ex-screw screw-tl" /><i className="ex-screw screw-tr" /><i className="ex-screw screw-bl" /><i className="ex-screw screw-br" />
    <div className="ex-tape-label"><span className="ex-tape-side" aria-hidden="true">A</span><div>{label}</div><div className="ex-tape-art">{artwork}</div></div>
    <div className="ex-tape-window" aria-hidden="true"><span className="ex-reel"><i /></span><span className="ex-tape-bridge" /><span className="ex-reel"><i /></span></div>
    <div className="ex-tape-caption" aria-hidden="true"><span>POCKET / TYPE I</span><span>STEREO CASSETTE</span></div>
    <div className="ex-tape-base" aria-hidden="true"><i /><i /><i /><i /></div>
  </div>;
}

function Record({ artwork }: { artwork: ReactNode }) {
  return <div className="ex-turntable" data-part="turntable">
    <span className="ex-deck-mark" aria-hidden="true">DIRECT DRIVE / PR–01</span>
    <div className="ex-platter"><div className="ex-record" data-motion-part="record"><div className="ex-record-label">{artwork}</div><i className="ex-spindle" /></div></div>
    <div className="ex-tonearm" aria-hidden="true"><i /><span /></div>
    <div className="ex-deck-bottom" aria-hidden="true"><span><i /> 33⅓ RPM</span><span>STEREO / LP</span></div>
  </div>;
}

export function PlayerExperience({ appearance, slots: s, active = false, preview = false, hue = 170 }: {
  appearance: PlayerAppearance; slots: PlayerExperienceSlots; active?: boolean; preview?: boolean; hue?: number;
}) {
  const { skin } = appearance;
  const copy = <div className="ex-copy" data-part="copy"><div className="ex-status">{s.status}</div>{s.title}<div className="ex-subtitle">{s.subtitle}</div>{s.source}</div>;
  const controls = <div className="ex-controls" data-part="controls"><div className="ex-timeline">{s.timeline}</div><div className="ex-transport">{s.transport}</div></div>;
  const queue = <section className="ex-queue" data-part="queue">{s.queue}</section>;
  const tools = <div className="ex-tools" data-part="tools">{s.tools}</div>;
  return <div className={`player-experience player-skin player-skin-${skin} experience-${skin} ${active ? "is-playing" : ""} ${appearance.motion === "none" ? "ex-motion-off" : ""} ${preview ? "ex-preview" : ""}`} data-experience={skin} data-color-wash={appearance.colorWash ? "on" : "off"} style={{ "--player-hue": hue } as CSSProperties}>
    <div className="ex-layout">
      <header className="ex-header">{s.header}</header>
      <div className="ex-feedback">{s.feedback}</div>
      {skin === "vinyl" && <>
        <div className="ex-record-room"><Record artwork={s.artwork} /><div className="ex-record-sleeve"><span className="ex-kicker">ИЗ ВАШЕЙ КОЛЛЕКЦИИ</span>{copy}{controls}{tools}</div></div>
        {queue}
      </>}
      {skin === "studio" && <>
        <div className="ex-deck-heading"><span>POCKET<br /><b>STEREO</b></span><span className="ex-kicker">ПОРТАТИВНЫЙ<br />КАССЕТНЫЙ ПЛЕЕР</span></div>
        <div className="ex-tape-room"><div className="ex-tape-bay"><Cassette label={s.title} artwork={s.artwork} /><div className="ex-tape-info"><div className="ex-status">{s.status}</div><div className="ex-subtitle">{s.subtitle}</div>{s.source}</div></div><div className="ex-keyboard"><span className="ex-kicker">TRANSPORT / УПРАВЛЕНИЕ</span>{controls}{tools}</div></div>
        {queue}
      </>}
      {skin === "neon" && <>
        <div className="ex-console-banner"><span className="ex-kicker">PR / DIGITAL RECEIVER</span><span className="ex-console-chip">AUDIO</span></div>
        <div className="ex-console-grid"><div className="ex-terminal" data-part="terminal"><div className="ex-terminal-top"><span>NOW PLAYING_</span><div className="ex-terminal-art">{s.artwork}</div></div>{copy}<div className="ex-signal" aria-hidden="true" title="Декоративный ритм, не измеритель аудиосигнала">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ "--bar": `${18 + ((i * 17) % 71)}%`, "--delay": `${i * -0.13}s` } as CSSProperties} />)}</div>{s.timeline}</div>{queue}</div>
        <div className="ex-console-command"><span className="ex-kicker">TRANSPORT<br />CONTROL_</span><div className="ex-transport" data-part="controls">{s.transport}</div></div>{tools}
      </>}
      {skin === "paper" && <>
        <div className="ex-editorial-masthead"><span>POCKET<br /><b>SESSIONS</b></span><span>ЗВУК.<br />БЕЗ ЛИШНИХ СЛОВ.</span></div>
        <div className="ex-editorial-grid"><div className="ex-editorial-copy"><span className="ex-kicker">ЛИЧНАЯ КОЛЛЕКЦИЯ / СЕЙЧАС</span>{copy}<div className="ex-editorial-controls">{controls}</div></div><figure className="ex-editorial-art" data-part="poster"><div>{s.artwork}</div><figcaption>СЛУШАТЬ. ЧУВСТВОВАТЬ. ПОВТОРЯТЬ.</figcaption></figure></div>
        <div className="ex-editorial-bottom">{tools}{queue}</div>
      </>}
      {skin === "aurora" && <>
        <div className="ex-cinema" data-part="cinema"><div className="ex-cinema-art">{s.artwork}</div><div className="ex-cinema-shade" /><span className="ex-cinema-caption">POCKET / IMMERSIVE</span><div className="ex-cinema-title">{copy}</div></div>
        <div className="ex-cinema-dock"><div className="ex-transport" data-part="controls">{s.transport}</div><div className="ex-timeline">{s.timeline}</div>{tools}</div>
        {queue}
      </>}
    </div>
  </div>;
}
