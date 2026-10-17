import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  Clock3,
  Compass,
  Crown,
  Disc3,
  Flame,
  Globe2,
  Headphones,
  Info,
  Moon,
  Music2,
  Radio,
  Rocket,
  Signal,
  Sparkles,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEvents, useSessions } from "../lib/hooks";
import { addCalendarDays, dayStart, MIN_ACTIVE_DAY_SECONDS, secondsByLocalDay, secondsInRange, streakDays } from "../lib/stats";
import {
  buildAchievements,
  buildComparisons,
  buildHeatmap,
  buildPersona,
  buildRecords,
  HEAT_LEVELS,
  partShares,
  secondsByHour,
  secondsByWeekday,
  unlockedCount,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  weeklyMatrix,
  type Achievement,
  type HeatCell,
} from "../lib/statsInsights";
import { fmtBytes, fmtDuration, KIND_LABEL } from "../lib/templates";
import type { PlayEvent, Session, Station } from "../lib/types";

type Period = 7 | 30 | 365 | 0;
type Breakdown = "genre" | "mood" | "kind" | "city";

type StationAggregate = { id: string; name: string; seconds: number; sessions: number; genre: string; logo?: string };
type CategoryAggregate = { label: string; seconds: number };
type DayPoint = { day: number; seconds: number };
type EventAggregate = { id: string; name: string; errors: number; buffers: number; bufferMs: number; latestAt: number };

const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "7 дней" },
  { value: 30, label: "30 дней" },
  { value: 365, label: "Год" },
  { value: 0, label: "Всё время" },
];

const BREAKDOWNS: { value: Breakdown; label: string }[] = [
  { value: "genre", label: "Жанры" },
  { value: "mood", label: "Настроение" },
  { value: "kind", label: "Тип" },
  { value: "city", label: "Город" },
];

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)"];

/* ------------------------------------------------------------------ утилиты */

function formatCount(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
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

function formatClock(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(ts);
}

function fullDate(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(ts).replace(" г.", "");
}

function relativeDay(ts: number, now: number): string {
  const today = dayStart(now);
  if (ts >= today) return "Сегодня";
  if (ts >= addCalendarDays(today, -1)) return "Вчера";
  if (ts >= addCalendarDays(today, -7)) return new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(ts);
  return fullDate(ts);
}

function getSnapshotValue(session: Session, key: Breakdown, currentStation?: Station): string {
  if (key === "kind") return KIND_LABEL[session.kind] ?? session.kind;
  const snap = session[key];
  const fallback = currentStation?.[key];
  return (typeof snap === "string" && snap.trim() ? snap : typeof fallback === "string" ? fallback : "").trim();
}

/* ------------------------------------------------------------------ агрегаты */

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
  return {
    items: [...sorted.slice(0, 5), { label: "Другие", seconds: sorted.slice(5).reduce((sum, item) => sum + item.seconds, 0) }],
    missingSeconds,
  };
}

function buildHourlyStarts(sessions: Session[], from: number, to: number): number[] {
  const counts = new Array<number>(24).fill(0);
  for (const session of sessions) {
    if (session.startedAt < from || session.startedAt >= to) continue;
    counts[new Date(session.startedAt).getHours()] += 1;
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

/* ------------------------------------------------------------------ маленькие блоки */

function Panel({ title, subtitle, action, children, className = "" }: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`stats-panel stats-reveal min-w-0 ${className}`}>
      <div className="stats-panel-head">
        <div className="min-w-0">
          <h2 className="stats-panel-title">{title}</h2>
          {subtitle && <p className="stats-panel-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ icon: Icon, label, value, detail }: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stats-metric min-w-0">
      <div className="flex items-center gap-2">
        <span className="stats-metric-icon"><Icon size={14} /></span>
        <span className="truncate text-[11px] font-semibold text-muted">{label}</span>
      </div>
      <div className="stats-metric-value truncate" title={value}>{value}</div>
      <div className="stats-metric-detail truncate" title={detail}>{detail}</div>
    </div>
  );
}

/** Радиальный «звуковой отпечаток»: 24 луча по часам суток. */
function SoundPrint({ hourly, label, caption }: { hourly: number[]; label: string; caption: string }) {
  const size = 200;
  const center = size / 2;
  const inner = 50;
  const maxBar = 44;
  const max = Math.max(1, ...hourly);
  return (
    <div className="stats-print">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Распределение прослушивания по часам суток">
        <circle cx={center} cy={center} r={inner - 6} fill="none" stroke="color-mix(in srgb, var(--line) 65%, transparent)" strokeWidth="1" />
        <circle cx={center} cy={center} r={inner + maxBar + 6} fill="none" stroke="color-mix(in srgb, var(--line) 40%, transparent)" strokeWidth="1" strokeDasharray="2 5" />
        {hourly.map((seconds, hour) => {
          const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
          const length = seconds > 0 ? 6 + (seconds / max) * maxBar : 3;
          const x1 = center + Math.cos(angle) * inner;
          const y1 = center + Math.sin(angle) * inner;
          const x2 = center + Math.cos(angle) * (inner + length);
          const y2 = center + Math.sin(angle) * (inner + length);
          const peak = seconds >= max * 0.92 && seconds > 0;
          return (
            <line
              key={hour}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={peak ? "var(--accent)" : seconds > 0 ? "color-mix(in srgb, var(--accent) 62%, transparent)" : "color-mix(in srgb, var(--line) 80%, transparent)"}
              strokeWidth={peak ? 5 : 4}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="stats-print-label">
        <b>{label}</b>
        <span>{caption}</span>
      </div>
    </div>
  );
}

/** Плавная линия по точкам (Catmull-Rom → кубические Безье). */
function smoothPath(points: { x: number; y: number }[], clampLow = -Infinity, clampHigh = Infinity): string {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  // Без ограничения контрольные точки могут увести кривую ниже нуля — «провал» под осью.
  const clamp = (value: number) => Math.min(clampHigh, Math.max(clampLow, value));
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function AreaChart({ points, previous }: { points: DayPoint[]; previous: DayPoint[] }) {
  const W = 720;
  const H = 190;
  const top = 10;
  const bottom = H - 10;
  const max = Math.max(60, ...points.map((p) => p.seconds), ...previous.map((p) => p.seconds));
  const x = (index: number) => (points.length <= 1 ? W / 2 : (index / (points.length - 1)) * W);
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  const line = points.map((point, index) => ({ x: x(index), y: y(point.seconds) }));
  const area = `${smoothPath(line, top, bottom)} L ${x(points.length - 1)} ${bottom} L ${x(0)} ${bottom} Z`;
  const ghost = previous.length === points.length ? previous.map((point, index) => ({ x: x(index), y: y(point.seconds) })) : [];
  const average = points.reduce((sum, point) => sum + point.seconds, 0) / Math.max(1, points.length);
  return (
    <div className="stats-area">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Динамика прослушивания по дням">
        <defs>
          <linearGradient id="stats-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((step) => (
          <line key={step} x1="0" y1={top + (bottom - top) * step} x2={W} y2={top + (bottom - top) * step}
            stroke="var(--line)" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 6" />
        ))}
        <path d={area} fill="url(#stats-area-fill)" />
        {ghost.length > 0 && (
          <path d={smoothPath(ghost, top, bottom)} fill="none" stroke="color-mix(in srgb, var(--muted) 70%, transparent)"
            strokeWidth="1.5" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        )}
        <line x1="0" y1={y(average)} x2={W} y2={y(average)} stroke="var(--accent)" strokeOpacity="0.45"
          strokeWidth="1" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
        <path d={smoothPath(line, top, bottom)} fill="none" stroke="var(--accent)" strokeWidth="2.5"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          <rect key={point.day} x={x(index) - W / points.length / 2} y="0" width={W / points.length} height={H} fill="transparent">
            <title>{`${dayLabel(point.day)}: ${fmtDuration(point.seconds)}`}</title>
          </rect>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>{points.length ? dayLabel(points[0].day) : ""}</span>
        <span>{points.length ? dayLabel(points[Math.floor(points.length / 2)].day) : ""}</span>
        <span>{points.length ? dayLabel(points[points.length - 1].day) : ""}</span>
      </div>
      <div className="stats-area-legend">
        <span><i style={{ background: "var(--accent)" }} />выбранный период</span>
        {previous.length > 0 && <span><i style={{ background: "color-mix(in srgb, var(--muted) 70%, transparent)" }} />предыдущий период</span>}
        <span><i style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }} />среднее {fmtDuration(average, true)}</span>
      </div>
    </div>
  );
}

function Donut({ items, total }: { items: CategoryAggregate[]; total: number }) {
  const size = 148;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const top = items[0];
  return (
    <div className="stats-donut-wrap">
      <div className="stats-donut">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Доли прослушивания по категориям">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="color-mix(in srgb, var(--line) 55%, transparent)" strokeWidth="16" />
          {items.map((item, index) => {
            const share = total > 0 ? item.seconds / total : 0;
            const dash = Math.max(0, share * circumference - 2);
            const element = (
              <circle
                key={item.label}
                cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth="16" strokeLinecap="butt"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              >
                <title>{`${item.label}: ${percent(share * 100)}`}</title>
              </circle>
            );
            offset += share * circumference;
            return element;
          })}
        </svg>
        <div className="stats-donut-center">
          <b>{top ? percent((top.seconds / Math.max(1, total)) * 100) : "0%"}</b>
          <span>{top ? top.label : "нет данных"}</span>
        </div>
      </div>
      <div className="stats-legend">
        {items.map((item, index) => (
          <div key={item.label} className="stats-legend-row">
            <span className="stats-legend-dot" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span className="min-w-0">
              <span className="stats-legend-name block" title={item.label}>{item.label}</span>
              <span className="stats-legend-time">{fmtDuration(item.seconds, true)}</span>
            </span>
            <span className="stats-legend-value">{percent((item.seconds / Math.max(1, total)) * 100)}</span>
            <span className="stats-legend-bar"><i style={{ width: `${Math.min(100, (item.seconds / Math.max(1, items[0]?.seconds ?? 1)) * 100)}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ cells, months, weeksHiddenBelow }: {
  cells: HeatCell[][];
  months: { index: number; label: string }[];
  weeksHiddenBelow: number;
}) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  return (
    <div className="min-w-0">
      <div className="stats-heat-scroll">
        <div className="stats-heat">
          <div className="stats-heat-months" style={{ width: cells.length * 16 }}>
            {months.map((month) => (
              <span key={`${month.index}-${month.label}`} className="stats-heat-month" style={{ left: month.index * 16 }}>{month.label}</span>
            ))}
          </div>
          <div className="stats-heat-body">
            <div className="stats-heat-weekdays">
              {WEEKDAYS_SHORT.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="stats-heat-grid" role="img" aria-label={`Карта активности: ${cells.flat().filter((cell) => cell.level !== null && cell.level > 0).length} дней с прослушиванием за год`}>
              {cells.map((week, index) => (
                <div key={week[0].day} className="stats-heat-week" data-old={index < weeksHiddenBelow ? "1" : undefined}>
                  {week.map((cell) => (
                    <div
                      key={cell.day}
                      className="stats-heat-cell"
                      data-level={cell.level === null ? "null" : cell.level}
                      onMouseEnter={() => setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(cell)}
                      onClick={() => setHover(cell)}
                      aria-hidden="true"
                      title={cell.level === null ? "" : `${dayLabel(cell.day)}: ${cell.seconds > 0 ? fmtDuration(cell.seconds) : "тишина"}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="stats-heat-legend">
        <span className="min-w-0 truncate">
          {hover && hover.level !== null ? `${dayLabel(hover.day)} · ${hover.seconds > 0 ? fmtDuration(hover.seconds) : "без прослушивания"}` : "Наведите или нажмите на день, чтобы увидеть время"}
        </span>
        <span className="ml-auto flex items-center gap-1">
          меньше
          <span className="stats-heat-cell" data-level="0" />
          {HEAT_LEVELS.map((level) => <span key={level.level} className="stats-heat-cell" data-level={level.level} title={level.label} />)}
          больше
        </span>
      </div>
    </div>
  );
}

function WeeklyRhythm({ matrix }: { matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="min-w-0">
      <div className="stats-weekly">
        <div className="stats-weekly-labels">
          {WEEKDAYS_SHORT.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="stats-weekly-grid" role="img" aria-label="Когда вы слушаете: день недели и час">
          {matrix.map((row, weekday) => row.map((seconds, hour) => {
            const level = seconds <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((seconds / max) * 4)));
            return (
              <div
                key={`${weekday}-${hour}`}
                className="stats-weekly-cell"
                data-h={level}
                title={`${WEEKDAYS[weekday]}, ${String(hour).padStart(2, "0")}:00 · ${seconds > 0 ? fmtDuration(seconds) : "тишина"}`}
              />
            );
          }))}
        </div>
      </div>
      <div className="stats-weekly-axis">
        <span>00</span><span>06</span><span>12</span><span>18</span>
      </div>
    </div>
  );
}

const BADGE_ICONS: Record<Achievement["icon"], typeof Trophy> = {
  rocket: Rocket,
  clock: Clock3,
  flame: Flame,
  trophy: Trophy,
  compass: Compass,
  moon: Moon,
  wifi: WifiOff,
  disc: Disc3,
  crown: Crown,
  sparkles: Sparkles,
  headphones: Headphones,
  globe: Globe2,
  calendar: CalendarCheck,
};

function Badge({ item }: { item: Achievement }) {
  const Icon = BADGE_ICONS[item.icon] ?? Trophy;
  const currentText = item.unit === "seconds"
    ? fmtDuration(item.current, true)
    : item.unit === "percent"
      ? `${Math.min(100, Math.round(item.current))}%`
      : item.unit === "days"
        ? `${Math.min(Math.round(item.current), item.target)} / ${item.target}`
        : formatCount(Math.min(item.current, item.target));
  return (
    <div className="stats-badge" data-unlocked={item.unlocked}>
      <div className="flex items-center justify-between gap-2">
        <span className="stats-badge-icon"><Icon size={16} /></span>
        <span className="stats-badge-progress">{item.unlocked ? "получено" : currentText}</span>
      </div>
      <div className="stats-badge-title">{item.title}</div>
      <div className="stats-badge-hint">{item.hint}</div>
      <div className="stats-badge-track"><i style={{ width: `${item.progress}%` }} /></div>
    </div>
  );
}

/* ------------------------------------------------------------------ страница */

export function Stats({ stations }: { stations: Station[] }) {
  const sessions = useSessions();
  const events = useEvents();
  const [period, setPeriod] = useState<Period>(7);
  const [breakdown, setBreakdown] = useState<Breakdown>("genre");
  const [now, setNow] = useState(() => Date.now());

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
    const previousChart: DayPoint[] = period === 0
      ? []
      : Array.from({ length: chartDays }, (_, index) => {
          const day = addCalendarDays(previousFrom, index);
          return { day, seconds: sessions.reduce((sum, session) => sum + secondsInRange(session, day, Math.min(addCalendarDays(day, 1), from)), 0) };
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
        logo: station?.logo || session.stationLogo,
      };
      existing.seconds += seconds;
      existing.sessions++;
      stationTotals.set(session.stationId, existing);
    }
    const topStations = [...stationTotals.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 6);
    const categories = buildCategoryBreakdown(sessions, stationIndex, from, now, breakdown);
    const trafficBytes = activeSessions.reduce((sum, session) => {
      if (session.offline) return sum;
      const stationBitrate = stationIndex.get(session.stationId)?.bitrate;
      const bitrate = session.bitrate && session.bitrate > 0 ? session.bitrate : stationBitrate && stationBitrate > 0 ? stationBitrate : 128;
      return sum + secondsInRange(session, from, now) * bitrate * 1000 / 8;
    }, 0);

    const offlineSeconds = activeSessions.reduce((sum, session) => sum + (session.offline ? secondsInRange(session, from, now) : 0), 0);
    const starts = activeSessions.filter((session) => session.startedAt >= from && session.startedAt <= now);
    const startsPerHour = buildHourlyStarts(starts, from, now + 1);
    const peakHourIndex = startsPerHour.reduce((best, count, hour) => count > startsPerHour[best] ? hour : best, 0);
    const hourly = secondsByHour(sessions, from, now);
    const weekdaySeconds = secondsByWeekday(sessions, from, now);
    const eventsInPeriod = buildEventStats(events, stationIndex, from, now + 1);
    const totalErrors = eventsInPeriod.reduce((sum, item) => sum + item.errors, 0);
    const totalBuffers = eventsInPeriod.reduce((sum, item) => sum + item.buffers, 0);
    const totalBufferMs = eventsInPeriod.reduce((sum, item) => sum + item.bufferMs, 0);
    const recent = [...activeSessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 12);

    const genreSet = new Set<string>();
    const citySet = new Set<string>();
    for (const session of activeSessions) {
      const station = stationIndex.get(session.stationId);
      const genre = (session.genre || station?.genre || "").trim();
      if (genre) genreSet.add(genre);
      const city = (session.city || station?.city || "").trim();
      if (city) citySet.add(city);
    }

    const genreCount = genreSet.size;
    const topStationShare = totalSeconds > 0 && topStations[0] ? (topStations[0].seconds / totalSeconds) * 100 : 0;
    const offlineShare = totalSeconds > 0 ? (offlineSeconds / totalSeconds) * 100 : 0;
    const averageSessionSeconds = activeSessions.length ? totalSeconds / activeSessions.length : 0;
    const streak = streakDays(sessions, now);
    const persona = buildPersona({ totalSeconds, hourly, genreCount, topStationShare, offlineShare, averageSessionSeconds, activeDays });
    const longest = [...activeSessions].sort((a, b) => b.seconds - a.seconds)[0];
    const favoriteWeekday = weekdaySeconds.some((seconds) => seconds > 0)
      ? weekdaySeconds.reduce((best, seconds, weekday) => seconds > weekdaySeconds[best] ? weekday : best, 0)
      : null;
    const nightShare = partShares(hourly).find((part) => part.id === "night")?.share ?? 0;
    const peakHour = startsPerHour.some((count) => count > 0) ? peakHourIndex : null;

    const achievements = buildAchievements({
      totalSeconds,
      sessionCount: activeSessions.length,
      stationCount: stationTotals.size,
      genreCount,
      streak,
      nightShare,
      offlineSeconds,
      topStationShare,
      cityCount: citySet.size,
    });
    const records = buildRecords({
      bestDayDay: bestDay.day,
      bestDaySeconds: bestDay.seconds,
      longestSessionSeconds: longest?.seconds ?? 0,
      longestSessionName: longest ? (longest.stationName || stationIndex.get(longest.stationId)?.name || "Станция удалена") : "",
      longestSessionAt: longest?.startedAt ?? now,
      favoriteWeekday,
      peakHour,
      streak,
      activeDays,
      stationCount: stationTotals.size,
    });

    return {
      from,
      totalSeconds,
      previousSeconds,
      activeDays,
      stationCount: stationTotals.size,
      sessionCount: activeSessions.length,
      averageSessionSeconds,
      trafficBytes,
      offlineSeconds,
      offlinePercent: totalSeconds ? offlineSeconds / totalSeconds * 100 : 0,
      dailyChart,
      previousChart,
      topStations,
      categories: categories.items,
      missingCategorySeconds: categories.missingSeconds,
      startsPerHour,
      peakHour,
      totalErrors,
      totalBuffers,
      totalBufferMs,
      eventStations: eventsInPeriod.slice(0, 3),
      recent,
      streak,
      bestDay,
      hourly,
      weekdaySeconds,
      weekly: weeklyMatrix(sessions, from, now),
      persona,
      achievements,
      records,
      facts: buildComparisons(totalSeconds),
      heatmap: buildHeatmap(sessions, now),
      genreCount,
      cityCount: citySet.size,
      nightShare,
      topStationShare,
    };
  }, [sessions, events, stations, period, breakdown, now]);

  const maxStationSeconds = Math.max(1, ...data.topStations.map((item) => item.seconds));
  const currentVsPrevious = data.previousSeconds > 0
    ? (data.totalSeconds - data.previousSeconds) / data.previousSeconds * 100
    : null;
  const hasListening = data.totalSeconds > 0;
  const shares = partShares(data.hourly);
  const mainPart = shares.reduce((best, part) => part.share > best.share ? part : best, shares[0]);
  const unlocked = unlockedCount(data.achievements);
  const feed = useMemo(() => {
    const groups: { day: number; label: string; rows: Session[] }[] = [];
    for (const session of data.recent) {
      const key = dayStart(session.startedAt);
      const last = groups[groups.length - 1];
      if (last && last.day === key) last.rows.push(session);
      else groups.push({ day: key, label: relativeDay(key, now), rows: [session] });
    }
    return groups;
  }, [data.recent, now]);

  const changePeriod = (value: Period) => {
    setPeriod(value);
    setNow(Date.now());
  };

  return (
    <div className="stats-page mx-auto max-w-6xl space-y-4 pb-8 sm:space-y-5">
      <header className="design-page-heading flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent">
            <Activity size={14} /> Личные данные
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Статистика</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Ваш звуковой портрет: когда вы слушаете, что выбираете и как меняется привычка — по локальным записям этого устройства.
          </p>
        </div>
        <div className="flex w-full gap-1 rounded-2xl border border-line bg-surface p-1 sm:w-auto" role="group" aria-label="Период статистики">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => changePeriod(item.value)}
              aria-pressed={period === item.value}
              className={`min-h-10 min-w-0 flex-1 rounded-xl px-2 text-[11px] font-semibold transition sm:flex-none sm:px-3 sm:text-xs ${period === item.value ? "bg-accent text-accent-ink shadow-sm" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {hasListening ? (
        <>
          <section className="stats-hero stats-reveal">
            <div className="stats-hero-inner">
              <div className="min-w-0">
                <span className="stats-eyebrow"><Sparkles size={13} /> Ваш звуковой портрет</span>
                <h2 className="stats-hero-title">{data.persona.title}</h2>
                <p className="stats-hero-tagline">{data.persona.tagline}</p>
                <div className="stats-total" data-testid="stats-total-time">{fmtDuration(data.totalSeconds, true)}</div>
                <div className="stats-chips">
                  <span className="stats-chip"><CalendarDays size={13} />{formatCount(data.activeDays)} {pluralRu(data.activeDays, "активный день", "активных дня", "активных дней")}</span>
                  <span className="stats-chip"><Radio size={13} />{formatCount(data.sessionCount)} {pluralRu(data.sessionCount, "включение", "включения", "включений")}</span>
                  {currentVsPrevious !== null && (
                    <span className="stats-chip" data-tone={currentVsPrevious >= 0 ? "up" : "down"}>
                      {currentVsPrevious >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {Math.abs(currentVsPrevious).toFixed(0)}% к прошлому периоду
                    </span>
                  )}
                  {currentVsPrevious === null && period !== 0 && (
                    <span className="stats-chip"><Info size={13} />сравнение появится позже</span>
                  )}
                </div>
                {data.persona.traits.length > 0 && (
                  <div className="stats-traits">
                    {data.persona.traits.map((trait) => <span key={trait} className="stats-trait">{trait}</span>)}
                  </div>
                )}
              </div>
              <SoundPrint
                hourly={data.hourly}
                label={mainPart ? mainPart.label.toLowerCase() : "тихо"}
                caption={mainPart ? `${percent(mainPart.share)} времени` : "нет данных"}
              />
            </div>
          </section>

          <div className="stats-metrics grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
            <Metric icon={CalendarDays} label="Активные дни" value={formatCount(data.activeDays)} detail="≥5 мин в день" />
            <Metric icon={Radio} label="Сессии" value={formatCount(data.sessionCount)} detail={`${formatCount(data.stationCount)} ${pluralRu(data.stationCount, "уникальная станция", "уникальные станции", "уникальных станций")}`} />
            <Metric icon={Clock3} label="Средняя сессия" value={fmtDuration(Math.round(data.averageSessionSeconds / 60) * 60, true)} detail="в выбранном периоде" />
            <Metric icon={data.offlineSeconds > 0 ? WifiOff : Wifi} label="Офлайн" value={percent(data.offlinePercent)} detail={`${fmtDuration(data.offlineSeconds, true)} без интернета`} />
            <Metric icon={Activity} label="Трафик" value={`≈ ${fmtBytes(data.trafficBytes)}`} detail="оценка по битрейту" />
          </div>

          <Panel
            title="Карта года"
            subtitle={`${data.heatmap.activeDays} ${pluralRu(data.heatmap.activeDays, "активный день", "активных дня", "активных дней")} за последние 12 месяцев · один квадрат — один день`}
            action={<span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-muted">365 дней</span>}
          >
            <Heatmap cells={data.heatmap.columns} months={data.heatmap.months} weeksHiddenBelow={data.heatmap.columns.length - 26} />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Panel
              title="Динамика по дням"
              subtitle={period === 0 ? "Последние 30 дней, даже если история длиннее" : "Сплошная линия — выбранный период, пунктир — такой же отрезок до него"}
            >
              <AreaChart points={data.dailyChart} previous={data.previousChart} />
            </Panel>

            <Panel
              title="Что звучало"
              subtitle="Доли — по времени прослушивания, а не по числу включений"
              action={
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" role="group" aria-label="Разбивка прослушивания">
                  {BREAKDOWNS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setBreakdown(item.value)}
                      aria-pressed={breakdown === item.value}
                      className={`shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${breakdown === item.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              }
            >
              {data.categories.length ? (
                <>
                  <Donut items={data.categories} total={data.totalSeconds} />
                  {data.missingCategorySeconds > 0 && (
                    <p className="mt-3 text-[11px] leading-relaxed text-muted">
                      Для {percent(data.missingCategorySeconds / data.totalSeconds * 100)} времени эти данные не сохранились.
                    </p>
                  )}
                </>
              ) : (
                <EmptyMessage>В записях этого периода пока нет данных для разбивки.</EmptyMessage>
              )}
            </Panel>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Panel title="Ритм недели" subtitle="Когда именно вы включаете эфир: строка — день недели, столбец — час">
              <WeeklyRhythm matrix={data.weekly} />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-muted">
                {shares.map((part) => (
                  <span key={part.id} className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" style={{ opacity: Math.max(0.25, part.share / Math.max(1, mainPart.share)) }} />
                    {part.label} · {part.hours} · {percent(part.share)}
                  </span>
                ))}
              </div>
            </Panel>

            <Panel title="Любимые станции" subtitle="Ранжирование по времени прослушивания за период">
              {data.topStations.length ? (
                <div>
                  {data.topStations.map((station, index) => (
                    <div key={station.id} className="stats-station" data-top={index + 1}>
                      <span className="stats-station-rank">{index + 1}</span>
                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="stats-station-name" title={station.name}>{station.name}</span>
                          <span className="stats-station-time">{fmtDuration(station.seconds, true)}</span>
                        </div>
                        <div className="stats-station-meta">
                          {formatCount(station.sessions)} {pluralRu(station.sessions, "сессия", "сессии", "сессий")}{station.genre ? ` · ${station.genre}` : ""}
                        </div>
                        <div className="stats-station-bar">
                          <i style={{ width: `${Math.min(100, (station.seconds / maxStationSeconds) * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyMessage>Станции появятся здесь после прослушивания.</EmptyMessage>}
            </Panel>
          </div>

          <Panel title="Рекорды" subtitle="Личные максимумы за выбранный период">
            <div className="stats-records">
              {data.records.map((record) => {
                const Icon = record.icon === "trophy" ? Trophy
                  : record.icon === "clock" ? Clock3
                  : record.icon === "flame" ? Flame
                  : record.icon === "radio" ? Radio
                  : record.icon === "calendar-check" ? CalendarCheck
                  : CalendarDays;
                return (
                  <div key={record.id} className="stats-record min-w-0">
                    <Icon size={16} className="stats-record-icon" />
                    <div className="stats-record-label">{record.title}</div>
                    <div className="stats-record-value" title={record.value}>{record.value}</div>
                    <div className="stats-record-detail" title={record.detail}>{record.detail}</div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Достижения"
            subtitle="Открываются по мере прослушивания — без рейтингов и сравнений с другими"
            action={<span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent">{unlocked} из {data.achievements.length}</span>}
          >
            <div className="stats-badges">
              {data.achievements.map((item) => <Badge key={item.id} item={item} />)}
            </div>
          </Panel>

          <Panel title="Если перевести в понятное" subtitle="Приблизительные сравнения — считаются из суммарного времени">
            <div className="stats-facts">
              {data.facts.map((fact) => (
                <div key={fact.id} className="stats-fact min-w-0">
                  <div className="stats-fact-value">{fact.value}</div>
                  <div className="stats-fact-label">{fact.label}</div>
                  <div className="stats-fact-hint">{fact.hint}</div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <Panel title="Стабильность" subtitle="Только то, что приложение успело записать: ошибки и буферизация">
              <div className="stats-health">
                <div className="stats-health-cell">
                  <div className="stats-health-label"><AlertTriangle size={13} className="text-amber-500" /> Ошибки</div>
                  <div className="stats-health-value">{formatCount(data.totalErrors)}</div>
                </div>
                <div className="stats-health-cell">
                  <div className="stats-health-label"><Signal size={13} className="text-accent" /> Буферизация</div>
                  <div className="stats-health-value">{formatCount(data.totalBuffers)}</div>
                </div>
                <div className="stats-health-cell">
                  <div className="stats-health-label"><Clock3 size={13} /> В ожидании</div>
                  <div className="stats-health-value">{fmtDuration(data.totalBufferMs / 1000, true)}</div>
                </div>
                <div className="stats-health-cell">
                  <div className="stats-health-label"><Activity size={13} /> Доля буфера</div>
                  <div className="stats-health-value">
                    {data.totalSeconds > 0 ? `${((data.totalBufferMs / 1000 / data.totalSeconds) * 100).toFixed(1)}%` : "—"}
                  </div>
                </div>
              </div>
              {data.eventStations.length > 0 ? (
                <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                  {data.eventStations.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-muted">
                        {item.errors ? `${item.errors} ${pluralRu(item.errors, "ошибка", "ошибки", "ошибок")}` : ""}
                        {item.errors && item.buffers ? " · " : ""}
                        {item.buffers ? `${item.buffers} ${pluralRu(item.buffers, "буферизация", "буферизации", "буферизаций")}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 border-t border-line pt-3 text-[11px] text-muted">За период записанных сбоев нет — эфир шёл ровно.</p>
              )}
            </Panel>

            <Panel title="Последние сессии" subtitle="Сохранённые записи, а не история каждого трека">
              {feed.length ? (
                <div className="stats-feed">
                  {feed.map((group) => (
                    <div key={group.day}>
                      <div className="stats-feed-day">{group.label}</div>
                      {group.rows.map((session, index) => {
                        const station = stations?.find((item) => item.id === session.stationId);
                        const duration = secondsInRange(session, data.from, now);
                        return (
                          <div key={session.syncId ?? session.id ?? `${session.stationId}-${session.startedAt}-${index}`} className="stats-feed-row">
                            <span className="stats-feed-icon"><Music2 size={14} /></span>
                            <div className="min-w-0">
                              <div className="stats-feed-name">{station?.name || session.stationName || "Станция удалена"}</div>
                              <div className="stats-feed-meta">
                                <span>{formatClock(session.startedAt)}–{formatClock(session.endedAt)}</span>
                                {session.genre && <span>· {session.genre}</span>}
                                {session.offline && <span className="inline-flex items-center gap-1 text-accent"><WifiOff size={10} /> офлайн</span>}
                              </div>
                            </div>
                            <span className="stats-feed-time">{fmtDuration(duration, true)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : <EmptyMessage>Нет сохранённых сессий в этом периоде.</EmptyMessage>}
            </Panel>
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2/40 px-4 py-3 text-xs leading-relaxed text-muted">
            <Info size={15} className="mt-0.5 shrink-0" />
            <p>
              Всё считается на этом устройстве и никуда не отправляется. В сессии записывается общий итог секунд, а не
              точная шкала: при пересечении полуночи или границы периода время делится пропорционально. Паузы внутри
              сессии восстановить нельзя, поэтому достижения и сравнения — оценка, а не измерение. Трафик считается по
              битрейту, а не по счётчику сети.
            </p>
          </div>
        </>
      ) : (
        <section className="stats-panel stats-reveal p-8 text-center sm:p-12">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent"><Sparkles size={24} /></div>
          <h2 className="mt-4 font-display text-xl font-bold">Пока тихо</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            За выбранный период нет сохранённых прослушиваний. Включите станцию — здесь появятся портрет слушателя,
            карта года, ритм недели и достижения.
          </p>
          {period !== 0 && (
            <button onClick={() => changePeriod(0)} className="mt-5 min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition hover:brightness-110">
              Показать всё время
            </button>
          )}
          <div className="mt-6 grid grid-cols-2 gap-2 text-left sm:grid-cols-4">
            {["Портрет слушателя", "Карта года", "Ритм недели", "Достижения"].map((item) => (
              <div key={item} className="rounded-xl border border-dashed border-line px-3 py-2 text-[11px] text-muted">{item}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-surface-2/50 px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

export default Stats;
