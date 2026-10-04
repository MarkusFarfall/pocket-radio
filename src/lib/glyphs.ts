import {
  AudioLines,
  Baby,
  BookOpen,
  Brain,
  Cloud,
  Coffee,
  Disc3,
  Drum,
  Flame,
  Globe,
  Guitar,
  Headphones,
  House,
  Landmark,
  Leaf,
  Mic,
  Moon,
  Mountain,
  Music,
  Music2,
  Newspaper,
  PartyPopper,
  Piano,
  Podcast,
  Radio,
  Rocket,
  Skull,
  Sparkles,
  Sun,
  Sunrise,
  TreePine,
  Trophy,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const GLYPHS: Record<string, { icon: LucideIcon; label: string }> = {
  radio: { icon: Radio, label: "Радио" },
  music: { icon: Music, label: "Музыка" },
  music2: { icon: Music2, label: "Ноты" },
  piano: { icon: Piano, label: "Пианино" },
  guitar: { icon: Guitar, label: "Гитара" },
  drum: { icon: Drum, label: "Ударные" },
  mic: { icon: Mic, label: "Микрофон" },
  headphones: { icon: Headphones, label: "Наушники" },
  disc: { icon: Disc3, label: "Пластинка" },
  audio: { icon: AudioLines, label: "Волна" },
  waves: { icon: Waves, label: "Море" },
  coffee: { icon: Coffee, label: "Кофе" },
  leaf: { icon: Leaf, label: "Природа" },
  tree: { icon: TreePine, label: "Лес" },
  mountain: { icon: Mountain, label: "Горы" },
  wind: { icon: Wind, label: "Ветер" },
  sun: { icon: Sun, label: "Солнце" },
  sunrise: { icon: Sunrise, label: "Рассвет" },
  moon: { icon: Moon, label: "Ночь" },
  cloud: { icon: Cloud, label: "Облако" },
  flame: { icon: Flame, label: "Огонь" },
  zap: { icon: Zap, label: "Энергия" },
  skull: { icon: Skull, label: "Метал" },
  sparkles: { icon: Sparkles, label: "Хиты" },
  party: { icon: PartyPopper, label: "Праздник" },
  brain: { icon: Brain, label: "Фокус" },
  news: { icon: Newspaper, label: "Новости" },
  podcast: { icon: Podcast, label: "Подкаст" },
  book: { icon: BookOpen, label: "Книга" },
  globe: { icon: Globe, label: "Мир" },
  landmark: { icon: Landmark, label: "Город" },
  home: { icon: House, label: "Дом" },
  baby: { icon: Baby, label: "Детям" },
  trophy: { icon: Trophy, label: "Спорт" },
  rocket: { icon: Rocket, label: "Космос" },
};

export const GLYPH_KEYS = Object.keys(GLYPHS);

export interface GlyphSource {
  icon?: string;
  genre?: string;
  tags?: string[];
  kind?: string;
  name?: string;
  mood?: string;
}

const RULES: [RegExp, string][] = [
  [/metal|punk|метал|hardcore/, "skull"],
  [/lo-?fi|chillhop|study|coffee|cafe|кофе/, "coffee"],
  [/jazz|swing|blues|джаз|блюз|bebop|lounge/, "piano"],
  [/classical|opera|orchestra|symphon|классик|baroque/, "music2"],
  [/ambient|downtempo|sleep|meditat|relax|drone|chill|спокойн/, "waves"],
  [/space|cosmos|космос|galaxy/, "rocket"],
  [/techno|house|trance|edm|electro|dance|dnb|drum|dubstep|club|synth|phonk|vapor|электрон/, "audio"],
  [/hip.?hop|rap|trap|r&b|хип/, "mic"],
  [/rock|indie|alternative|grunge|folk|country|acoustic|рок|инди/, "guitar"],
  [/reggae|ska|tropical|beach|регги/, "sun"],
  [/oldies|retro|vinyl|soul|disco|70s|80s|90s|ретро|ностальг|дискотек/, "disc"],
  [/news|новост|информ|info/, "news"],
  [/kids|children|детск|baby/, "baby"],
  [/sport|спорт/, "trophy"],
  [/podcast|talk|speech|culture|разговор|подкаст|книг/, "podcast"],
  [/музык|music|soundtrack|кино/, "music"],
  [/pop|hits|chart|поп|хит/, "sparkles"],
  [/world|international|мир/, "globe"],
];

export function glyphKey(s: GlyphSource): string {
  if (s.icon?.startsWith("g:") && GLYPHS[s.icon.slice(2)]) return s.icon.slice(2);
  if (s.kind === "lan") return "home";
  if (s.kind === "vod") return "podcast";
  const text = `${s.genre ?? ""} ${(s.tags ?? []).join(" ")} ${s.name ?? ""}`.toLowerCase();
  for (const [re, key] of RULES) if (re.test(text)) return key;
  return "radio";
}

export function glyphIcon(s: GlyphSource): LucideIcon {
  return GLYPHS[glyphKey(s)].icon;
}
