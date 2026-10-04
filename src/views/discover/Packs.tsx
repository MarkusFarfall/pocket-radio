import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Plus, Search, Sparkles, X } from "lucide-react";
import type { Draft } from "../../lib/types";
import type { ViewProps } from "../shared";
import { ALL_PACK_STATIONS, PACKS, packId, type Pack } from "../../lib/packs";
import { addMany, draftToStation } from "../../lib/db";
import { installStarter } from "../../lib/starter";
import { GLYPHS } from "../../lib/glyphs";
import { toast } from "../../lib/toast";
import { btnGhost, btnPrimary, inputCls } from "../../components/ui";
import { ListModal } from "../../components/ListModal";
import { Photo } from "../../components/Photo";

export function plural(n: number, a: string, b: string, c: string) {
  const m = n % 100;
  if (m > 10 && m < 15) return c;
  const r = n % 10;
  return r === 1 ? a : r > 1 && r < 5 ? b : c;
}

function PackCard({ p, fresh, busy, onOpen, onAdd }: { p: Pack; fresh: number; busy: boolean; onOpen: () => void; onAdd: () => void }) {
  const G = GLYPHS[p.glyph]?.icon ?? GLYPHS.radio.icon;
  return (
    <div className="motion-card group overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-ink/25">
      <button onClick={onOpen} className="relative block aspect-[16/9] w-full text-left">
        <Photo pack={p} w={640} h={360} className="absolute inset-0" />
        <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md">
          <G size={16} />
        </span>
        <span className="absolute right-3 top-3 rounded-md bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
          {p.stations.length} {plural(p.stations.length, "станция", "станции", "станций")}
        </span>
        <span className="absolute inset-x-0 bottom-0 p-3.5 font-display text-lg font-semibold leading-tight tracking-tight text-white">{p.title}</span>
      </button>
      <div className="space-y-3 p-3.5">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm leading-snug text-muted">{p.desc}</p>
        <div className="flex gap-2">
          <button className={btnGhost + " flex-1 !py-2"} onClick={onOpen}>
            Открыть
          </button>
          <button className={btnPrimary + " flex-1 !py-2"} disabled={!fresh || busy} onClick={onAdd}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {fresh ? `+${fresh}` : "Есть"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Packs({ have, onPlay }: { have: Set<string>; onPlay: ViewProps["onPlay"] }) {
  const [open, setOpen] = useState<Pack | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<"all" | Pack["group"]>("all");
  const freshAll = ALL_PACK_STATIONS.filter((d) => !have.has(d.url!));

  // переход с главной: сразу открыть выбранный пак
  useEffect(() => {
    const id = localStorage.getItem("radio.openPack");
    if (!id) return;
    localStorage.removeItem("radio.openPack");
    const p = PACKS.find((x) => x.id === id);
    if (p) setOpen(p);
  }, []);

  const items = useMemo(() => (open ? open.stations.map((d) => draftToStation({ ...d, id: packId(d.url!) })) : []), [open]);

  const add = async (id: string, drafts: Draft[]) => {
    setBusy(id);
    const fresh = drafts.filter((d) => !have.has(d.url!)).map((d) => ({ ...d, id: packId(d.url!) }));
    const n = await addMany(fresh);
    setBusy(null);
    toast(n ? `Добавлено станций: ${n}` : "Всё уже в каталоге", n ? "ok" : "info");
  };

  const groups: Pack["group"][] = ["Подборки", "Страны"];
  const needle = q.trim().toLowerCase();
  const matches = (p: Pack) =>
    (group === "all" || p.group === group) &&
    (!needle || `${p.title} ${p.desc} ${p.stations.map((s) => `${s.name} ${s.genre} ${(s.tags ?? []).join(" ")}`).join(" ")}`.toLowerCase().includes(needle));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-4 md:p-5">
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold">
            {ALL_PACK_STATIONS.length} станций в {PACKS.length} паках
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Каждый пак можно проверить перед установкой: приложение беззвучно откроет потоки и отметит, какие отвечают. Не знаете, с чего начать, — возьмите быстрый старт.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={btnGhost}
            onClick={async () => {
              const n = await installStarter();
              toast(n ? `Быстрый старт: добавлено ${n} станций` : "Стартовый набор уже установлен", n ? "ok" : "info");
            }}
          >
            <Sparkles size={16} /> Быстрый старт
          </button>
          <button className={btnPrimary} disabled={!freshAll.length || busy === "all"} onClick={() => add("all", ALL_PACK_STATIONS)}>
            {busy === "all" ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
            {freshAll.length ? `Установить всё (${freshAll.length})` : "Всё установлено"}
          </button>
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className={inputCls + " pl-10 pr-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти пак, жанр или станцию" />
          {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить"><X size={15} /></button>}
        </div>
        <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} className={inputCls + " cursor-pointer sm:w-44"} aria-label="Тип паков">
          <option value="all">Все паки</option>
          <option value="Подборки">По жанрам</option>
          <option value="Страны">По странам</option>
        </select>
      </div>

      {groups.filter((g) => group === "all" || group === g).map((g) => {
        const filtered = PACKS.filter((p) => p.group === g && matches(p));
        if (!filtered.length) return null;
        return (
        <section key={g}>
          <h2 className="mb-3 font-display text-xl font-semibold tracking-tight">{g}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <PackCard key={p.id} p={p} fresh={p.stations.filter((d) => !have.has(d.url!)).length} busy={busy === p.id} onOpen={() => setOpen(p)} onAdd={() => add(p.id, p.stations)} />
            ))}
          </div>
        </section>
      )})}
      {!PACKS.some(matches) && <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Ничего не найдено. Попробуйте жанр или название станции.</div>}
      <p className="text-xs text-muted">
        Фотографии —{" "}
        <a className="underline underline-offset-2" href="https://www.pexels.com" target="_blank" rel="noreferrer">
          Pexels
        </a>
        . Без сети вместо фото показывается цветной фон.
      </p>

      <ListModal
        open={!!open}
        onClose={() => setOpen(null)}
        items={items}
        have={have}
        onPlay={onPlay}
        header={
          open && (
            <div className="relative h-44">
              <Photo pack={open} w={900} h={360} className="absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <h2 className="font-display text-2xl font-bold tracking-tight">{open.title}</h2>
                <p className="mt-1 text-sm text-white/80">{open.desc}</p>
              </div>
            </div>
          )
        }
      />
    </div>
  );
}
