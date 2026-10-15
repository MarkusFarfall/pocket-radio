import { useLayoutEffect, useRef, useState } from "react";
import { Check, Play, Plus, Radio } from "lucide-react";
import { APP_DESIGNS, applyAppDesign, useAppDesign, type AppDesign } from "../lib/appDesign";
import { NAV } from "../lib/nav";
import { AppLayout } from "./AppLayout";

function DesignPreview({ design }: { design: AppDesign }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(.3);
  useLayoutEffect(() => {
    const measure = () => { if (host.current) setScale(Math.max(.1, host.current.clientWidth / 1440)); };
    const observer = new ResizeObserver(measure);
    if (host.current) observer.observe(host.current);
    measure(); return () => observer.disconnect();
  }, []);
  const kind = design === "classic" ? "console" : design;
  return <div ref={host} className={`app-design-preview preview-design-${design}`} aria-hidden="true" style={{ height: scale * 900 }}>
    <div style={{ width: 1440, height: 900, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <AppLayout preview design={kind} brand={<span className="preview-brand">pocket<br /><b>radio.</b></span>} navigation={NAV.map((n,i) => <span className={`preview-nav-item ${i===0 ? "selected" : ""}`} key={n.id}><n.icon size={20}/><span>{n.label}</span></span>)} toolbar={<><span className="preview-context">{design === "editorial" ? "ЛИЧНОЕ МУЗЫКАЛЬНОЕ ИЗДАНИЕ" : "ВАША МУЗЫКА / ВАШ РИТМ"}</span><span className="preview-add"><Plus size={14}/> Добавить</span></>} player={<div className="preview-player"><Radio size={22}/><span>Вечерняя коллекция</span><Play size={18} fill="currentColor"/><i/></div>} aside={<div className="preview-queue"><b>СЕЙЧАС / ОЧЕРЕДЬ</b>{["Медленный свет","После полуночи","Новые частоты"].map((s,i)=><span key={s}>0{i+1} — {s}</span>)}</div>}>
        <div className={`preview-home preview-home-${design}`}>
          <span className="preview-context">{design === "classic" ? "POCKET RADIO" : "ЛИЧНАЯ КОЛЛЕКЦИЯ"}</span>
          <h3>{design === "editorial" ? <>Искусство <em>слушать.</em></> : design === "library" ? <>Хорошая музыка.<br/>Уже рядом.</> : design === "console" ? "Рабочий пульт_" : "Что послушаем?"}</h3>
          {design === "console" ? <><div className="preview-metrics"><span>ИСТОЧНИКИ<b>24</b></span><span>ПЛЕЙЛИСТЫ<b>06</b></span><span>ИЗБРАННОЕ<b>12</b></span></div><div className="preview-table">{["Вечерняя коллекция","Частоты города","Музыка без слов","Медленный свет"].map((s,i)=><div key={s}><span>0{i+1}</span><i/><strong>{s}</strong><Play size={14}/></div>)}</div></> : <><div className="preview-feature"><div className="preview-feature-art"><i/></div><div className="preview-feature-copy"><small>В ФОКУСЕ</small><b>Звук вашего<br/>нового дня.</b><span>Слушать →</span></div></div><div className="preview-cover-row">{[0,1,2,3].map(i=><div key={i}><i style={{filter:`hue-rotate(${i*50}deg)`}}/><span>Коллекция 0{i+1}</span></div>)}</div></>}
        </div>
      </AppLayout>
    </div>
  </div>;
}

export function AppDesignSection() {
  const current = useAppDesign();
  return <section className="app-design-section" data-row="Интерфейсы приложения" aria-labelledby="app-design-title">
    <div className="app-design-intro"><span>POCKET RADIO / НОВАЯ КОМПОЗИЦИЯ</span><h3 id="app-design-title">Один мир музыки.<br/>Разные интерфейсы.</h3><p>Меняются навигация, главная, каталог, плейлисты, рабочие панели и связанный плеер. Не только цвет или скругления.</p></div>
    <div className="app-design-cards">{APP_DESIGNS.map((t,i) => <button key={t.id} className={`app-design-card ${current === t.id ? "is-selected" : ""}`} aria-label={`Интерфейс «${t.name}»`} aria-pressed={current === t.id} onClick={(event) => {
        const button = event.currentTarget;
        applyAppDesign(t.id);
        // Moving the stable page host between shells preserves state, but the DOM move blurs focus.
        requestAnimationFrame(() => { if (button.isConnected) button.focus({ preventScroll: true }); });
      }}>
      <DesignPreview design={t.id}/>
      <span className="app-design-card-top"><span>0{i+1} / {t.eyebrow}</span>{current===t.id && <Check size={18}/>}</span>
      <strong>{t.name}</strong><span className="app-design-description">{t.desc}</span>
      <span className="app-design-features">{t.features.map(f=><span key={f}>{f}</span>)}</span>
      <span className="app-design-choose">{current===t.id ? "Выбран" : "Применить интерфейс"}<span>↗</span></span>
    </button>)}</div>
    <p className="app-design-note">Схематические предпросмотры с демонстрационными данными. Выбор применяется сразу и сохраняется на устройстве. Масштаб и «Меньше анимаций» сохраняются; станции, плейлисты и EQ не меняются. «Классика» возвращает предыдущее оформление. Цвета и стиль плеера можно затем настроить отдельно.</p>
  </section>;
}
