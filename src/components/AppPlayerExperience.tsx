import { APP_DESIGNS, type AppDesign } from "../lib/appDesign";
import type { PlayerExperienceSlots } from "./PlayerExperience";

export type LinkedPlayerDesign = Exclude<AppDesign, "classic">;

/** Composition only: the live player and its preview share these exact layouts.
 * All colors/fonts come from the application. No independent skin or audio state. */
export function AppPlayerExperience({ design, slots: s, preview = false }: {
  design: LinkedPlayerDesign; slots: PlayerExperienceSlots; preview?: boolean;
}) {
  const name = APP_DESIGNS.find(t => t.id === design)!.name;
  const artwork = <div className="ap-artwork" data-player-part="artwork">{s.artwork}</div>;
  const copy = <div className="ap-copy" data-player-part="copy"><div className="ap-status">{s.status}</div>{s.title}<div className="ap-subtitle">{s.subtitle}</div><div className="ap-source">{s.source}</div></div>;
  const timeline = <div className="ap-timeline">{s.timeline}</div>;
  const transport = <div className="ap-transport" data-player-part="controls">{s.transport}</div>;
  const tools = <div className="ap-tools">{s.tools}</div>;
  const controls = <div className="ap-controls">{timeline}{transport}</div>;
  const queue = <section className="ap-queue" aria-label={preview ? undefined : "Далее в очереди"}>{s.queue}</section>;
  return <div className={`app-player-experience${preview ? " ap-preview" : ""}`} data-app-player={design} data-player-mode="full">
    <div className="ap-layout" data-player-composition={design}>
      <header className="ap-header">{s.header}</header>
      <div className="ap-identity"><span>pocket radio.</span><span>{name} / Сейчас играет</span></div>
      {s.feedback && <div className="ap-feedback">{s.feedback}</div>}
      {design === "panorama" && <><div className="ap-panorama-stage">{artwork}<div className="ap-listening">{copy}{controls}{tools}</div></div>{queue}</>}
      {design === "focus" && <div className="ap-focus-content"><div className="ap-focus-band">{artwork}{copy}</div>{controls}{tools}{queue}</div>}
      {design === "atelier" && <><div className="ap-album-spread"><div className="ap-album-sleeve">{artwork}</div><div className="ap-listening">{copy}{tools}</div></div><div className="ap-album-strip">{timeline}{transport}</div>{queue}</>}
      {design === "nocturne" && <><div className="ap-nocturne-stage">{artwork}{copy}</div><div className="ap-nocturne-dock">{transport}{timeline}{tools}</div>{queue}</>}
      {design === "editorial" && <><div className="ap-editorial-spread">{copy}{artwork}</div>{timeline}<div className="ap-editorial-bottom">{transport}{tools}</div>{queue}</>}
      {design === "library" && <div className="ap-library-workspace"><div className="ap-library-listening">{artwork}{copy}{controls}{tools}</div>{queue}</div>}
      {design === "console" && <div className="ap-console-workspace"><div className="ap-console-display">{artwork}{copy}</div>{queue}<div className="ap-console-controls">{controls}{tools}</div></div>}
    </div>
  </div>;
}
