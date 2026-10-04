// Определение жанра и настроения по тегам/названию станции (рус. и англ.).
const RULES: [RegExp, string, string][] = [
  [/metal|punk|hardcore|метал|панк/, "Метал", "Энергия"],
  [/blues|блюз/, "Блюз", "Спокойное"],
  [/jazz|swing|bebop|bossa|джаз/, "Джаз", ""],
  [/classical|classic music|opera|orchestra|baroque|symphon|классик|опера/, "Классика", "Спокойное"],
  [/lo-?fi|chillhop|study/, "Ambient / Chill", "Фокус"],
  [/ambient|chill|lounge|downtempo|relax|meditat|new age|easy listening|sleep|drone|спокойн/, "Ambient / Chill", "Спокойное"],
  [/techno|house|trance|edm|electro|dance|dnb|drum.?n|dubstep|club|synth|phonk|vapor|электрон|танцев/, "Электроника", "Энергия"],
  [/hip.?hop|rap|trap|r&b|rnb|хип|рэп/, "Хип-хоп", "Энергия"],
  [/country|americana|bluegrass|кантри/, "Кантри", "Весёлое"],
  [/reggae|ska|dub\b|регги/, "Регги", "Весёлое"],
  [/rock|grunge|рок/, "Рок", "Энергия"],
  [/indie|alternative|folk|acoustic|инди|фолк/, "Инди", ""],
  [/oldies|retro|50s|60s|70s|80s|90s|classic hits|nostalgia|vintage|disco|soul|funk|ретро|дискотек|шансон|estrada|эстрад/, "Ретро", "Ностальгия"],
  [/news|информ|новост|\binfo\b/, "Новости", "Фокус"],
  [/podcast|подкаст|audiobook|аудиокниг/, "Подкасты", ""],
  [/talk|speech|sport|religio|christian|culture|разговор|спорт/, "Разговорное", "Фокус"],
  [/kids|children|детск|baby|toggo/, "Детям", "Весёлое"],
  [/latin|salsa|reggaeton|bachata|latino/, "Latino", "Весёлое"],
  [/pop|hits|top ?40|charts|поп|хит/, "Поп", "Весёлое"],
];

export function guessGenre(text: string): { genre: string; mood: string } {
  const t = text.toLowerCase();
  for (const [re, genre, mood] of RULES) if (re.test(t)) return { genre, mood };
  return { genre: "", mood: "" };
}
