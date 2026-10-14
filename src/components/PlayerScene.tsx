import { useEffect, useState } from "react";
import { Pause, SkipBack, SkipForward } from "lucide-react";
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
