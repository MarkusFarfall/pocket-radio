import { useMemo, useState } from "react";
import { AlertTriangle, ChartColumn, Clock, Flame, Headphones, Hourglass, Wifi } from "lucide-react";
import { streakDays } from "../lib/stats";
import type { Station } from "../lib/types";
import { useEvents, useSessions } from "../lib/hooks";
import { KIND_LABEL, fmtBytes, fmtDuration } from "../lib/templates";
import { Chip, Cover } from "../components/ui";
import { cn } from "../utils/cn";

type Range = 7 | 30 | 0;
type CatDim = "genre" | "mood" | "kind" | "city";

const COLORS = ["#ff5a2c", "#ffb02c", "#2cb67d", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#84cc16"];
const DAY = 86400000;

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function Kpi({ icon: I, label, value, sub, className }: { icon: typeof Clock; label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn("rounded-3xl border border-line bg-surface p-4", className)}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <I size={14} /> {label}
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold tracking-tight md:text-3xl">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-line bg-surface p-5", className)}>
      <h3 className="mb-4 font-display text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

export function Stats({ stations }: { stations: Station[] }) {
  const sessions = useSessions();
  const events = useEvents();
  const [range, setRange] = useState<Range>(7);
  const [dim, setDim] = useState<CatDim>("genre");

  const data = useMemo(() => {
    const now = Date.now();
    const cutoff = range ? now - range * DAY : 0;
    const ss = sessions.filter((s) => s.startedAt >= cutoff);
    const ev = events.filter((e) => e.ts >= cutoff);
    const byId = new Map(stations.map((s) => [s.id, s]));
    const snapshots = new Map<string, Station>();
    ss.forEach((s) => {
      if (byId.has(s.stationId) || snapshots.has(s.stationId) || !s.stationName) return;
      snapshots.set(s.stationId, {
        id: s.stationId,
        name: s.stationName,
        url: "",
        kind: s.kind,
        genre: s.genre,
        mood: s.mood,
        city: s.city ?? "",
        tags: [],
        icon: "",
        logo: s.stationLogo,
        note: "",
        bitrate: s.bitrate ?? 128,
        favorite: false,
        createdAt: s.startedAt,
        updatedAt: s.endedAt,
        plays: 0,
        totalSeconds: s.seconds,
      });
    });
    const stationOf = (id: string) => byId.get(id) ?? snapshots.get(id);

    const total = ss.reduce((a, s) => a + s.seconds, 0);
    const traffic = ss.reduce((a, s) => a + (s.offline ? 0 : (s.seconds * (s.bitrate ?? stationOf(s.stationId)?.bitrate ?? 128) * 1000) / 8), 0);

    // по дням
    const days = range || 30;
    const buckets: { label: string; sec: number; date: Date }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      buckets.push({ label: d.toLocaleDateString("ru", { weekday: "short" }), sec: 0, date: d });
    }
    const idx = new Map(buckets.map((b, i) => [dayKey(b.date.getTime()), i]));
    ss.forEach((s) => {
      const i = idx.get(dayKey(s.startedAt));
      if (i !== undefined) buckets[i].sec += s.seconds;
    });

    // по часам
    const hours = new Array(24).fill(0) as number[];
    ss.forEach((s) => (hours[new Date(s.startedAt).getHours()] += s.seconds));

    // топ станций
    const per = new Map<string, number>();
    ss.forEach((s) => per.set(s.stationId, (per.get(s.stationId) ?? 0) + s.seconds));
    const top = [...per.entries()]
      .map(([id, sec]) => ({ st: stationOf(id), sec }))
      .filter((x): x is { st: Station; sec: number } => !!x.st)
      .sort((a, b) => b.sec - a.sec)
      .slice(0, 6);

    // категории
    const cat = new Map<string, number>();
    ss.forEach((s) => {
      let k = "";
      if (dim === "city") k = s.city ?? stationOf(s.stationId)?.city ?? "";
      else if (dim === "kind") k = KIND_LABEL[s.kind] ?? s.kind;
      else k = s[dim];
      k = k || "Без категории";
      cat.set(k, (cat.get(k) ?? 0) + s.seconds);
    });
    let cats = [...cat.entries()].sort((a, b) => b[1] - a[1]);
    if (cats.length > 7) {
      const rest = cats.slice(7).reduce((a, c) => a + c[1], 0);
      cats = [...cats.slice(0, 7), ["Другое", rest]];
    }

    // проблемы
    const errors = ev.filter((e) => e.type === "error");
    const bufs = ev.filter((e) => e.type === "buffer");
    const bufMs = bufs.reduce((a, e) => a + (e.ms ?? 0), 0);
    const issues = new Map<string, { err: number; buf: number; ms: number; last?: string }>();
    ev.forEach((e) => {
      const r = issues.get(e.stationId) ?? { err: 0, buf: 0, ms: 0 };
      if (e.type === "error") {
        r.err++;
        r.last = e.message;
      } else {
        r.buf++;
        r.ms += e.ms ?? 0;
      }
      issues.set(e.stationId, r);
    });
    const issueList = [...issues.entries()]
      .map(([id, r]) => {
        const eventName = ev.find((e) => e.stationId === id)?.stationName;
        const st =
          stationOf(id) ??
          (eventName
            ? ({ id, name: eventName, url: "", kind: "http", genre: "", mood: "", city: "", tags: [], icon: "", note: "", bitrate: 128, favorite: false, createdAt: 0, updatedAt: 0, plays: 0, totalSeconds: 0 } as Station)
            : undefined);
        return { st, ...r };
      })
      .filter((x): x is typeof x & { st: Station } => !!x.st)
      .sort((a, b) => b.err * 3 + b.buf - (a.err * 3 + a.buf))
      .slice(0, 5);

    return { ss, total, traffic, buckets, hours, top, cats, errors: errors.length, bufs: bufs.length, bufMs, issueList };
  }, [sessions, events, stations, range, dim]);

  const maxDay = Math.max(1, ...data.buckets.map((b) => b.sec));
  const maxHour = Math.max(1, ...data.hours);
  const maxTop = Math.max(1, ...data.top.map((t) => t.sec));
  const catTotal = data.cats.reduce((a, c) => a + c[1], 0) || 1;
  const avg = data.ss.length ? data.total / data.ss.length : 0;
  const streak = useMemo(() => streakDays(sessions), [sessions]);
  // (серия считается по всем сессиям, независимо от выбранного периода)
  const recentSessions = useMemo(() => {
    const byId = new Map(stations.map((s) => [s.id, s]));
    return [...data.ss]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 8)
      .map((s) => ({
        s,
        st:
          byId.get(s.stationId) ??
          (s.stationName
            ? ({ id: s.stationId, name: s.stationName, logo: s.stationLogo, icon: "", genre: s.genre, mood: s.mood, city: s.city ?? "", tags: [], kind: s.kind } as Pick<Station, "id" | "name" | "logo" | "icon" | "genre" | "mood" | "city" | "tags" | "kind">)
            : undefined),
      }));
  }, [data.ss, stations]);
  const bufRatio = data.total ? (data.bufMs / 1000 / data.total) * 100 : 0;

  let offset = 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Статистика</h1>
          <p className="text-sm text-muted">Считается на устройстве и работает офлайн</p>
        </div>
        <div className="flex gap-1.5">
          {([7, 30, 0] as Range[]).map((r) => (
            <Chip key={r} active={range === r} onClick={() => setRange(r)}>
              {r === 7 ? "7 дней" : r === 30 ? "30 дней" : "Всё время"}
            </Chip>
          ))}
        </div>
      </div>

      {data.ss.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line p-12 text-center">
          <ChartColumn size={36} className="mx-auto text-muted" />
          <p className="mt-3 font-display text-lg font-bold">Пока нет данных</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Включите любую станцию хотя бы на несколько секунд — сессии начнут записываться автоматически.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi icon={Clock} label="Время" value={fmtDuration(data.total, true)} sub={`${(data.total / 3600).toFixed(1)} ч в эфире`} />
            <Kpi icon={Headphones} label="Сессии" value={String(data.ss.length)} sub={`${new Set(data.ss.map((s) => s.stationId)).size} источников`} />
            <Kpi icon={Hourglass} label="Средняя сессия" value={fmtDuration(avg, true)} />
            <Kpi icon={Wifi} label="Трафик, оценка" value={fmtBytes(data.traffic)} sub="по битрейту станций" />
            <Kpi icon={Flame} label="Серия" value={`${streak} дн.`} sub={streak >= 2 ? "дней подряд с эфиром" : "слушайте каждый день"} className="col-span-2 lg:col-span-1" />
          </div>

          <Card title="Активность по дням">
            <div className="flex h-36 items-end gap-[3px] sm:gap-1.5">
              {data.buckets.map((b, i) => (
                <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold text-bg group-hover:block">
                    {b.date.toLocaleDateString("ru", { day: "numeric", month: "short" })} · {fmtDuration(b.sec, true)}
                  </div>
                  <div
                    className={cn("w-full rounded-t-md transition-all", b.sec ? "bg-accent" : "bg-surface-2")}
                    style={{ height: b.sec ? `${Math.max(6, (b.sec / maxDay) * 100)}%` : "4px" }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted">
              <span>{data.buckets[0].date.toLocaleDateString("ru", { day: "numeric", month: "short" })}</span>
              <span>сегодня</span>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Что слушали больше всего">
              <div className="space-y-3">
                {data.top.map(({ st, sec }, i) => (
                  <div key={st.id} className="flex items-center gap-3">
                    <span className="w-4 text-center font-mono text-sm font-bold text-muted">{i + 1}</span>
                    <Cover s={st} size={38} className="rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{st.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted">{fmtDuration(sec, true)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(sec / maxTop) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Время по категориям">
              <div className="mb-4 flex flex-wrap gap-1.5">
                {([
                  ["genre", "Жанр"],
                  ["mood", "Настроение"],
                  ["kind", "Тип"],
                  ["city", "Локация"],
                ] as [CatDim, string][]).map(([d, l]) => (
                  <Chip key={d} active={dim === d} onClick={() => setDim(d)} className="!py-1 text-xs">
                    {l}
                  </Chip>
                ))}
              </div>
              <div className="flex items-center gap-5">
                <svg viewBox="0 0 36 36" className="h-32 w-32 shrink-0 -rotate-90">
                  <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="5" className="stroke-surface-2" />
                  {data.cats.map(([k, v], i) => {
                    const len = (v / catTotal) * 100;
                    const el = (
                      <circle
                        key={k}
                        cx="18"
                        cy="18"
                        r="15.9155"
                        fill="none"
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth="5"
                        strokeDasharray={`${Math.max(0, len - 0.8)} ${100 - Math.max(0, len - 0.8)}`}
                        strokeDashoffset={-offset}
                      />
                    );
                    offset += len;
                    return el;
                  })}
                </svg>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {data.cats.map(([k, v], i) => (
                    <li key={k} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate">{k}</span>
                      <span className="font-mono text-xs text-muted">{Math.round((v / catTotal) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Когда вы слушаете">
              <div className="flex h-24 items-end gap-[2px]">
                {data.hours.map((h, i) => (
                  <div key={i} className="flex h-full flex-1 items-end" title={`${i}:00 — ${fmtDuration(h, true)}`}>
                    <div className={cn("w-full rounded-t-sm", h ? "bg-accent" : "bg-surface-2")} style={{ height: h ? `${Math.max(8, (h / maxHour) * 100)}%` : "3px", opacity: h ? 0.35 + (h / maxHour) * 0.65 : 1 }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted">
                <span>0:00</span>
                <span>6:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:00</span>
              </div>
            </Card>

            <Card title="Качество потока">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-surface-2 p-3">
                  <div className={cn("font-display text-2xl font-extrabold", data.errors && "text-bad")}>{data.errors}</div>
                  <div className="text-[11px] text-muted">ошибок</div>
                </div>
                <div className="rounded-2xl bg-surface-2 p-3">
                  <div className="font-display text-2xl font-extrabold">{data.bufs}</div>
                  <div className="text-[11px] text-muted">буферизаций</div>
                </div>
                <div className="rounded-2xl bg-surface-2 p-3">
                  <div className="font-display text-2xl font-extrabold">{bufRatio.toFixed(1)}%</div>
                  <div className="text-[11px] text-muted">времени в буфере</div>
                </div>
              </div>
              {data.issueList.length > 0 ? (
                <ul className="mt-4 space-y-2.5">
                  {data.issueList.map((x) => (
                    <li key={x.st.id} className="flex items-start gap-2.5 text-sm">
                      <AlertTriangle size={16} className={cn("mt-0.5 shrink-0", x.err ? "text-bad" : "text-amber-500")} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{x.st.name}</div>
                        <div className="truncate text-xs text-muted">
                          {x.err > 0 && `${x.err} ошиб. `}
                          {x.buf > 0 && `${x.buf} буфер. (${(x.ms / 1000).toFixed(1)} с)`}
                          {x.last && ` · ${x.last}`}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-ok">Проблем с потоками не зафиксировано ✓</p>
              )}
            </Card>
          </div>

          <Card title="Последние сессии">
            <ul className="divide-y divide-line">
              {recentSessions.map(({ s, st }) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  {st ? <Cover s={st} size={38} className="rounded-lg" /> : <div className="h-[38px] w-[38px] rounded-lg bg-surface-2" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{st?.name ?? "Станция из обзора"}</div>
                    <div className="truncate text-xs text-muted">
                      {new Date(s.startedAt).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {KIND_LABEL[s.kind]}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-muted">{fmtDuration(s.seconds, true)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
