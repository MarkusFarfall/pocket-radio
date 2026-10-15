import type { ReactNode, Ref, UIEventHandler } from "react";
import type { AppDesign } from "../lib/appDesign";

/** Shared structure for live shells and inert, scaled settings previews. */
export function AppLayout({ design, brand, navigation, toolbar, children, player, aside, mainRef, onScroll, preview = false }: {
  design: Exclude<AppDesign, "classic">; brand: ReactNode; navigation: ReactNode; toolbar: ReactNode;
  children: ReactNode; player?: ReactNode; aside?: ReactNode; mainRef?: Ref<HTMLElement>;
  onScroll?: UIEventHandler<HTMLElement>; preview?: boolean;
}) {
  return <div id={preview ? undefined : "app-shell"} className={`app-layout app-layout-${design}${preview ? " app-layout-preview" : ""}`} data-app-layout={design}>
    <div className="app-layout-grid">
      {design === "editorial" ? <>
        <header className="design-masthead"><div className="design-brand" data-layout={design}>{brand}</div><div className="design-toolbar" data-layout={design}>{toolbar}</div></header>
        <nav className="design-navigation design-navigation-top" data-layout={design} aria-label="Разделы">{navigation}</nav>
      </> : <>
        <aside className="design-sidebar" data-layout={design}><div className="design-brand" data-layout={design}>{brand}</div><nav className="design-navigation" data-layout={design} aria-label="Разделы">{navigation}</nav><div className="design-sidebar-note" data-layout={design}>POCKET RADIO<br />ВАША МУЗЫКА. ВАШ РИТМ.</div></aside>
        <header className="design-workbar"><div className="design-mobile-brand" data-layout={design}>{brand}</div><div className="design-toolbar" data-layout={design}>{toolbar}</div></header>
      </>}
      <main className="design-main" ref={mainRef} onScroll={onScroll}><div className="design-page">{children}</div></main>
      {design === "console" && <aside className="design-inspector" data-layout={design} aria-label="Текущая очередь">{aside}</aside>}
      <div className="design-player-slot" data-layout={design}>{player}</div>
    </div>
  </div>;
}
