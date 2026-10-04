import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CircleCheck, CircleX, ClipboardPaste, Loader2, Play, QrCode, X } from "lucide-react";
import { probeStream, type ProbeResult } from "../lib/probe";
import type { Draft, Station, StreamKind } from "../lib/types";
import {
  GENRES,
  MOODS,
  TEMPLATES,
  guessKind,
  mixedContentRisk,
  normalizeUrl,
  parseShare,
  validUrl,
} from "../lib/templates";
import { saveStation } from "../lib/db";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";
import { Cover, Field, Modal, btnGhost, btnPrimary, inputCls } from "./ui";
import { GLYPHS, GLYPH_KEYS } from "../lib/glyphs";
import { KindIcon } from "./kind";

interface Props {
  open: boolean;
  editing: Station | null;
  draft: Draft | null;
  stations: Station[];
  onClose: () => void;
  onSaved: (s: Station, play: boolean) => void;
  onScan: () => void;
}

export function StationForm({ open, editing, draft, stations, onClose, onSaved, onScan }: Props) {
  const [kind, setKind] = useState<StreamKind>("http");
  const [kindPicked, setKindPicked] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [city, setCity] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [icon, setIcon] = useState("");
  const [note, setNote] = useState("");
  const [bitrate, setBitrate] = useState(128);
  const [tried, setTried] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | "busy" | null>(null);

  useEffect(() => {
    if (!open) return;
    setProbe(null);
    const src: Draft = editing ?? draft ?? {};
    const k = src.kind ?? (src.url ? guessKind(normalizeUrl(src.url)) : "http");
    setKind(k);
    setKindPicked(!!editing || !!src.kind);
    setName(src.name ?? "");
    setUrl(src.url ?? "");
    setGenre(src.genre ?? "");
    setMood(src.mood ?? "");
    setCity(src.city ?? "");
    setTags(src.tags ?? []);
    setTagInput("");
    setIcon(src.icon?.startsWith("g:") ? src.icon : "");
    setNote(src.note ?? "");
    setBitrate(src.bitrate ?? TEMPLATES.find((t) => t.kind === k)?.bitrate ?? 128);
    setTried(false);
  }, [open, editing, draft]);

  const tpl = TEMPLATES.find((t) => t.kind === kind)!;
  const urlOk = validUrl(url);
  const norm = urlOk ? normalizeUrl(url) : "";
  const dup = useMemo(() => (norm ? stations.find((s) => s.url === norm && s.id !== editing?.id) : undefined), [norm, stations, editing]);
  const mixed = urlOk && mixedContentRisk(norm);

  const pickKind = (k: StreamKind) => {
    setKind(k);
    setKindPicked(true);
    setBitrate(TEMPLATES.find((t) => t.kind === k)!.bitrate);
  };

  const runProbe = async () => {
    setProbe("busy");
    setProbe(await probeStream(norm, kind));
  };

  const onUrl = (v: string) => {
    setUrl(v);
    setProbe(null);
    if (!kindPicked && validUrl(v)) {
      const g = guessKind(normalizeUrl(v));
      if (g !== kind) {
        setKind(g);
        setBitrate(TEMPLATES.find((t) => t.kind === g)!.bitrate);
      }
    }
  };

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "");
    if (t && !tags.includes(t) && tags.length < 12) setTags([...tags, t]);
    setTagInput("");
  };

  const pasteLink = async () => {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = window.prompt("Вставьте ссылку на станцию или поток") ?? "";
    }
    const d = text ? parseShare(text) : null;
    if (!d) return toast("В буфере нет ссылки на станцию или поток", "error");
    const k = d.kind ?? guessKind(normalizeUrl(d.url ?? ""));
    setKind(k);
    setKindPicked(!!d.kind);
    setUrl(d.url ?? "");
    if (d.name) setName(d.name);
    if (d.genre) setGenre(d.genre);
    if (d.mood) setMood(d.mood);
    if (d.city) setCity(d.city);
    if (d.tags) setTags(d.tags);
    if (d.icon) setIcon(d.icon);
    if (d.note) setNote(d.note);
    setBitrate(d.bitrate ?? TEMPLATES.find((t) => t.kind === k)!.bitrate);
    toast("Данные подставлены из ссылки", "ok");
  };

  const submit = async (play: boolean) => {
    setTried(true);
    if (!urlOk) return;
    const pending = tagInput.trim().replace(/^#/, "");
    const finalTags = pending && !tags.includes(pending) ? [...tags, pending] : tags;
    const s = await saveStation({ name, url: norm, kind, genre, mood, city, tags: finalTags, icon, note, bitrate, logo: editing?.logo ?? draft?.logo }, editing ?? undefined);
    toast(editing ? "Станция обновлена" : `«${s.name}» добавлена`, "ok");
    onSaved(s, play);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Редактировать станцию" : "Новая станция"}
      footer={
        <div className="flex gap-2">
          <button className={btnGhost} onClick={onClose}>
            Отмена
          </button>
          <button className={cn(btnGhost, "ml-auto")} onClick={() => submit(false)}>
            Сохранить
          </button>
          {!editing && (
            <button className={btnPrimary} onClick={() => submit(true)}>
              <Play size={16} className="fill-current" /> Слушать
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5 p-5">
        {!editing && (
          <div className="grid grid-cols-2 gap-2">
            <button className={btnGhost} onClick={onScan}>
              <QrCode size={16} /> Сканировать QR
            </button>
            <button className={btnGhost} onClick={pasteLink}>
              <ClipboardPaste size={16} /> Вставить ссылку
            </button>
          </div>
        )}

        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">Шаблон потока</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.kind}
                onClick={() => pickKind(t.kind)}
                className={cn(
                  "rounded-2xl border p-3 text-left transition",
                  kind === t.kind ? "border-accent bg-accent/10" : "border-line bg-bg hover:bg-surface-2"
                )}
              >
                <KindIcon kind={t.kind} size={18} className={kind === t.kind ? "text-accent" : "text-muted"} />
                <div className="mt-1.5 text-sm font-bold leading-tight">{t.label}</div>
                <div className="text-[11px] leading-tight text-muted">{t.short}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{tpl.hint}</p>
        </div>

        <Field label="Адрес потока *">
          <input
            className={cn(inputCls, tried && !urlOk && "border-bad ring-2 ring-bad/20")}
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder={tpl.placeholder}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        {tried && !urlOk && <p className="-mt-3 text-xs font-medium text-bad">Введите корректный http(s)-адрес</p>}
        {urlOk && kind !== "vod" && (
          <div className="-mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={runProbe} disabled={probe === "busy"} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold transition hover:brightness-95 disabled:opacity-60">
              {probe === "busy" ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />} Проверить поток
            </button>
            {probe && probe !== "busy" && (
              <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", probe.ok ? "text-ok" : "text-bad")}>
                {probe.ok ? <CircleCheck size={14} /> : <CircleX size={14} />}
                {probe.message} · {probe.ms} мс
              </span>
            )}
          </div>
        )}
        {dup && (
          <p className="-mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle size={14} /> Такой адрес уже есть: «{dup.name}»
          </p>
        )}
        {mixed && (
          <div className="-mt-2 flex gap-2.5 rounded-2xl bg-amber-500/12 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Приложение открыто по https, а поток по http — браузер может его заблокировать. Используйте https-адрес потока.
            </span>
          </div>
        )}

        <Field label="Название">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, «Ночной джаз»" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Жанр">
            <input className={inputCls} list="dl-genres" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Выберите или впишите" />
          </Field>
          <Field label="Настроение">
            <input className={inputCls} list="dl-moods" value={mood} onChange={(e) => setMood(e.target.value)} placeholder="Выберите или впишите" />
          </Field>
        </div>
        <datalist id="dl-genres">{GENRES.map((g) => <option key={g} value={g} />)}</datalist>
        <datalist id="dl-moods">{MOODS.map((g) => <option key={g} value={g} />)}</datalist>

        <Field label="Город / локация">
          <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Москва, Берлин, Дом…" />
        </Field>

        <Field label="Теги" hint="Enter или запятая — добавить тег">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-bg p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2.5 pr-1.5 text-sm">
                #{t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))} className="rounded-full p-0.5 text-muted hover:text-ink" aria-label={`Удалить тег ${t}`}>
                  <X size={13} />
                </button>
              </span>
            ))}
            <input
              className="min-w-[100px] flex-1 bg-transparent px-1.5 py-1 text-[15px] outline-none placeholder:text-muted/60"
              value={tagInput}
              placeholder={tags.length ? "" : "lofi, утро, дорога"}
              onChange={(e) => {
                const v = e.target.value;
                if (v.includes(",")) v.split(",").forEach((p, i, a) => i < a.length - 1 && addTag(p)), setTagInput(v.split(",").pop() ?? "");
                else setTagInput(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === "Backspace" && !tagInput && tags.length) setTags(tags.slice(0, -1));
              }}
              onBlur={() => tagInput && addTag(tagInput)}
            />
          </div>
        </Field>

        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">Значок обложки</span>
          <div className="flex flex-wrap items-center gap-3">
            <Cover s={{ name: name || "Станция", icon, genre, tags, kind, logo: editing?.logo ?? draft?.logo }} size={56} className="rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setIcon("")}
                className={cn("h-9 rounded-lg px-3 text-xs font-semibold transition", icon === "" ? "bg-ink text-bg" : "bg-bg text-muted ring-1 ring-line hover:text-ink")}
              >
                Авто
              </button>
              {GLYPH_KEYS.map((k) => {
                const G = GLYPHS[k].icon;
                const on = icon === `g:${k}`;
                return (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setIcon(`g:${k}`)}
                    title={GLYPHS[k].label}
                    aria-label={GLYPHS[k].label}
                    className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition", on ? "bg-accent text-accent-ink" : "bg-bg text-muted ring-1 ring-line hover:text-ink")}
                  >
                    <G size={17} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Заметка">
            <textarea className={cn(inputCls, "min-h-[84px] resize-y")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что здесь играет, когда слушать…" />
          </Field>
          <Field label="Битрейт, кбит/с" hint="Для оценки трафика">
            <input className={inputCls} type="number" min={16} max={1411} value={bitrate} onChange={(e) => setBitrate(Number(e.target.value) || 128)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
