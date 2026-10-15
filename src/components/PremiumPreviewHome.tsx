import { Disc3, Play } from "lucide-react";
import type { PremiumDesign } from "../lib/appDesign";

/** Inert schematic content; the shell and visual structures match the live composition. */
export function PremiumPreviewHome({ design }: { design: PremiumDesign }) {
  const covers = <div className="preview-cover-row">{[0,1,2,3].map(i => <div key={i}><i style={{ filter: `hue-rotate(${i*40}deg)` }}/><span>Коллекция {i+1}</span></div>)}</div>;
  return <div className="premium-preview">
    {design === "panorama" && <><h3>Хорошо быть здесь.</h3><div className="panorama-feature"><span className="premium-eyebrow">ВРЕМЯ ДЛЯ СЕБЯ</span><h2>Остановиться.<br/>И послушать.</h2><span className="premium-primary"><Play size={14}/>Слушать</span></div>{covers}</>}
    {design === "focus" && <><h3>Всё начинается со звука.</h3><div className="focus-home-workspace"><div className="focus-feature"><div className="focus-feature-art"/><h2>Близкие частоты.</h2><span className="premium-primary">Слушать</span></div><div className="preview-table">{["Медленный свет","Музыка без слов","После полуночи","На своей волне","Частоты города"].map((name,i) => <div key={name}><span>0{i+1}</span><i/><strong>{name}</strong><Play size={14}/></div>)}</div></div>{covers}</>}
    {design === "atelier" && <><h3>Собрано вами.</h3><div className="atelier-album"><div className="atelier-album-copy"><span className="premium-eyebrow">ЛИЧНАЯ ФОНОТЕКА</span><h2>Любимое.<br/>Бережно собрано.</h2><span className="premium-primary">Открыть коллекцию</span></div><div className="atelier-album-art"><div className="atelier-sleeve"/><div className="atelier-sleeve"/><div className="atelier-sleeve"><Disc3 size={90} strokeWidth={.7}/></div></div></div>{covers}</>}
    {design === "nocturne" && <><div className="nocturne-feature"><span className="premium-eyebrow">ВАШ ЛИЧНЫЙ СЕАНС</span><h3>Всё остальное<br/>может подождать.</h3><span className="premium-primary">Слушать</span></div>{covers}</>}
  </div>;
}
