import type { ReactNode, Ref, UIEventHandler } from "react";
import type { PremiumDesign } from "../lib/appDesign";

export function PremiumLayout({ design, brand, navigation, toolbar, children, player, collection, mainRef, onScroll, preview }: {
  design: PremiumDesign; brand: ReactNode; navigation: ReactNode; toolbar: ReactNode;
  children: ReactNode; player?: ReactNode; collection?: ReactNode; mainRef?: Ref<HTMLElement>;
  onScroll?: UIEventHandler<HTMLElement>; preview?: boolean;
}) {
  const nav = <nav className="premium-navigation" data-layout={design} aria-label="Разделы">{navigation}</nav>;
  const logo = <div className="premium-brand" data-layout={design}>{brand}</div>;
  return <div id={preview ? undefined : "app-shell"} className={`app-layout app-layout-${design} premium-layout${preview ? " app-layout-preview" : ""}`} data-app-layout={design} data-premium={design}>
    <div className="app-layout-grid premium-shell" data-layout={design}>
      <header className="premium-header" data-layout={design}>
        {logo}
        {design === "panorama" && nav}
        <div className="design-toolbar premium-toolbar" data-layout={design}>{toolbar}</div>
      </header>
      {design === "focus" && <aside className="premium-island">{nav}</aside>}
      {design === "atelier" && <aside className="premium-library-sidebar">{nav}<div className="premium-sidebar-collection"><span>Ваша фонотека</span>{collection}</div></aside>}
      <main className="design-main premium-main" data-layout={design} ref={mainRef} onScroll={onScroll}><div className="design-page premium-page" data-layout={design}>{children}</div></main>
      <div className="design-player-slot premium-player" data-layout={design}>{player}</div>
      {design === "nocturne" && <div className="premium-bottom-nav">{nav}</div>}
    </div>
  </div>;
}
