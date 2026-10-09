import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Flame,
  Headphones,
  Info,
  Music2,
  Radio,
  Signal,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEvents, useSessions } from "../lib/hooks";
import { addCalendarDays, dayStart, MIN_ACTIVE_DAY_SECONDS, secondsByLocalDay, secondsInRange, streakDays } from "../lib/stats";
import { fmtBytes, fmtDuration, KIND_LABEL } from "../lib/templates";
import type { PlayEvent, Session, Station } from "../lib/types";

type Period = 7 | 30 | 0;
type Breakdown = "genre" | "mood" | "kind" | "city";
type StationAggregate = { id: string; name: string; seconds: number; sessions: number; genre: string };
type CategoryAggregate = { label: string; seconds: number };
type DayPoint = { day: number; seconds: number };
type HourPoint = { hour: number; count: number };
type EventAggregate = { id: string; name: string; errors: number; buffers: number; bufferMs: number; latestAt: number };

const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "7 дней" },
  { value: 30, label: "30 дней" },
  { value: 0, label: "Всё время" },
];

const BREAKDOWNS: { value: Breakdown; label: string }[] = [
  { value: "genre", label: "Жанры" },
  { value: "mood", label: "Настроение" },
  { value: "kind", label: "Тип" },
  { value: "city", label: "Город" },
];

function Panel({ title, subtitle, action, children, className = "" }: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-3xl border border-line bg-surface p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-xs leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({ icon: Icon, label, value, detail }: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Icon size={15} className="shrink-0 text-accent" />
        <span>{label}</span>
      </div>
      <div className="mt-2 truncate font-display text-2xl font-bold tracking-tight" title={value}>{value}</div>
      <div className="mt-1 truncate text-xs text-muted" title={detail}>{detail}</div>
    </div>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(value)) % 100;
  if (n >= 11 && n <= 14) return many;
  switch (n % 10) {
    case 1: return one;
    case 2:
    case 3:
    case 4: return few;
    default: return many;
  }
}

function percent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.round(value)}%`;
}

function dayLabel(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(ts).replace(" г.", "");
}

function shortDay(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric" }).format(ts);
}

function formatClock(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ts);
}

function timeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return "Утро";
  if (hour >= 12 && hour < 17) return "День";
  if (hour >= 17 && hour < 22) return "Вечер";
  return "Ночь";
}

function getSnapshotValue(session: Session, key: Breakdown, currentStation?: Station): string {
  if (key === "kind") return KIND_LABEL[session.kind] ?? session.kind;
  const snap = session[key];
  const fallback = currentStation?.[key];
  return (typeof snap === "string" && snap.trim() ? snap : typeof fallback === "string" ? fallback : "").trim();
}

function makeStationIndex(stations: Station[] | undefined, sessions: Session[]): Map<string, Station> {
  const index = new Map((stations ?? []).map((station) => [station.id, station]));
  for (const session of sessions) {
    if (index.has(session.stationId)) continue;
    index.set(session.stationId, {
      id: session.stationId,
      name: session.stationName || "Станция удалена",
      url: "",
      kind: session.kind,
      genre: session.genre,
      mood: session.mood,
      city: session.city || "",
      tags: [],
      icon: "",
      note: "",
      bitrate: session.bitrate ?? 0,
      favorite: false,
      createdAt: session.startedAt,
      updatedAt: session.endedAt,
      plays: 0,
      totalSeconds: 0,
      logo: session.stationLogo,
    });
  }
  return index;
}

function buildCategoryBreakdown(
  sessions: Session[],
  stations: Map<string, Station>,
  from: number,
  to: number,
  dimension: Breakdown,
): { items: CategoryAggregate[]; missingSeconds: number } {
  const totals = new Map<string, number>();
  let missingSeconds = 0;
  for (const session of sessions) {
    const seconds = secondsInRange(session, from, to);
    if (!seconds) continue;
    const label = getSnapshotValue(session, dimension, stations.get(session.stationId));
    if (!label) {
      missingSeconds += seconds;
      continue;
    }
    totals.set(label, (totals.get(label) ?? 0) + seconds);
  }
  const sorted = [...totals].map(([label, seconds]) => ({ label, seconds })).sort((a, b) => b.seconds - a.seconds);
  if (sorted.length <= 6) return { items: sorted, missingSeconds };
  const visible = sorted.slice(0, 5);
  visible.push({ label: "Другие", seconds: sorted.slice(5).reduce((sum, item) => sum + item.seconds, 0) });
  return { items: visible, missingSeconds };
}

function buildHourlyStarts(sessions: Session[], from: number, to: number): HourPoint[] {
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const session of sessions) {
    if (session.startedAt < from || session.startedAt >= to) continue;
    counts[new Date(session.startedAt).getHours()].count++;
  }
  return counts;
}

function buildEventStats(events: PlayEvent[], stations: Map<string, Station>, from: number, to: number): EventAggregate[] {
  const aggregate = new Map<string, EventAggregate>();
  for (const event of events) {
    if (event.ts < from || event.ts >= to) continue;
    const item = aggregate.get(event.stationId) ?? {
      id: event.stationId,
      name: event.stationName || stations.get(event.stationId)?.name || "Станция удалена",
      errors: 0,
      buffers: 0,
      bufferMs: 0,
      latestAt: 0,
    };
    if (event.type === "error") item.errors++;
    if (event.type === "buffer") {
      item.buffers++;
      item.bufferMs += Math.max(0, event.ms ?? 0);
    }
    item.latestAt = Math.max(item.latestAt, event.ts);
    if (event.stationName) item.name = event.stationName;
    aggregate.set(event.stationId, item);
  }
  return [...aggregate.values()].sort((a, b) => (b.errors - a.errors) || (b.bufferMs - a.bufferMs) || (b.latestAt - a.latestAt));
}

export function Stats({ stations }: { stations: Station[] }) {
  const sessions = useSessions();
  const events = useEvents();
  const [period, setPeriod] = useState<Period>(7);
  const [breakdown, setBreakdown] = useState<Breakdown>("genre");
  const now = Date.now();

  const data = useMemo(() => {
    const today = dayStart(now);
    const from = period === 0 ? -Infinity : addCalendarDays(today, -(period - 1));
    const previousFrom = period === 0 ? -Infinity : addCalendarDays(from, -period);
    const activeSessions = sessions.filter((session) => secondsInRange(session, from, now) > 0);
    const totalSeconds = activeSessions.reduce((sum, session) => sum + secondsInRange(session, from, now), 0);
    const previousSeconds = period === 0
      ? 0
      : sessions.reduce((sum, session) => sum + secondsInRange(session, previousFrom, from), 0);
    const daily = secondsByLocalDay(sessions, from, now);
    const activeDays = [...daily.values()].filter((seconds) => seconds >= MIN_ACTIVE_DAY_SECONDS).length;
    const bestDay = [...daily.entries()].reduce<DayPoint>((best, [day, seconds]) => seconds > best.seconds ? { day, seconds } : best, { day: today, seconds: 0 });

    const chartDays = period || 30;
    const chartFrom = period === 0 ? addCalendarDays(today, -(chartDays - 1)) : from;
    const dailyChart: DayPoint[] = Array.from({ length: chartDays }, (_, index) => {
      const day = addCalendarDays(chartFrom, index);
      return { day, seconds: sessions.reduce((sum, session) => sum + secondsInRange(session, day, Math.min(addCalendarDays(day, 1), now)), 0) };
    });

    const stationIndex = makeStationIndex(stations, sessions);
    const stationTotals = new Map<string, StationAggregate>();
    for (const session of activeSessions) {
      const station = stationIndex.get(session.stationId);
      const seconds = secondsInRange(session, from, now);
      if (!seconds) continue;
      const existing = stationTotals.get(session.stationId) ?? {
        id: session.stationId,
        name: station?.name || session.stationName || "Станция удалена",
        seconds: 0,
        sessions: 0,
        genre: session.genre || station?.genre || "",
      };
      existing.seconds += seconds;
      existing.sessions++;
      stationTotals.set(session.stationId, existing);
    }
    const topStations = [...stationTotals.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
    const categories = buildCategoryBreakdown(sessions, stationIndex, from, now, breakdown);
    const trafficBytes = activeSessions.reduce((sum, session) => {
      if (session.offline) return sum;
      const stationBitrate = stationIndex.get(session.stationId)?.bitrate;
      const bitrate = session.bitrate && session.bitrate > 0 ? session.bitrate : stationBitrate && stationBitrate > 0 ? stationBitrate : 128;
      return sum + secondsInRange(session, from, now) * bitrate * 1000 / 8;
    }, 0);

    const offlineSeconds = activeSessions.reduce((sum, session) => sum + (session.offline ? secondsInRange(session, from, now) : 0), 0);
    const starts = activeSessions.filter((session) => session.startedAt >= from && session.startedAt <= now);
    const hourly = buildHourlyStarts(starts, from, now + 1);
    const peakHour = hourly.reduce((best, item) => item.count > best.count ? item : best, hourly[0]);
    const eventsInPeriod = buildEventStats(events, stationIndex, from, now + 1);
    const totalErrors = eventsInPeriod.reduce((sum, item) => sum + item.errors, 0);
    const totalBuffers = eventsInPeriod.reduce((sum, item) => sum + item.buffers, 0);
    const totalBufferMs = eventsInPeriod.reduce((sum, item) => sum + item.bufferMs, 0);
    const recent = [...activeSessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 7);

    return {
      from,
      totalSeconds,
      previousSeconds,
      activeDays,
      stationCount: stationTotals.size,
      sessionCount: activeSessions.length,
      averageSessionSeconds: activeSessions.length ? totalSeconds / activeSessions.length : 0,
      trafficBytes,
      offlineSeconds,
      offlinePercent: totalSeconds ? offlineSeconds / totalSeconds * 100 : 0,
      dailyChart,
      topStations,
      categories: categories.items,
      missingCategorySeconds: categories.missingSeconds,
      hourly,
      peakHour,
      totalErrors,
      totalBuffers,
      totalBufferMs,
      eventStations: eventsInPeriod.slice(0, 4),
      recent,
      streak: streakDays(sessions, now),
      bestDay,
      chartBestDay: dailyChart.reduce<DayPoint>((best, item) => item.seconds > best.seconds ? item : best, { day: chartFrom, seconds: 0 }),
    };
  }, [sessions, events, stations, period, breakdown, now]);

  const maxDaySeconds = Math.max(1, ...data.dailyChart.map((point) => point.seconds));
  const maxHourStarts = Math.max(1, ...data.hourly.map((point) => point.count));
  const maxStationSeconds = Math.max(1, ...data.topStations.map((item) => item.seconds));
  const currentVsPrevious = data.previousSeconds > 0
    ? (data.totalSeconds - data.previousSeconds) / data.previousSeconds * 100
    : null;
  const periodName = period === 0 ? "за всё время" : `за ${period} дней`;
  const hasListening = data.totalSeconds > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent">
            <Activity size={14} /> Личные данные
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Статистика</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Понятная сводка по локально сохранённым сессиям и событиям проигрывателя.</p>
        </div>
        <div className="flex w-full gap-1 rounded-2xl border border-line bg-surface p-1 sm:w-auto" role="group" aria-label="Период статистики">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPeriod(item.value)}
              aria-pressed={period === item.value}
              className={`min-h-10 flex-1 rounded-xl px-3 text-xs font-semibold transition sm:flex-none ${period === item.value ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {hasListening && <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted"><Headphones size={17} className="text-accent" /> Время прослушивания</div>
            <div className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl" data-testid="stats-total-time">
              {fmtDuration(data.totalSeconds, true)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span>{formatCount(data.activeDays)} {pluralRu(data.activeDays, "активный день", "активных дня", "активных дней")}</span>
              <span aria-hidden>·</span>
              <span>{formatCount(data.sessionCount)} {pluralRu(data.sessionCount, "включение", "включения", "включений")}</span>
              <span aria-hidden>·</span>
              <span>{periodName}</span>
            </div>
            <p className="mt-3 text-xs text-muted">
              {currentVsPrevious === null
                ? period === 0 ? "История с начала сохранённых записей" : "Сравнение появится, когда накопится прошлый период"
                : <span className={`inline-flex items-center gap-1 font-semibold ${currentVsPrevious >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {currentVsPrevious >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(currentVsPrevious).toFixed(0)}% к предыдущим {period} дням
                  </span>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-64 sm:grid-cols-1">
            <div className="rounded-2xl bg-surface-2/70 p-3 sm:p-4">
              <div className="flex items-center gap-2 text-xs text-muted"><Flame size={15} className="text-orange-500" /> Текущая серия</div>
              <div className="mt-1 font-display text-2xl font-bold">{data.streak} {pluralRu(data.streak, "день", "дня", "дней")}</div>
              <div className="text-[11px] text-muted">минимум 5 минут в день</div>
            </div>
            <div className="rounded-2xl bg-surface-2/70 p-3 sm:p-4">
              <div className="flex items-center gap-2 text-xs text-muted"><CalendarDays size={15} className="text-accent" /> Лучший день</div>
              <div className="mt-1 font-display text-2xl font-bold">{fmtDuration(data.bestDay?.seconds ?? 0, true)}</div>
              <div className="text-[11px] text-muted">{data.bestDay?.seconds ? dayLabel(data.bestDay.day) : "за выбранный период"}</div>
            </div>
          </div>
        </div>
      </section>}

      {hasListening ? <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard icon={CalendarDays} label="Активные дни" value={formatCount(data.activeDays)} detail="≥5 мин в день" />
          <StatCard icon={Radio} label="Сессии" value={formatCount(data.sessionCount)} detail={`${formatCount(data.stationCount)} ${pluralRu(data.stationCount, "уникальная станция", "уникальные станции", "уникальных станций")}`} />
          <StatCard icon={Clock3} label="Средняя сессия" value={fmtDuration(Math.round(data.averageSessionSeconds / 60) * 60, true)} detail="в выбранном периоде" />
          <StatCard icon={data.offlineSeconds > 0 ? WifiOff : Wifi} label="Офлайн" value={percent(data.offlinePercent)} detail={`${fmtDuration(data.offlineSeconds, true)} без интернета`} />
          <StatCard icon={Activity} label="Трафик · оценка" value={`≈ ${fmtBytes(data.trafficBytes)}`} detail="по битрейту потока" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <Panel title="Прослушивание по дням" subtitle={period === 0 ? "Последние 30 календарных дней" : "Сумма сохранённых секунд по локальным календарным дням"}>
            <div className="flex h-36 items-end gap-1.5 sm:h-44 sm:gap-2" role="img" aria-label="Столбчатая диаграмма времени прослушивания по дням">
              {data.dailyChart.map((point, index) => {
                const height = point.seconds > 0 ? Math.max(5, point.seconds / maxDaySeconds * 100) : 2;
                const showLabel = period === 7 || index === 0 || index === data.dailyChart.length - 1 || index % 5 === 0;
                return (
                  <div key={point.day} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <div className="flex h-full w-full items-end">
                      <div
                        className={`w-full rounded-t-md transition-colors ${point.seconds > 0 ? "bg-accent/80 group-hover:bg-accent" : "bg-surface-2"}`}
                        style={{ height: `${height}%`, minHeight: point.seconds > 0 ? 4 : 2 }}
                        title={`${dayLabel(point.day)}: ${fmtDuration(point.seconds)}`}
                        aria-hidden="true"
                      />
                    </div>
                    <span className={`h-3 text-[9px] text-muted sm:text-[10px] ${showLabel ? "visible" : "invisible"}`}>{shortDay(point.day)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
              <span>{data.dailyChart.length ? dayLabel(data.dailyChart[0].day) : ""}</span>
              <span>Максимум: {fmtDuration(data.chartBestDay.seconds, true)}</span>
              <span>{data.dailyChart.length ? dayLabel(data.dailyChart[data.dailyChart.length - 1].day) : ""}</span>
            </div>
          </Panel>

          <Panel
            title="Что слушали"
            subtitle="Доли считаются по секундам прослушивания"
            action={<div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" role="group" aria-label="Разбивка прослушивания">
              {BREAKDOWNS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setBreakdown(item.value)}
                  aria-pressed={breakdown === item.value}
                  className={`shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${breakdown === item.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >{item.label}</button>
              ))}
            </div>}
          >
            {data.categories.length ? <div className="space-y-4">
              {data.categories.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium" title={item.label}>{item.label}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtDuration(item.seconds, true)} · {percent(item.seconds / data.totalSeconds * 100)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, item.seconds / data.totalSeconds * 100)}%` }} />
                  </div>
                </div>
              ))}
              {data.missingCategorySeconds > 0 && <p className="pt-1 text-[11px] leading-relaxed text-muted">Для {percent(data.missingCategorySeconds / data.totalSeconds * 100)} времени не сохранены эти данные.</p>}
            </div> : <EmptyMessage>В записях этого периода пока нет данных для разбивки.</EmptyMessage>}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="В какое время включаете" subtitle="Распределение по часу начала сессии — не по каждому треку">
            <div className="flex h-32 items-end gap-[3px] sm:h-36 sm:gap-1" role="img" aria-label="Начало сессий по часам">
              {data.hourly.map((item) => (
                <div key={item.hour} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex h-full w-full items-end">
                    <div
                      className={`w-full rounded-t-sm ${item.count ? "bg-accent/75 group-hover:bg-accent" : "bg-surface-2"}`}
                      style={{ height: item.count ? `${Math.max(5, item.count / maxHourStarts * 100)}%` : "2px" }}
                      title={`${String(item.hour).padStart(2, "0")}:00 · ${item.count} сессий`}
                      aria-hidden="true"
                    />
                  </div>
                  {item.hour % 4 === 0
                    ? <span className="h-3 text-[9px] text-muted">{String(item.hour).padStart(2, "0")}</span>
                    : <span className="h-3" aria-hidden="true" />}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="flex items-center gap-2 text-muted"><Clock3 size={15} /> Чаще всего</span>
              <span className="font-semibold">{data.peakHour?.count ? `${timeOfDay(data.peakHour.hour)}, ${String(data.peakHour.hour).padStart(2, "0")}:00` : "Недостаточно данных"}</span>
            </div>
          </Panel>

          <Panel title="Любимые станции" subtitle="Ранжирование по времени прослушивания за выбранный период">
            {data.topStations.length ? <div className="space-y-4">
              {data.topStations.map((station, index) => (
                <div key={station.id} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-muted">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-semibold" title={station.name}>{station.name}</span>
                      <span className="shrink-0 text-xs text-muted">{fmtDuration(station.seconds, true)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, station.seconds / maxStationSeconds * 100)}%` }} />
                    </div>
                    <div className="mt-1 text-[10px] text-muted">{formatCount(station.sessions)} {pluralRu(station.sessions, "сессия", "сессии", "сессий")}{station.genre ? ` · ${station.genre}` : ""}</div>
                  </div>
                </div>
              ))}
            </div> : <EmptyMessage>Станции появятся здесь после прослушивания.</EmptyMessage>}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Стабильность воспроизведения" subtitle="Только ошибки и буферизация, которые приложение успело записать">
            {data.totalErrors || data.totalBuffers ? <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-surface-2/70 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted"><AlertTriangle size={14} className="text-amber-500" /> Ошибки</div>
                  <div className="mt-1 font-display text-2xl font-bold">{formatCount(data.totalErrors)}</div>
                </div>
                <div className="rounded-2xl bg-surface-2/70 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted"><Signal size={14} className="text-accent" /> Буферизация</div>
                  <div className="mt-1 font-display text-2xl font-bold">{formatCount(data.totalBuffers)}</div>
                  <div className="text-[11px] text-muted">записано {fmtDuration(data.totalBufferMs / 1000)}</div>
                </div>
              </div>
              {data.eventStations.length > 0 && <div className="mt-4 space-y-2 border-t border-line pt-3">
                {data.eventStations.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="shrink-0 text-muted">{item.errors ? `${item.errors} ${pluralRu(item.errors, "ошибка", "ошибки", "ошибок")}` : ""}{item.errors && item.buffers ? " · " : ""}{item.buffers ? `${item.buffers} ${pluralRu(item.buffers, "буферизация", "буферизации", "буферизаций")}` : ""}</span>
                  </div>
                ))}
              </div>}
            </> : <EmptyMessage>За этот период записанных ошибок и буферизации нет.</EmptyMessage>}
          </Panel>

          <Panel title="Недавние сессии" subtitle="Сохранённые записи, а не история каждого трека">
            {data.recent.length ? <div className="divide-y divide-line">
              {data.recent.slice(0, 5).map((session, index) => {
                const station = stations?.find((item) => item.id === session.stationId);
                const duration = secondsInRange(session, data.from, now);
                return <div key={session.syncId ?? session.id ?? `${session.stationId}-${session.startedAt}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Music2 size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{station?.name || session.stationName || "Станция удалена"}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                      <span>{formatClock(session.startedAt)}</span>
                      {session.offline && <span className="inline-flex items-center gap-1"><WifiOff size={10} /> офлайн</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold">{fmtDuration(duration, true)}</span>
                </div>;
              })}
            </div> : <EmptyMessage>Нет сохранённых сессий в этом периоде.</EmptyMessage>}
          </Panel>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2/40 px-4 py-3 text-xs leading-relaxed text-muted">
          <Info size={15} className="mt-0.5 shrink-0" />
          <p>Сводка вычисляется на этом устройстве. В сессиях хранится общий итог секунд, а не точная шкала воспроизведения: если сессия пересекает полночь или границу периода, время распределяется пропорционально её длительности. Паузы внутри сессии восстановить нельзя. Трафик — оценка по битрейту, не прямое измерение сети.</p>
        </div>
      </> : <section className="rounded-3xl border border-dashed border-line bg-surface p-8 text-center sm:p-12">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent"><Sparkles size={24} /></div>
        <h2 className="mt-4 font-display text-xl font-bold">Пока тихо</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">За выбранный период нет сохранённых прослушиваний. Поменяйте период или включите станцию — здесь появятся время, привычки и любимые источники.</p>
        {period !== 0 && <button onClick={() => setPeriod(0)} className="mt-5 min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-110">Показать всё время</button>}
      </section>}

      {hasListening && data.totalSeconds < 1800 && <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2/40 px-4 py-3 text-xs leading-relaxed text-muted">
        <Info size={15} className="mt-0.5 shrink-0" />
        <p>Некоторые выводы пока предварительные: для надёжной картины нужно больше сохранённых сессий. «Любимая станция» ранжируется по времени, а не по количеству запусков.</p>
      </div>}
    </div>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-surface-2/50 px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

export default Stats;
