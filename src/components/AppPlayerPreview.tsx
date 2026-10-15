import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Disc3, Heart, MoreHorizontal, Pause, SlidersHorizontal, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { AppPlayerExperience, type LinkedPlayerDesign } from "./AppPlayerExperience";
import type { PlayerExperienceSlots } from "./PlayerExperience";

export function AppPlayerPreview({ design, desktop }: { design: LinkedPlayerDesign; desktop: boolean }) {
  const frame = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: .4, left: 0, top: 0 });
  const width = desktop ? 980 : 360;
  useLayoutEffect(() => {
    const measure = () => {
      if (!frame.current || !stage.current) return;
      const w = frame.current.clientWidth, h = frame.current.clientHeight, ch = stage.current.offsetHeight;
      if (w < 10 || !ch) return;
      const scale = Math.min((w-12)/width,(h-12)/ch), left = (w-width*scale)/2, top = (h-ch*scale)/2;
      setFit(old => Math.abs(old.scale-scale)<.0001 && Math.abs(old.left-left)<.1 && Math.abs(old.top-top)<.1 ? old : {scale,left,top});
    };
    const observer = new ResizeObserver(measure);
    if (frame.current) observer.observe(frame.current);
    if (stage.current) observer.observe(stage.current);
    measure(); return () => observer.disconnect();
  }, [width]);
  const slots: PlayerExperienceSlots = {
    header: <><ChevronDown size={20}/><span>POCKET RADIO / МУЗЫКА</span><MoreHorizontal size={20}/></>,
    artwork: <div className="ap-demo-art"><Disc3 size={90} strokeWidth={.8}/></div>,
    title: <h2>Там, где тише.</h2>, subtitle: "Вечерняя коллекция · Pocket Radio", status: "Сейчас играет", source: null,
    transport: <><span className="ap-demo-button"><SkipBack size={20}/></span><span className="ap-demo-button ex-primary"><Pause size={26}/><span>Пауза</span></span><span className="ap-demo-button"><SkipForward size={20}/></span></>,
    timeline: <><div className="ap-demo-timeline"><i/></div><div className="ap-demo-times"><span>01:24</span><span>−02:48</span></div></>,
    tools: <>{[Volume2,Heart,SlidersHorizontal,MoreHorizontal].map((Icon,i) => <span key={i} className="ap-demo-tool"><Icon size={18}/></span>)}</>,
    queue: <><div className="ex-queue-heading"><h3>Далее</h3><span>Демонстрационная очередь</span></div><ol>{["Медленный свет","После полуночи"].map((title,i) => <li key={title}><span className="ap-demo-track"><span className="ex-queue-index">0{i+1}</span><span className="ex-queue-copy"><strong>{title}</strong><small>Вечерняя коллекция</small></span><SkipForward size={14}/></span></li>)}</ol></>,
  };
  return <div className="app-player-preview" ref={frame} aria-hidden="true" inert>
    <div className="app-player-preview-stage" ref={stage} style={{width,transform:`translate(${fit.left}px,${fit.top}px) scale(${fit.scale})`}}><AppPlayerExperience design={design} slots={slots} preview/></div>
  </div>;
}
