import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Loader2, MapPin, Plus, RefreshCw, Search as SearchIcon, SlidersHorizontal, ThumbsUp, WifiOff, X } from "lucide-react";
import type { Station } from "../../lib/types";
import type { ViewProps } from "../shared";
import { addMany, draftToStation } from "../../lib/db";
import {
  countryName,
  loadCountries,
  loadLanguages,
  loadTags,
  registerClick,
  searchStations,
  userRegion,
  type CountryInfo,
  type Found,
  type LangInfo,
  type Order,
  type TagInfo,
} from "../../lib/radiobrowser";
import { gardenSearch, somaChannels } from "../../lib/sources";
import { player } from "../../lib/player";
import { toast } from "../../lib/toast";
import { cn } from "../../utils/cn";
import { Chip, btnGhost, btnPrimary, inputCls } from "../../components/ui";
import { KindIcon } from "../../components/kind";
import { StationItem } from "../../components/StationItem";

type Source = "rb" | "soma" | "garden";
const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "rb", label: "Radio Browser", hint: "Общий каталог: десятки тысяч станций со всего мира" },
  { id: "soma", label: "SomaFM", hint: "Независимое радио из Сан-Франциско — актуальный список каналов с числом слушателей" },
  { id: "garden", label: "Radio Garden", hint: "Поиск по названию в каталоге radio.garden" },
];

const QUICK_TAGS = ["jazz", "lofi", "ambient", "classical", "rock", "electronic", "pop", "indie", "80s", "90s", "news", "talk", "hip hop", "metal", "reggae", "chillout", "dance", "podcast"];
const GARDEN_IDEAS = ["jazz", "bbc", "radio one", "classic", "chill", "rock", "news", "love", "lounge", "ibiza"];
const PAGE = 30;

function fmtNum(n: number) {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function Search({ have, online, onPlay }: { have: Set<string>; online: boolean; onPlay: ViewProps["onPlay"] }) {
  const [source, setSource] = useState<Source>("rb");
  const [q, setQ] = useState(() => localStorage.getItem("radio.searchQ") ?? "");
  const [dq, setDq] = useState(() => (localStorage.getItem("radio.searchQ") ?? "").trim());
  const [tag, setTag] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [codec, setCodec] = useState("");
  const [minBr, setMinBr] = useState(0);
  const [order, setOrder] = useState<Order>("clickcount");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [items, setItems] = useState<Found[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [countries, setCountries] = useState<CountryInfo[]>([]);
  const [languages, setLanguages] = useState<LangInfo[]>([]);
  const [nonce, setNonce] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const region = useMemo(() => userRegion(), []);

  useEffect(() => {
    localStorage.removeItem("radio.searchQ");
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!online) return;
    loadTags().then(setTags).catch(() => {});
    loadCountries().then(setCountries).catch(() => {});
    loadLanguages().then(setLanguages).catch(() => {});
  }, [online]);

  // при смене источника сбрасываем фильтры, которые в нём не работают
  useEffect(() => {
    setTag("");
    if (source !== "rb") {
      setCountry("");
      setLanguage("");
      setCodec("");
      setMinBr(0);
    }
  }, [source]);

  const run = useCallback(
    async (offset: number) => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      setLoading(true);
      setError(null);
      try {
        let r: Found[] = [];
        let paged = false;
        if (source === "rb") {
          r = await searchStations({
            name: dq || undefined,
            tag: tag || undefined,
            country: country || undefined,
            language: language || undefined,
            codec: codec || undefined,
            bitrateMin: minBr || undefined,
            order,
            limit: PAGE,
            offset,
            signal: c.signal,
          });
          paged = true;
        } else if (source === "soma") {
          r = await somaChannels();
        } else if (dq) {
          r = await gardenSearch(dq, c.signal);
        }
        setItems((prev) => (offset ? [...prev, ...r.filter((x) => !prev.some((p) => p.url === x.url))] : r));
        setMore(paged && r.length >= PAGE - 3);
      } catch (e) {
        if (c.signal.aborted) return;
        const msg = e instanceof Error ? e.message : "Не удалось загрузить";
        setError(source === "garden" && /fetch|network/i.test(msg) ? "Radio Garden не отвечает из браузера (сервер может не разрешать запросы с других сайтов). Попробуйте Radio Browser." : msg);
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    },
    [source, dq, tag, country, language, codec, minBr, order]
  );

  useEffect(() => {
    if (!online) return;
    setItems([]);
    void run(0);
    return () => ctl.current?.abort();
  }, [run, online, nonce]);

  // SomaFM отдаёт весь список разом — фильтруем у себя
  const rows = useMemo(() => {
    if (source !== "soma") return items;
    const n = dq.toLowerCase();
    return items.filter((f) => (!n || `${f.name} ${f.note} ${(f.tags ?? []).join(" ")}`.toLowerCase().includes(n)) && (!tag || (f.tags ?? []).includes(tag)));
  }, [items, source, dq, tag]);

  const stations = useMemo(() => rows.map((f) => draftToStation(f)), [rows]);
  useEffect(() => {
    player.setEphemeral(stations);
  }, [stations]);

  const chips = useMemo(() => {
    if (source === "soma") {
      const m = new Map<string, number>();
      items.forEach((f) => (f.tags ?? []).slice(1).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map((x) => x[0]);
    }
    if (source === "garden") return GARDEN_IDEAS;
    const fromApi = tags.slice(0, 40).map((t) => t.name);
    return (fromApi.length ? [...QUICK_TAGS, ...fromApi.filter((t) => !QUICK_TAGS.includes(t))] : QUICK_TAGS).slice(0, 48);
  }, [source, items, tags]);

  const addOne = async (s: Station, f: Found) => {
    await addMany([{ ...s }]);
    registerClick(f.id);
    toast(`«${s.name}» добавлена`, "ok");
  };
  const fresh = stations.filter((s) => !have.has(s.url));
  const addAll = async () => {
    const n = await addMany(fresh.map((s) => ({ ...s })));
    toast(n ? `Добавлено станций: ${n}` : "Всё уже в каталоге", "ok");
  };

  const activeFilters = [country && countryName(country), language && (languages.find((l) => l.value === language)?.label ?? language), codec, minBr ? `${minBr}+ кбит/с` : ""].filter(Boolean) as string[];
  const resetFilters = () => {
    setCountry("");
    setLanguage("");
    setCodec("");
    setMinBr(0);
  };

  if (!online)
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center">
        <WifiOff size={32} className="mx-auto text-muted" />
        <p className="mt-3 font-display text-lg font-semibold">Поиск недоступен без сети</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Готовые паки, шаблоны и ваш каталог работают офлайн.</p>
      </div>
    );

  const hint = SOURCES.find((s) => s.id === source)!.hint;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <select value={source} onChange={(e) => setSource(e.target.value as Source)} className={inputCls + " cursor-pointer md:hidden"} aria-label="Источник каталога">
          {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div className="hidden grid-cols-3 gap-2 md:grid">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={cn("rounded-xl border p-3 text-left transition", source === s.id ? "border-accent bg-accent/10" : "border-line hover:border-ink/30")}
            >
              <span className="block text-sm font-semibold">{s.label}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted">{s.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{hint}</p>

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              data-search
              className={cn(inputCls, "pl-10")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={source === "garden" ? "Название станции или города" : "Название станции: jazz, Europa, BBC…"}
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить">
                <X size={16} />
              </button>
            )}
          </div>
          {source === "rb" && (
            <button onClick={() => setFiltersOpen((o) => !o)} className={cn(btnGhost, "relative !px-3.5", filtersOpen && "!border-accent !text-accent")} aria-expanded={filtersOpen}>
              <SlidersHorizontal size={17} />
              <span className="hidden sm:inline">Фильтры</span>
              {activeFilters.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-ink">{activeFilters.length}</span>}
            </button>
          )}
        </div>

        {source === "rb" && filtersOpen && (
          <div className="anim-fade grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={cn(inputCls, "cursor-pointer")} aria-label="Страна">
              <option value="">Все страны</option>
              {region && countries.some((c) => c.code === region) && <option value={region}>★ Моя страна — {countryName(region)}</option>}
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={cn(inputCls, "cursor-pointer")} aria-label="Язык">
              <option value="">Любой язык</option>
              {languages.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <select value={codec} onChange={(e) => setCodec(e.target.value)} className={cn(inputCls, "cursor-pointer")} aria-label="Формат">
              <option value="">Любой формат</option>
              <option value="MP3">MP3</option>
              <option value="AAC">AAC</option>
              <option value="AAC+">AAC+</option>
              <option value="OGG">OGG</option>
            </select>
            <select value={minBr} onChange={(e) => setMinBr(Number(e.target.value))} className={cn(inputCls, "cursor-pointer")} aria-label="Минимальный битрейт">
              <option value={0}>Любой битрейт</option>
              <option value={64}>от 64 кбит/с</option>
              <option value={128}>от 128 кбит/с</option>
              <option value={192}>от 192 кбит/с</option>
              <option value={256}>от 256 кбит/с</option>
            </select>
            <select value={order} onChange={(e) => setOrder(e.target.value as Order)} className={cn(inputCls, "cursor-pointer")} aria-label="Сортировка">
              <option value="clickcount">Популярные</option>
              <option value="clicktrend">В тренде</option>
              <option value="votes">По голосам</option>
              <option value="changetimestamp">Недавно обновлены</option>
              <option value="random">Случайные</option>
            </select>
          </div>
        )}

        {source === "rb" && (activeFilters.length > 0 || (region && !country && countries.some((c) => c.code === region))) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {activeFilters.map((f) => (
              <span key={f} className="rounded-md bg-accent/12 px-2 py-1 font-semibold text-accent">
                {f}
              </span>
            ))}
            {activeFilters.length > 0 && (
              <button onClick={resetFilters} className="font-semibold text-muted underline underline-offset-2">
                сбросить
              </button>
            )}
            {region && !country && countries.some((c) => c.code === region) && (
              <button onClick={() => setCountry(region)} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-semibold transition hover:text-accent">
                <MapPin size={12} /> Станции моей страны ({countryName(region)})
              </button>
            )}
          </div>
        )}

        <label className="block md:hidden">
          <select
            value={source === "garden" ? (GARDEN_IDEAS.includes(dq) ? dq : "") : tag}
            onChange={(e) => source === "garden" ? setQ(e.target.value) : setTag(e.target.value)}
            className={inputCls + " cursor-pointer !py-2"}
            aria-label="Жанр или тема"
          >
            <option value="">{source === "soma" ? "Все каналы" : source === "garden" ? "Любая тема" : "Все жанры"}</option>
            {chips.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="no-scrollbar hidden gap-1.5 overflow-x-auto pb-0.5 md:flex">
          {source !== "garden" && (
            <Chip active={!tag} onClick={() => setTag("")}>
              {source === "soma" ? "Все каналы" : "Все жанры"}
            </Chip>
          )}
          {chips.map((t) => (
            <Chip
              key={t}
              active={source === "garden" ? dq === t : tag === t}
              onClick={() => {
                if (source === "garden") setQ(dq === t ? "" : t);
                else setTag(tag === t ? "" : t);
              }}
            >
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{loading && !items.length ? "Ищем…" : `Найдено: ${stations.length}`}</p>
        <div className="flex gap-2">
          <button className={btnGhost + " !px-3 !py-2"} onClick={() => setNonce((n) => n + 1)} aria-label="Обновить">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          {fresh.length > 0 && (
            <button className={btnPrimary + " !px-3.5 !py-2"} onClick={addAll}>
              <Plus size={16} /> Добавить все ({fresh.length})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-bad/10 p-4 text-sm text-bad">
          <span className="flex-1">{error}</span>
          <button onClick={() => setNonce((n) => n + 1)} className="shrink-0 font-semibold underline">
            Повторить
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-1.5">
        {loading &&
          !items.length &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 p-2">
              <div className="h-[46px] w-[46px] rounded-lg bg-surface-2" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/2 rounded bg-surface-2" />
                <div className="h-3 w-1/3 rounded bg-surface-2" />
              </div>
            </div>
          ))}
        {stations.map((s, i) => {
          const f = rows[i];
          return (
            <StationItem
              key={s.id}
              st={s}
              sub={source === "soma" ? f.note || s.genre : [s.genre, s.city, f.codec && `${f.codec}${s.bitrate ? " " + s.bitrate + "k" : ""}`].filter(Boolean).join(" · ")}
              inLib={have.has(s.url)}
              onPlay={() => onPlay(s, stations.map((x) => x.id))}
              onAdd={() => addOne(s, f)}
              extra={
                f.votes > 0 ? (
                  <span className="hidden shrink-0 items-center gap-1 text-xs text-muted sm:inline-flex" title={f.unit === "listeners" ? "Слушателей сейчас" : "Голосов"}>
                    <KindIcon kind={s.kind} size={12} />
                    {f.unit === "listeners" ? <Headphones size={12} /> : <ThumbsUp size={12} />} {fmtNum(f.votes)}
                  </span>
                ) : undefined
              }
            />
          );
        })}
        {!loading && !error && stations.length === 0 && (
          <div className="p-10 text-center text-sm text-muted">{source === "garden" && !dq ? "Введите название станции или выберите тему выше." : "Ничего не найдено. Попробуйте другой запрос или сбросьте фильтры."}</div>
        )}
      </div>

      {more && stations.length > 0 && (
        <div className="text-center">
          <button className={btnGhost} disabled={loading} onClick={() => run(items.length)}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null} Показать ещё
          </button>
        </div>
      )}
    </div>
  );
}
