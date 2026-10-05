export interface CategoryOption {
  /** Tag/query sent to the selected catalogue; deliberately kept in its original form. */
  value: string;
  /** User-facing Russian label. */
  label: string;
}

/** Curated categories always available in Radio Browser, independent of API tag order. */
export const QUICK_STATION_CATEGORIES: CategoryOption[] = [
  { value: "jazz", label: "Джаз" },
  { value: "lofi", label: "Лоу-фай" },
  { value: "ambient", label: "Эмбиент" },
  { value: "classical", label: "Классика" },
  { value: "rock", label: "Рок" },
  { value: "electronic", label: "Электроника" },
  { value: "pop", label: "Поп" },
  { value: "indie", label: "Инди" },
  { value: "80s", label: "80-е" },
  { value: "90s", label: "90-е" },
  { value: "news", label: "Новости" },
  { value: "talk", label: "Разговорное" },
  { value: "religious", label: "Религиозные" },
  { value: "children", label: "Детские" },
  { value: "hip hop", label: "Хип-хоп" },
  { value: "metal", label: "Метал" },
  { value: "reggae", label: "Регги" },
  { value: "chillout", label: "Чилаут" },
  { value: "dance", label: "Танцевальная музыка" },
  { value: "podcast", label: "Подкасты" },
];

/** Search terms for Radio Garden are English because its catalogue is indexed that way. */
export const GARDEN_IDEAS: CategoryOption[] = [
  { value: "jazz", label: "Джаз" },
  { value: "bbc", label: "BBC" },
  { value: "radio one", label: "Radio One" },
  { value: "classic", label: "Классика" },
  { value: "chill", label: "Чилаут" },
  { value: "rock", label: "Рок" },
  { value: "news", label: "Новости" },
  { value: "love", label: "Love" },
  { value: "lounge", label: "Лаунж" },
  { value: "ibiza", label: "Ибица" },
];

const TAG_LABELS: Record<string, string> = {
  "80s": "80-е",
  "1980s": "80-е",
  "90s": "90-е",
  "1990s": "90-е",
  alternative: "Альтернатива",
  "alternative rock": "Альтернативный рок",
  ambient: "Эмбиент",
  audiobook: "Аудиокниги",
  blues: "Блюз",
  bossa: "Босса-нова",
  classical: "Классика",
  classic: "Классика",
  children: "Детские",
  childrens: "Детские",
  kids: "Детские",
  kinderradio: "Детские",
  "classic hits": "Золотые хиты",
  "classic rock": "Классический рок",
  chill: "Чилаут",
  chillhop: "Чилаут-хоп",
  chillout: "Чилаут",
  "chill out": "Чилаут",
  country: "Кантри",
  dance: "Танцевальная музыка",
  disco: "Диско",
  downtempo: "Даунтемпо",
  drumandbass: "Драм-н-бейс",
  "drum and bass": "Драм-н-бейс",
  dub: "Даб",
  dubstep: "Дабстеп",
  easy: "Лёгкая музыка",
  "easy listening": "Лёгкая музыка",
  electronic: "Электроника",
  electronica: "Электроника",
  "electronic music": "Электронная музыка",
  folk: "Фолк",
  funk: "Фанк",
  gospel: "Госпел",
  house: "Хаус",
  "hip hop": "Хип-хоп",
  "hip-hop": "Хип-хоп",
  hits: "Хиты",
  indie: "Инди",
  "indie rock": "Инди-рок",
  jazz: "Джаз",
  latin: "Латинская музыка",
  latino: "Латинская музыка",
  lofi: "Лоу-фай",
  "lo-fi": "Лоу-фай",
  lounge: "Лаунж",
  metal: "Метал",
  "heavy metal": "Тяжёлый метал",
  meditation: "Медитация",
  religious: "Религиозные",
  religion: "Религиозные",
  christian: "Религиозные",
  "christian music": "Религиозные",
  catholic: "Религиозные",
  church: "Религиозные",
  worship: "Религиозные",
  islam: "Религиозные",
  islamic: "Религиозные",
  muslim: "Религиозные",
  quran: "Религиозные",
  prayer: "Религиозные",
  news: "Новости",
  oldies: "Ретро",
  opera: "Опера",
  pop: "Поп",
  podcast: "Подкасты",
  podcasts: "Подкасты",
  punk: "Панк",
  rnb: "R&B",
  "r&b": "R&B",
  rap: "Рэп",
  reggae: "Регги",
  reggaeton: "Реггетон",
  rock: "Рок",
  salsa: "Сальса",
  ska: "Ска",
  soul: "Соул",
  soundtrack: "Саундтреки",
  speech: "Разговорное",
  sports: "Спорт",
  techno: "Техно",
  talk: "Разговорное",
  trance: "Транс",
  "top 40": "Топ-40",
  top40: "Топ-40",
  variété: "Эстрада",
  vintage: "Ретро",
  world: "Музыка мира",
  "world music": "Музыка мира",
};

function normalizeTag(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[_]+/g, " ").replace(/\s+/g, " ");
}

/** Translate known catalogue genre tags; unknown/non-genre tags are omitted from category chips. */
export function stationTagLabel(value: string): string | null {
  return TAG_LABELS[normalizeTag(value)] ?? null;
}

/** Keep API tag values for filtering but show only known, localized genre labels. */
export function stationCategoryOptions(apiTags: string[]): CategoryOption[] {
  const seenValues = new Set(QUICK_STATION_CATEGORIES.map((category) => normalizeTag(category.value)));
  const seenLabels = new Set(QUICK_STATION_CATEGORIES.map((category) => category.label));
  const dynamic: CategoryOption[] = [];

  for (const rawValue of apiTags) {
    const value = rawValue.trim();
    const key = normalizeTag(value);
    const label = stationTagLabel(value);
    if (!key || !label || seenValues.has(key) || seenLabels.has(label)) continue;
    seenValues.add(key);
    seenLabels.add(label);
    dynamic.push({ value, label });
  }

  return [...QUICK_STATION_CATEGORIES, ...dynamic].slice(0, 48);
}
