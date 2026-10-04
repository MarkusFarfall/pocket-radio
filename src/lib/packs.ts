import type { Draft, StreamKind } from "./types";

export interface Pack {
  id: string;
  title: string;
  group: "Подборки" | "Страны";
  /** id фотографии на Pexels */
  photo: number;
  glyph: string;
  hue: number;
  desc: string;
  stations: Draft[];
}

/** Стабильный id станции из пака — чтобы повторная установка не создавала дубли. */
export function packId(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return "pk-" + (h >>> 0).toString(36);
}

export const packPhoto = (id: number, w = 840, h = 420) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=${h}&w=${w}`;

/** Логотип сайта через сервис фавиконок; если картинки нет или она мелкая, Cover рисует свою обложку. */
const fav = (domain: string) =>
  `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;

interface Opt {
  k?: StreamKind;
  b?: number;
  d?: string;
  n?: string;
}

const S = (name: string, url: string, genre: string, mood: string, city: string, tags: string[] = [], o: Opt = {}): Draft => ({
  name,
  url,
  kind: o.k ?? "http",
  genre,
  mood,
  city,
  tags,
  note: o.n ?? "",
  bitrate: o.b ?? 128,
  icon: "",
  logo: o.d ? fav(o.d) : undefined,
});

// жанры
const AMB = "Ambient / Chill";
const ELE = "Электроника";
const JAZ = "Джаз";
const CLA = "Классика";
const ROK = "Рок";
const MET = "Метал";
const IND = "Инди";
const RET = "Ретро";
const POP = "Поп";
const HIP = "Хип-хоп";
const NEW = "Новости";
const TLK = "Разговорное";
const KID = "Детям";
const REG = "Регги";
const BLU = "Блюз";
const CTY = "Кантри";

const SF = "Сан-Франциско";
const soma = (id: string, name: string, genre: string, mood: string, tags: string[], note = "", br = 128) =>
  S(`SomaFM · ${name}`, `https://ice1.somafm.com/${id}-${br}-mp3`, genre, mood, SF, ["somafm", ...tags], { k: "icecast", d: "somafm.com", n: note, b: br });

const fip = (slug: string, name: string, genre: string, mood: string, tags: string[], note = "") =>
  S(name, `https://icecast.radiofrance.fr/${slug}-midfi.mp3`, genre, mood, "Париж", ["radiofrance", ...tags], { k: "icecast", d: "radiofrance.fr", n: note });

const rec = (slug: string, name: string, genre: string, mood: string, tags: string[], note = "") =>
  S(`Record · ${name}`, `https://radiorecord.hostingradio.ru/${slug}96.aacp`, genre, mood, "Москва", ["radiorecord", ...tags], { d: "radiorecord.ru", n: note, b: 96 });

const zero = (slug: string, name: string, genre: string, mood: string, tags: string[], note = "") =>
  S(`0R · ${name}`, `https://0nlineradio.radioho.st/${slug}`, genre, mood, "Германия", ["0nlineradio", ...tags], { d: "0nlineradio.com", n: note, b: 192 });

// ---------- станции, которые используются в нескольких паках ----------
const WALM = {
  classic: S("Classic Vinyl HD", "https://icecast.walmradio.com:8443/classic", JAZ, "Ностальгия", "Нью-Йорк", ["swing", "big band", "oldies"], { k: "icecast", b: 320, d: "walmradio.com", n: "Крунеры, свинг и лёгкая оркестровая музыка 30–60-х." }),
  jazz: S("Adroit Jazz Underground", "https://icecast.walmradio.com:8443/jazz", JAZ, "Ночное", "Нью-Йорк", ["bebop", "fusion"], { k: "icecast", b: 320, d: "walmradio.com", n: "Современный и традиционный джаз без рекламы." }),
  walm2: S("WALM 2 HD", "https://icecast.walmradio.com:8443/walm2", CLA, "Спокойное", "Нью-Йорк", ["classical", "choral"], { k: "icecast", b: 320, d: "walmradio.com", n: "Классика и хоровая музыка в высоком качестве." }),
  otr: S("WALM · Old Time Radio", "https://icecast.walmradio.com:8443/otr", TLK, "Ностальгия", "Нью-Йорк", ["otr", "radio drama"], { k: "icecast", b: 128, d: "walmradio.com", n: "Радиопостановки золотого века радио." }),
};
const KEXP = S("KEXP 90.3", "https://kexp.streamguys1.com/kexp160.aac", ROK, "Энергия", "Сиэтл", ["indie", "live"], { d: "kexp.org", b: 160, n: "Независимое радио Сиэтла." });
const RP = S("Radio Paradise", "https://stream.radioparadise.com/mp3-128", IND, "Бодрое", "Парадиз", ["eclectic", "mix"], { d: "radioparadise.com", n: "Эклектичный микс без рекламы." });
const CFM = S("Classic FM", "https://media-ice.musicradio.com/ClassicFMMP3", CLA, "Спокойное", "Лондон", ["classical"], { d: "classicfm.com", n: "Крупнейшая классическая станция Британии." });
const CFM_CALM = S("Classic FM Calm", "https://media-ice.musicradio.com/ClassicFMCalmMP3", CLA, "Спокойное", "Лондон", ["calm", "romantic"], { d: "classicfm.com", n: "Тихая, умиротворяющая классика." });
const BBC_WS = S("BBC World Service", "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service", NEW, "Фокус", "Лондон", ["news", "world"], { d: "bbc.co.uk", n: "Мировые новости BBC." });
const AIRPORT = S("Airport Lounge Radio", "https://az1.mediacp.eu/listen/airport-lounge-radio/radio.mp3", AMB, "Спокойное", "Канада", ["lounge", "smooth jazz"], { n: "Лаунж и смус-джаз как в бизнес-зале." });
const IBIZA = S("Ibiza Chillout Lounge", "https://0nlineradio.radioho.st/lounge-ibiza-chillout-lounge", AMB, "Спокойное", "Германия", ["lounge", "balearic"], { b: 192, d: "0nlineradio.com", n: "Балеарик, лаунж и закат на пляже." });
const CAFE = S("Café del Mar", "https://streams.radio.co/se1a320b47/listen", AMB, "Спокойное", "Ибица", ["chillout", "sunset"], { d: "cafedelmar.com", n: "Закатный чилаут с Ибицы." });
const RDMIX = S("RdMix 70s 80s 90s", "https://cast1.torontocast.com:1830/stream", RET, "Ностальгия", "Торонто", ["70s", "80s", "90s"], { n: "Классические хиты трёх десятилетий." });
const DFM90 = S("DFM · Дискач 90-х", "https://dfm-disc90.hostingradio.ru/disc9096.aacp", RET, "Ностальгия", "Москва", ["90s", "eurodance"], { d: "dfm.ru", b: 96, n: "Евроданс и дискотека девяностых." });
const HIP100 = S("100 Hip Hop & R&B FM", "https://streaming.shoutcast.com/100-hip-hop-and-rnb-fm", HIP, "Энергия", "США", ["hiphop", "rnb"], { k: "shoutcast" });
const GFUNK = S("West Coast · G-Funk & Hip-Hop", "https://r.bgp.rodeo/listen/west_coast/radio.mp3", HIP, "Весёлое", "Лос-Анджелес", ["gfunk", "westcoast"]);
const NOVA = S("Radio Nova", "https://novazz.ice.infomaniak.ch/novazz-128.mp3", IND, "Бодрое", "Париж", ["eclectic", "funk", "hiphop"], { d: "nova.fr", n: "Эклектика: фанк, хип-хоп, world." });
const IBIZA_X = S("Ibiza X Radio", "https://stream.radiojar.com/p1f2vpv37reuv", ELE, "Весёлое", "Ибица", ["house", "ibiza"]);
const ACID = S("100% Acid Jazz", "https://mpc1.mediacp.eu:8356/stream", JAZ, "Весёлое", "Европа", ["acidjazz", "groove"]);
const INST_JAZZ = S("Instrumental Jazz", "https://jfm1.hostingradio.ru:14536/ijstream.mp3", JAZ, "Фокус", "Россия", ["instrumental", "jazz"], { b: 128 });
const PLANET = S("Planet Rock", "https://stream-mz.hellorayo.co.uk/planetrock.aac?direct=true", ROK, "Энергия", "Лондон", ["classic rock"], { b: 128, d: "planetrock.com" });
const ROCKANT = S("Rock Antenne Alternative", "https://stream.rockantenne.de/alternative/stream/mp3", ROK, "Энергия", "Мюнхен", ["alternative"], { d: "rockantenne.de" });
const NUMETAL = S("Radio BOB · Nu Metal", "https://streams.radiobob.de/numetal/mp3-192/", MET, "Энергия", "Германия", ["numetal"], { b: 192, d: "radiobob.de" });
const NTS1 = S("NTS Radio 1", "https://stream-relay-geo.ntslive.net/stream", ELE, "Ночное", "Лондон", ["curated", "underground"], { k: "icecast", d: "nts.live", n: "Лондонская андеграундная станция." });
const GOLD = S("Gold", "https://media-ssl.musicradio.com/GoldMP3", RET, "Ностальгия", "Лондон", ["oldies", "pop"], { d: "gold.co.uk" });
const OLDIE = S("Oldie Antenne", "https://s1-webradio.oldie-antenne.de/oldie-antenne", RET, "Ностальгия", "Мюнхен", ["oldies"], { d: "oldie-antenne.de" });
const RAUTE_TECHNO = S("rautemusik · Techno", "https://streams.rautemusik.fm/techno/mp3-192/", ELE, "Энергия", "Германия", ["techno"], { b: 192, d: "rautemusik.fm" });

export const PACKS: Pack[] = [
  {
    id: "somafm",
    title: "SomaFM",
    group: "Подборки",
    photo: 14062047,
    glyph: "waves",
    hue: 200,
    desc: "Независимое радио из Сан-Франциско без рекламы: каналы от эмбиента до метала.",
    stations: [
      soma("groovesalad", "Groove Salad", AMB, "Спокойное", ["downtempo", "chill"], "Плавный даунтемпо и эмбиент — идеален для работы."),
      soma("gsclassic", "Groove Salad Classic", AMB, "Спокойное", ["downtempo"], "Классическая версия Groove Salad."),
      soma("dronezone", "Drone Zone", AMB, "Фокус", ["ambient", "space"], "Атмосферные дроны и космический эмбиент."),
      soma("deepspaceone", "Deep Space One", AMB, "Ночное", ["space", "ambient"], "Глубокий космос для ночных сессий."),
      soma("spacestation", "Space Station Soma", ELE, "Бодрое", ["electronic"], "Электроника в космическом стиле."),
      soma("lush", "Lush", AMB, "Спокойное", ["vocals", "mellow"], "Мягкие женские вокалы и бархатная электроника."),
      soma("secretagent", "Secret Agent", AMB, "Ночное", ["lounge", "spy"], "Саундтрек загадочной стильной жизни."),
      soma("indiepop", "Indie Pop Rocks!", IND, "Бодрое", ["indie", "pop"], "Инди-поп и рок со всего мира."),
      soma("beatblender", "Beat Blender", ELE, "Энергия", ["deephouse", "downtempo"], "Дип-хаус и даунтемпо."),
      soma("fluid", "Fluid", HIP, "Спокойное", ["instrumental", "hiphop"], "Инструментальный хип-хоп и мягкий R&B."),
      soma("illstreet", "Illinois Street Lounge", JAZ, "Ностальгия", ["lounge", "exotica"], "Лаунж-классика 50-х и 60-х."),
      soma("thetrip", "The Trip", ELE, "Ночное", ["progressive", "trance"], "Прогрессив-хаус и транс."),
      soma("folkfwd", "Folk Forward", IND, "Спокойное", ["folk", "acoustic"], "Инди-фолк, альт-кантри и акустика."),
      soma("bootliquor", "Boot Liquor", CTY, "Ностальгия", ["americana", "country"], "Американа, альт-кантри и ранний рок."),
      soma("7soul", "Seven Inch Soul", RET, "Весёлое", ["soul", "vinyl"], "Винтажный соул на семидюймовках."),
      soma("suburbsofgoa", "Suburbs of Goa", ELE, "Энергия", ["psychill", "world"], "Индийская электроника и психил."),
      soma("poptron", "PopTron", ELE, "Весёлое", ["synthpop", "electropop"], "Электропоп и синтипоп."),
      soma("cliqhop", "cliqhop idm", ELE, "Фокус", ["idm", "glitch"], "Умная электроника: IDM и глитч."),
      soma("u80s", "Underground 80s", RET, "Ностальгия", ["80s", "newwave"], "Нью-вейв и синтипоп 80-х."),
      soma("seventies", "Left Coast 70s", RET, "Ностальгия", ["70s", "rock"], "Мягкий рок Западного побережья 70-х."),
      soma("metal", "Metal Detector", MET, "Энергия", ["metal"], "Метал всех оттенков."),
      soma("dubstep", "Dub Step Beyond", ELE, "Энергия", ["dubstep", "dub"], "Дабстеп и бас-музыка."),
      soma("reggae", "Heavyweight Reggae", REG, "Весёлое", ["reggae", "dub"], "Регги, ска и дэнсхолл.", 256),
      soma("defcon", "DEF CON Radio", ELE, "Фокус", ["hacker", "techno"], "Музыка для хакеров и разработчиков."),
      soma("vaporwaves", "Vaporwaves", ELE, "Ночное", ["vaporwave", "future funk"], "Вейпорвейв и футур-фанк."),
      soma("sonicuniverse", "Sonic Universe", JAZ, "Фокус", ["jazz", "fusion"], "Трансцендентный джаз и фьюжн."),
      soma("thistle", "ThistleRadio", IND, "Спокойное", ["celtic", "folk"], "Кельтская музыка со всего мира."),
    ],
  },
  {
    id: "chill",
    title: "Chill и Lo-Fi",
    group: "Подборки",
    photo: 34172064,
    glyph: "coffee",
    hue: 28,
    desc: "Lo-fi, лаунж и тихий эмбиент для работы, учёбы и вечера.",
    stations: [
      zero("0r-lo-fi", "Lo-Fi", AMB, "Фокус", ["lofi", "study", "chill"], "Lo-fi биты для учёбы и работы."),
      S("I Love Chillhop", "https://streams.ilovemusic.de/iloveradio17.mp3", AMB, "Спокойное", "Германия", ["chillhop", "lofi"], { b: 192, d: "ilovemusic.de", n: "Chillhop и lo-fi hip hop." }),
      S("LITT Live · Lofi", "https://das-sa39.cdnstream1.com/5582_128", AMB, "Фокус", "США", ["lofi", "jazz beats"], { n: "Lo-fi и мягкие джазовые биты." }),
      S("Box Lofi Radio", "https://stream.zeno.fm/tabzverz0fctv", AMB, "Фокус", "Гана", ["lofi", "beats"]),
      zero("lounge-coffee-bar-lounge", "Coffee Lounge", AMB, "Спокойное", ["cafe", "jazz"], "Фоновая музыка для кафе."),
      zero("lounge-piano-jazz-bar", "Piano Jazz Lounge", JAZ, "Спокойное", ["piano", "lounge"], "Мягкий фортепианный джаз."),
      zero("classical-classical-music-for-sleep", "Music for Sleep", AMB, "Ночное", ["sleep", "ambient", "piano"], "Музыка для сна и медитации."),
      IBIZA,
      CAFE,
      AIRPORT,
      S("Smooth Chill", "https://media-ssl.musicradio.com/ChillMP3", AMB, "Спокойное", "Лондон", ["chill", "smooth"], { d: "smoothradio.com" }),
      S("Chillout Ibiza FM", "https://edge3.peta.live365.net/b05055_128mp3", AMB, "Спокойное", "Ибица", ["chillout"]),
      S("Radio Paradise · Mellow", "https://stream.radioparadise.com/mellow-128", IND, "Спокойное", "Парадиз", ["mellow", "acoustic"], { d: "radioparadise.com" }),
      rec("chil", "Chill-Out", AMB, "Спокойное", ["chillout"]),
      S("Спокойное радио", "https://listen1.myradio24.com/6262", AMB, "Спокойное", "Москва", ["relax", "ambient", "nature"], { b: 320, n: "Релакс, звуки природы и лёгкий джаз." }),
      soma("groovesalad", "Groove Salad", AMB, "Спокойное", ["downtempo"], "Плавный даунтемпо."),
      soma("dronezone", "Drone Zone", AMB, "Фокус", ["ambient"], "Атмосферные дроны."),
    ],
  },
  {
    id: "jazz",
    title: "Джаз и лаунж",
    group: "Подборки",
    photo: 9002889,
    glyph: "piano",
    hue: 38,
    desc: "От биг-бэндов до современного джаза и ночного лаунжа.",
    stations: [
      WALM.classic,
      WALM.jazz,
      S("Jazz24", "https://live.wostreaming.net/direct/ppm-jazz24aac-ibc1", JAZ, "Фокус", "Сиэтл", ["jazz", "seattle"], { d: "jazz24.org" }),
      S("Radio Swiss Jazz", "https://stream.srg-ssr.ch/m/rsj/mp3_128", JAZ, "Спокойное", "Лугано", ["swiss", "jazz"], { d: "radioswissjazz.ch" }),
      fip("fipjazz", "FIP Jazz", JAZ, "Ночное", ["jazz"], "Джазовая ветка FIP."),
      S("J-Club Bandstand", "https://cast1.torontocast.com:2060/;.mp3", JAZ, "Ностальгия", "Япония", ["swing", "1940s"], { n: "Свинг и биг-бэнд 30–40-х." }),
      ACID,
      INST_JAZZ,
      S("1st Greek Jazz", "https://stream.newageradio.gr/listen/jazz/radio.aac", JAZ, "Спокойное", "Греция", ["jazz"]),
      zero("lounge-piano-jazz-bar", "Piano Jazz Lounge", JAZ, "Спокойное", ["piano", "lounge"]),
      soma("illstreet", "Illinois Street Lounge", JAZ, "Ностальгия", ["lounge"], "Лаунж-классика."),
      soma("secretagent", "Secret Agent", AMB, "Ночное", ["lounge", "spy"]),
      soma("sonicuniverse", "Sonic Universe", JAZ, "Фокус", ["jazz", "fusion"]),
      AIRPORT,
    ],
  },
  {
    id: "classical",
    title: "Классика",
    group: "Подборки",
    photo: 7095724,
    glyph: "music2",
    hue: 340,
    desc: "Классическая музыка 24/7: оркестры, камерная и хоровая.",
    stations: [
      WALM.walm2,
      CFM,
      CFM_CALM,
      S("Radio Swiss Classic", "https://stream.srg-ssr.ch/m/rsc_de/mp3_128", CLA, "Фокус", "Базель", ["classical", "swiss"], { d: "radioswissclassic.ch", n: "Классика без разговорных вставок." }),
      S("Venice Classic Radio", "https://uk2.streamingpulse.com/ssl/vcr1", CLA, "Спокойное", "Венеция", ["classical", "opera"], { n: "Итальянская классика и опера." }),
      fip("francemusique", "France Musique", CLA, "Спокойное", ["classical", "culture"], "Классика, опера и джаз."),
      S("Deutschlandfunk Kultur", "https://st02.sslstream.dlf.de/dlf/02/128/mp3/stream.mp3", TLK, "Фокус", "Берлин", ["culture", "classical"], { d: "deutschlandfunkkultur.de" }),
      zero("classical-classical-music-for-sleep", "Music for Sleep", AMB, "Ночное", ["sleep", "piano"]),
    ],
  },
  {
    id: "electronic",
    title: "Электроника и клуб",
    group: "Подборки",
    photo: 9005458,
    glyph: "audio",
    hue: 280,
    desc: "Техно, транс, драм-н-бейс, синтвейв, дип-хаус и фонк.",
    stations: [
      rec("deep", "Deep", ELE, "Ночное", ["deep house"]),
      rec("trancehouse", "Trancehouse", ELE, "Энергия", ["trance", "house"]),
      rec("trance", "Trance", ELE, "Энергия", ["trance"]),
      rec("techno", "Techno", ELE, "Энергия", ["techno"]),
      rec("dnb", "Drum'n'Bass", ELE, "Энергия", ["dnb"]),
      rec("synth", "Synthwave", ELE, "Ночное", ["synthwave", "retrowave"]),
      rec("phonk", "Phonk", HIP, "Ночное", ["phonk"]),
      rec("armin", "Armin van Buuren", ELE, "Энергия", ["trance", "asot"]),
      S("DFM · Vocal Trance", "https://dfm-trance.hostingradio.ru/trance96.aacp", ELE, "Энергия", "Москва", ["trance", "vocal"], { d: "dfm.ru", b: 96 }),
      S("Breaking Bass", "https://aircast.breaking-bass.ru:8443/air", ELE, "Энергия", "Россия", ["bass", "dnb"]),
      RAUTE_TECHNO,
      S("#100 Best Ibiza Deep House", "https://stream.zeno.fm/lwv6zqgtv1dtv", ELE, "Весёлое", "Торонто", ["deep house", "ibiza"]),
      S("Capital Dance", "https://media-ssl.musicradio.com/CapitalDance", ELE, "Энергия", "Лондон", ["dance"], { d: "capitalfm.com" }),
      IBIZA_X,
      soma("beatblender", "Beat Blender", ELE, "Энергия", ["deephouse"]),
      soma("thetrip", "The Trip", ELE, "Ночное", ["progressive"]),
      soma("defcon", "DEF CON Radio", ELE, "Фокус", ["techno", "hacker"]),
      soma("vaporwaves", "Vaporwaves", ELE, "Ночное", ["vaporwave"]),
      soma("dubstep", "Dub Step Beyond", ELE, "Энергия", ["dubstep"]),
      NTS1,
    ],
  },
  {
    id: "rock",
    title: "Инди и рок",
    group: "Подборки",
    photo: 28096553,
    glyph: "guitar",
    hue: 12,
    desc: "Живой звук, независимые лейблы и рок разных эпох.",
    stations: [
      KEXP,
      RP,
      S("Radio Paradise · Rock", "https://stream.radioparadise.com/rock-128", ROK, "Энергия", "Парадиз", ["rock"], { d: "radioparadise.com" }),
      PLANET,
      ROCKANT,
      S("Best Of Rock.FM · Alternative", "https://bestofrockfm.stream.vip/altrock/mp3-256/bestofrock.fm/", ROK, "Энергия", "Германия", ["alternative"], { b: 256 }),
      S("Rock FM · Classic Rock", "https://audiotainment-sw.streamabc.net/atsw-classicrock-mp3-128-2538548", ROK, "Ностальгия", "Германия", ["classic rock"]),
      zero("0r-80s-rock", "80s Rock", ROK, "Ностальгия", ["hard rock", "ballads"]),
      zero("0r-soft-rock", "Soft Rock", ROK, "Спокойное", ["soft rock"]),
      S("RdMix · Classic Rock", "https://cast1.torontocast.com:4610/stream", ROK, "Ностальгия", "Торонто", ["classic rock"]),
      S("Radio ROCKS Kyiv", "https://online.radioroks.ua/RadioROKS_HD", ROK, "Энергия", "Киев", ["rock"], { d: "radioroks.ua" }),
      S("Anon.FM", "https://icecast.anon.fm/radio", IND, "Ночное", "Москва", ["experimental", "psychedelic"], { k: "icecast", b: 192, n: "Экспериментальная и психоделическая музыка." }),
      soma("indiepop", "Indie Pop Rocks!", IND, "Бодрое", ["indie"]),
      soma("folkfwd", "Folk Forward", IND, "Спокойное", ["folk"]),
    ],
  },
  {
    id: "retro",
    title: "Ретро и ностальгия",
    group: "Подборки",
    photo: 8533538,
    glyph: "disc",
    hue: 50,
    desc: "50-е, 70-е, 80-е, 90-е — хиты, которые знает каждый.",
    stations: [
      S("50s 60s Retro Hits", "https://stream.zeno.fm/pxzwykxbluitv", RET, "Ностальгия", "Лацио", ["50s", "60s", "oldies"], { n: "Рок-н-ролл и хиты 50–60-х." }),
      RDMIX,
      S("RdMix DJSET 70s 80s 90s", "https://cast1.torontocast.com:4560/stream", RET, "Весёлое", "Торонто", ["djset"]),
      S("Heart 70s", "https://media-ssl.musicradio.com/Heart70sMP3", RET, "Ностальгия", "Лондон", ["70s"], { d: "heart.co.uk" }),
      S("Heart 80s", "https://media-ssl.musicradio.com/Heart80sMP3", RET, "Ностальгия", "Лондон", ["80s"], { d: "heart.co.uk" }),
      S("Heart 90s", "https://media-ssl.musicradio.com/Heart90sMP3", RET, "Ностальгия", "Лондон", ["90s"], { d: "heart.co.uk" }),
      GOLD,
      OLDIE,
      S("90s 3nergy", "https://s11.ssl-stream.com:8807/stream", RET, "Весёлое", "Европа", ["90s", "dance"]),
      S("_80 Éxitos", "https://80sexitos.stream.laut.fm/80sexitos", RET, "Ностальгия", "Испания", ["80s"]),
      soma("u80s", "Underground 80s", RET, "Ностальгия", ["80s", "newwave"]),
      soma("seventies", "Left Coast 70s", RET, "Ностальгия", ["70s"]),
      soma("7soul", "Seven Inch Soul", RET, "Весёлое", ["soul"]),
      DFM90,
      S("Дискотека 90-х · Record", "https://radiorecord.hostingradio.ru/sd9096.aacp", RET, "Ностальгия", "Москва", ["90s"], { d: "radiorecord.ru", b: 96 }),
      S("Советская эстрада", "https://evcast.mediacp.eu:2075/stream", RET, "Ностальгия", "Россия", ["ussr", "estrada"]),
      WALM.classic,
    ],
  },
  {
    id: "hiphop",
    title: "Хип-хоп и R&B",
    group: "Подборки",
    photo: 33050323,
    glyph: "mic",
    hue: 310,
    desc: "Рэп, ритм-н-блюз, фанк и урбан-музыка с разных континентов.",
    stations: [
      HIP100,
      GFUNK,
      NOVA,
      fip("mouv", "Mouv'", HIP, "Энергия", ["rap", "hiphop"], "Хип-хоп и R&B по-французски."),
      S("Los 40 Urban", "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_URBAN.mp3", HIP, "Энергия", "Мадрид", ["urban", "reggaeton"], { d: "los40.com" }),
      S("Top Urbano", "https://radio.dominiserver.com/proxy/topurbano?mp=/stream", HIP, "Весёлое", "Испания", ["urban", "latin"]),
      S("Funk the Planet", "https://streaming.live365.com/a01484", RET, "Весёлое", "США", ["funk"], { n: "Фанк, соул и диско." }),
      soma("fluid", "Fluid", HIP, "Спокойное", ["instrumental"]),
      rec("phonk", "Phonk", HIP, "Ночное", ["phonk"]),
    ],
  },
  {
    id: "metal",
    title: "Тяжёлая музыка",
    group: "Подборки",
    photo: 36257830,
    glyph: "skull",
    hue: 0,
    desc: "Хард-рок, метал, ню-метал и классика тяжёлого звука.",
    stations: [
      S("Antyradio", "https://n-4-2.dcs.redcdn.pl/sc/o2/Eurozet/live/antyradio.livx?audio=5", MET, "Энергия", "Варшава", ["rock", "metal"], { d: "antyradio.pl" }),
      S("#100 Greatest Heavy Metal", "https://cast1.torontocast.com:4660/stream", MET, "Энергия", "Торонто", ["heavy metal"]),
      S("Metal Rock Radio", "https://kathy.torontocast.com:2800/;", MET, "Энергия", "Торонто", ["metal", "rock"]),
      NUMETAL,
      S("Exclusive · Black Sabbath", "https://streaming.exclusive.radio/er/blacksabbath/icecast.audio", MET, "Ностальгия", "Германия", ["sabbath", "classic metal"], { k: "icecast" }),
      soma("metal", "Metal Detector", MET, "Энергия", ["metal"], "Метал всех оттенков."),
      PLANET,
      ROCKANT,
      S("Radio ROCKS Kyiv", "https://online.radioroks.ua/RadioROKS_HD", ROK, "Энергия", "Киев", ["rock"], { d: "radioroks.ua" }),
    ],
  },
  {
    id: "sun",
    title: "Регги и солнце",
    group: "Подборки",
    photo: 29487778,
    glyph: "sun",
    hue: 25,
    desc: "Регги, даб и балеарский чилаут для тёплого настроения.",
    stations: [
      soma("reggae", "Heavyweight Reggae", REG, "Весёлое", ["reggae", "dub"], "Регги, ска и дэнсхолл.", 256),
      S("Reggae Chill Café", "https://maggie.torontocast.com:2020/stream/reggaechillcafe", REG, "Спокойное", "Торонто", ["reggae", "chill"]),
      fip("fipreggae", "FIP Reggae", REG, "Весёлое", ["reggae", "dub"]),
      CAFE,
      IBIZA,
      IBIZA_X,
      S("Chillout Ibiza FM", "https://edge3.peta.live365.net/b05055_128mp3", AMB, "Спокойное", "Ибица", ["chillout"]),
    ],
  },
  {
    id: "roots",
    title: "Блюз, кантри и фолк",
    group: "Подборки",
    photo: 39701268,
    glyph: "guitar",
    hue: 30,
    desc: "Американа, блюз, кантри и акустика.",
    stations: [
      S("A Mississippi Blues", "https://cast1.torontocast.com:4450/;", BLU, "Спокойное", "Миссисипи", ["blues"]),
      S("24/7 Blues Radio", "https://ec3.yesstreaming.net:3685/stream", BLU, "Ночное", "США", ["blues"]),
      S("#joint radio · Blues Rock", "https://jointil.com/stream-blues", BLU, "Энергия", "Европа", ["blues rock"]),
      zero("0r-country", "Country", CTY, "Весёлое", ["nashville", "americana"]),
      S("America's Country", "https://ais-sa2.cdnstream1.com/1976_128.mp3", CTY, "Весёлое", "США", ["country"]),
      S("99.9 Kiss Country", "https://stream.revma.ihrhls.com/zc1577", CTY, "Весёлое", "США", ["country"], { d: "iheart.com" }),
      S("Smooth Country", "https://media-ssl.musicradio.com/SmoothCountry", CTY, "Спокойное", "Лондон", ["country"], { d: "smoothradio.com" }),
      S("Sertaneja 106.7", "https://sc4s.cdn.upx.com:8067/stream", CTY, "Весёлое", "Бразилия", ["sertanejo"]),
      soma("bootliquor", "Boot Liquor", CTY, "Ностальгия", ["americana"]),
      soma("folkfwd", "Folk Forward", IND, "Спокойное", ["folk"]),
    ],
  },
  {
    id: "news",
    title: "Новости и разговоры",
    group: "Подборки",
    photo: 32213239,
    glyph: "news",
    hue: 160,
    desc: "Мировые новости и общественное радио на разных языках.",
    stations: [
      BBC_WS,
      S("NPR", "https://npr-ice.streamguys1.com/live.mp3", NEW, "Фокус", "Вашингтон", ["news", "talk"], { d: "npr.org", n: "Национальное общественное радио США." }),
      S("CNN", "https://tunein.cdnstream1.com/2868_96.mp3", NEW, "Фокус", "Атланта", ["news"], { d: "cnn.com", b: 96 }),
      S("MSNBC", "https://tunein.cdnstream1.com/3511_96.mp3", NEW, "Фокус", "Нью-Йорк", ["news"], { d: "msnbc.com", b: 96 }),
      S("Fox News Radio", "https://live.amperwave.net/direct/foxnewsradio-foxnewsradioaac-imc?source=fnr.web", NEW, "Фокус", "Нью-Йорк", ["news"], { d: "foxnews.com", b: 64 }),
      S("Times Radio", "https://timesradio.wireless.radio/stream", TLK, "Фокус", "Лондон", ["news", "talk"], { d: "thetimes.co.uk", b: 127 }),
      S("talkSPORT", "https://radio.talksport.com/stream", TLK, "Энергия", "Лондон", ["sport", "talk"], { d: "talksport.com" }),
      fip("franceinfo", "franceinfo", NEW, "Фокус", ["news"], "Круглосуточные новости."),
      fip("franceinter", "France Inter", NEW, "Фокус", ["news", "talk"]),
      fip("franceculture", "France Culture", TLK, "Фокус", ["talk", "culture"], "Дискуссии, радиопостановки, документальное радио."),
      S("Deutschlandfunk", "https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3", NEW, "Фокус", "Кёльн", ["news"], { d: "deutschlandfunk.de" }),
      S("BR24", "https://dispatcher.rndfnk.com/br/br24/live/mp3/mid", NEW, "Фокус", "Мюнхен", ["news"], { d: "br.de" }),
      S("Вести FM", "https://icecast-vgtrk.cdnvideo.ru/vestifm_mp3_64kbps", NEW, "Фокус", "Москва", ["news"], { k: "icecast", b: 64 }),
      S("Бизнес FM", "https://bfm.hostingradio.ru:9075/fm", NEW, "Фокус", "Москва", ["business", "news"], { d: "bfm.ru" }),
      S("Радио Sputnik", "https://icecast-rian.cdnvideo.ru/voicerus", NEW, "Фокус", "Москва", ["news"], { k: "icecast" }),
      S("Catalunya Informació", "https://shoutcast.ccma.cat/ccma/catalunyainformacioHD.mp3", NEW, "Фокус", "Барселона", ["news", "catalan"], { k: "shoutcast", d: "ccma.cat" }),
      S("Радио Книга Вслух", "https://radio-soyuz.ru:1045/stream", TLK, "Спокойное", "Россия", ["audiobooks"], { n: "Аудиокниги в прямом эфире." }),
      WALM.otr,
    ],
  },
  {
    id: "kids",
    title: "Детям и семье",
    group: "Подборки",
    photo: 18990732,
    glyph: "baby",
    hue: 140,
    desc: "Детские песни, сказки и спокойная музыка для малышей.",
    stations: [
      S("TOGGO Radio", "https://radio.toggo.de/live/mp3-192", KID, "Весёлое", "Германия", ["kids"], { b: 192, d: "toggo.de" }),
      S("Kids Radio", "https://n03.rcs.revma.com/n7d6z9ez1duvv", KID, "Весёлое", "США", ["kids"]),
      S("Детский канал · Русское радио", "https://rr-detskijkanal.hostingradio.ru/detskijkanal96.aacp", KID, "Весёлое", "Москва", ["kids", "russian"], { b: 96 }),
    ],
  },
  {
    id: "curators",
    title: "Авторские станции",
    group: "Подборки",
    photo: 32499781,
    glyph: "radio",
    hue: 120,
    desc: "Кураторское радио, мировая музыка и пример HLS-потока.",
    stations: [
      NTS1,
      S("NTS Radio 2", "https://stream-relay-geo.ntslive.net/stream2", IND, "Ночное", "Лондон", ["curated", "world"], { k: "icecast", d: "nts.live", n: "Второй канал NTS." }),
      NOVA,
      KEXP,
      RP,
      S("Radio Swiss Pop", "https://stream.srg-ssr.ch/m/rsp/mp3_128", POP, "Бодрое", "Цюрих", ["pop", "hits"], { d: "radioswisspop.ch" }),
      S("Vivid Bharti (HLS)", "https://air.pc.cdn.bitgravity.com/air/live/pbaudio001/playlist.m3u8", CLA, "Спокойное", "Индия", ["india", "hls"], { k: "hls", b: 93, n: "Индийская станция — пример HLS-потока." }),
    ],
  },

  /* ------------------------------- страны ------------------------------- */
  {
    id: "ru",
    title: "Россия",
    group: "Страны",
    photo: 5999990,
    glyph: "landmark",
    hue: 4,
    desc: "Популярные российские станции: поп, рок, шансон, дискотека 90-х, новости.",
    stations: [
      S("Record · Main", "https://radiorecord.hostingradio.ru/rr_main96.aacp", ELE, "Энергия", "Москва", ["dance", "hits"], { d: "radiorecord.ru", b: 96, n: "Главный канал Radio Record." }),
      rec("rus", "Russian Mix", POP, "Весёлое", ["russian", "pop"], "Русские хиты и ремиксы."),
      S("Радио Ваня", "https://icecast-radiovanya.cdnvideo.ru/radiovanya", POP, "Весёлое", "Россия", ["pop", "russian"], { k: "icecast", b: 64 }),
      DFM90,
      S("DFM · Russian Dance", "https://dfm-dfmrusdance.hostingradio.ru/dfmrusdance96.aacp", ELE, "Энергия", "Москва", ["dance", "russian"], { d: "dfm.ru", b: 96 }),
      S("Русское Радио", "https://rusradio.hostingradio.ru/rusradio96.aacp", POP, "Весёлое", "Москва", ["pop", "russian"], { d: "rusradio.ru", b: 96 }),
      S("Европа Плюс", "https://ep128.hostingradio.ru:8030/ep128", POP, "Бодрое", "Москва", ["pop", "hits"], { d: "europaplus.ru" }),
      S("Наше Радио", "https://nashe1.hostingradio.ru/nashe-128.mp3", ROK, "Энергия", "Москва", ["rock", "russian"], { d: "nashe.ru" }),
      S("Максимум", "https://maximum.hostingradio.ru/maximum128.mp3", ROK, "Энергия", "Москва", ["rock", "pop"], { d: "maximum.ru" }),
      S("Радио Шансон", "https://chanson.hostingradio.ru:8041/chanson128.mp3", RET, "Ностальгия", "Москва", ["chanson"], { d: "chanson.ru" }),
      S("Монте-Карло", "https://montecarlo.hostingradio.ru/montecarlo128.mp3", AMB, "Спокойное", "Москва", ["lounge", "pop"], { d: "radiomontecarlo.ru" }),
      S("Радио Звезда", "https://icecast-zvezda.mediacdn.ru/radio/zvezda/zvezda_128", TLK, "Фокус", "Москва", ["news", "history"], { k: "icecast" }),
      S("Соловьёв FM", "https://solovievfm.hostingradio.ru/solovievfm128.aacp", TLK, "Фокус", "Москва", ["talk"]),
      S("Mixadance FM", "https://stream.mixadance.fm/mixadance", ELE, "Энергия", "Россия", ["dance", "mix"]),
      S("Спокойное радио", "https://listen1.myradio24.com/6262", AMB, "Спокойное", "Москва", ["relax", "ambient"], { b: 320 }),
      INST_JAZZ,
      S("Советская эстрада", "https://evcast.mediacp.eu:2075/stream", RET, "Ностальгия", "Россия", ["ussr", "estrada"]),
    ],
  },
  {
    id: "fr",
    title: "Франция",
    group: "Страны",
    photo: 34207006,
    glyph: "landmark",
    hue: 220,
    desc: "FIP и другие каналы Radio France: музыка без границ жанров.",
    stations: [
      fip("fip", "FIP", IND, "Бодрое", ["eclectic", "world", "jazz"], "Эклектика: джаз, рок, электроника, world."),
      fip("fipgroove", "FIP Groove", RET, "Весёлое", ["groove", "funk", "soul"], "Фанк, соул и R&B."),
      fip("fipworld", "FIP Monde", IND, "Бодрое", ["world"], "Музыка мира."),
      fip("fipelectro", "FIP Electro", ELE, "Энергия", ["electro"]),
      fip("fiprock", "FIP Rock", ROK, "Энергия", ["rock"]),
      fip("fipjazz", "FIP Jazz", JAZ, "Ночное", ["jazz"]),
      fip("fipreggae", "FIP Reggae", REG, "Весёлое", ["reggae"]),
      fip("fipnouveautes", "FIP Nouveautés", IND, "Бодрое", ["new"]),
      fip("fippop", "FIP Pop", POP, "Бодрое", ["pop"]),
      fip("francemusique", "France Musique", CLA, "Спокойное", ["classical"]),
      fip("franceculture", "France Culture", TLK, "Фокус", ["talk", "culture"]),
      fip("franceinter", "France Inter", NEW, "Фокус", ["news", "talk"]),
      fip("franceinfo", "franceinfo", NEW, "Фокус", ["news"]),
      fip("mouv", "Mouv'", HIP, "Энергия", ["rap"]),
      NOVA,
    ],
  },
  {
    id: "de",
    title: "Германия",
    group: "Страны",
    photo: 5617428,
    glyph: "landmark",
    hue: 45,
    desc: "Общественное радио ARD, поп-волны и немецкие онлайн-станции.",
    stations: [
      S("Deutschlandfunk", "https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3", NEW, "Фокус", "Кёльн", ["news"], { d: "deutschlandfunk.de" }),
      S("Deutschlandfunk Kultur", "https://st02.sslstream.dlf.de/dlf/02/128/mp3/stream.mp3", TLK, "Фокус", "Берлин", ["culture"], { d: "deutschlandfunkkultur.de" }),
      S("SWR3", "https://liveradio.swr.de/sw282p3/swr3/play.mp3", POP, "Бодрое", "Баден-Баден", ["pop", "hits"], { d: "swr3.de" }),
      S("Bayern 3", "https://dispatcher.rndfnk.com/br/br3/live/mp3/mid", POP, "Бодрое", "Мюнхен", ["pop"], { d: "br.de" }),
      S("Bayern 1", "https://dispatcher.rndfnk.com/br/br1/obb/mp3/mid", RET, "Спокойное", "Мюнхен", ["schlager", "oldies"], { d: "br.de" }),
      S("Bayern 2", "https://dispatcher.rndfnk.com/br/br2/live/mp3/mid", TLK, "Фокус", "Мюнхен", ["talk", "culture"], { d: "br.de" }),
      S("BR24", "https://dispatcher.rndfnk.com/br/br24/live/mp3/mid", NEW, "Фокус", "Мюнхен", ["news"], { d: "br.de" }),
      S("1LIVE", "https://wdr-1live-live.icecastssl.wdr.de/wdr/1live/live/mp3/128/stream.mp3", POP, "Энергия", "Кёльн", ["pop", "youth"], { d: "1live.de" }),
      S("WDR 4", "https://wdr-wdr4-live.icecastssl.wdr.de/wdr/wdr4/live/mp3/128/stream.mp3", RET, "Ностальгия", "Кёльн", ["oldies", "schlager"], { d: "wdr.de" }),
      S("bigFM", "https://stream.bigfm.de/deutschland/mp3-128/radio-browser", POP, "Энергия", "Германия", ["hits", "dance"], { d: "bigfm.de" }),
      OLDIE,
      ROCKANT,
      NUMETAL,
      RAUTE_TECHNO,
      S("MANGORADIO", "https://mangoradio.stream.laut.fm/mangoradio", POP, "Бодрое", "Германия", ["pop", "indie"]),
      S("TOGGO Radio", "https://radio.toggo.de/live/mp3-192", KID, "Весёлое", "Германия", ["kids"], { b: 192, d: "toggo.de" }),
    ],
  },
  {
    id: "uk",
    title: "Великобритания",
    group: "Страны",
    photo: 11567961,
    glyph: "landmark",
    hue: 350,
    desc: "BBC, Global и Bauer: от поп-хитов до новостей и спортивных эфиров.",
    stations: [
      BBC_WS,
      S("Capital UK", "https://media-ssl.musicradio.com/CapitalUK", POP, "Весёлое", "Лондон", ["pop", "hits"], { d: "capitalfm.com" }),
      S("Capital Dance", "https://media-ssl.musicradio.com/CapitalDance", ELE, "Энергия", "Лондон", ["dance"], { d: "capitalfm.com" }),
      S("Heart Dance", "https://media-ssl.musicradio.com/HeartDanceMP3", ELE, "Энергия", "Лондон", ["dance"], { d: "heart.co.uk" }),
      S("Heart 70s", "https://media-ssl.musicradio.com/Heart70sMP3", RET, "Ностальгия", "Лондон", ["70s"], { d: "heart.co.uk" }),
      S("Heart 80s", "https://media-ssl.musicradio.com/Heart80sMP3", RET, "Ностальгия", "Лондон", ["80s"], { d: "heart.co.uk" }),
      S("Heart 90s", "https://media-ssl.musicradio.com/Heart90sMP3", RET, "Ностальгия", "Лондон", ["90s"], { d: "heart.co.uk" }),
      GOLD,
      S("Smooth Chill", "https://media-ssl.musicradio.com/ChillMP3", AMB, "Спокойное", "Лондон", ["chill"], { d: "smoothradio.com" }),
      S("Smooth Country", "https://media-ssl.musicradio.com/SmoothCountry", CTY, "Спокойное", "Лондон", ["country"], { d: "smoothradio.com" }),
      CFM,
      CFM_CALM,
      S("Virgin Radio UK", "https://radio.virginradio.co.uk/stream", ROK, "Энергия", "Лондон", ["rock", "pop"], { d: "virginradio.co.uk" }),
      PLANET,
      S("Times Radio", "https://timesradio.wireless.radio/stream", TLK, "Фокус", "Лондон", ["news", "talk"], { d: "thetimes.co.uk", b: 127 }),
      S("talkSPORT", "https://radio.talksport.com/stream", TLK, "Энергия", "Лондон", ["sport"], { d: "talksport.com" }),
      S("Intamixx 80s 90s", "https://radio.intamixx.uk:8443/radio2", RET, "Весёлое", "Великобритания", ["80s", "90s"]),
    ],
  },
  {
    id: "us",
    title: "США",
    group: "Страны",
    photo: 8569166,
    glyph: "landmark",
    hue: 215,
    desc: "Хит-радио, кантри, новости и независимые станции из Америки.",
    stations: [
      WALM.classic,
      WALM.jazz,
      WALM.walm2,
      WALM.otr,
      KEXP,
      RP,
      S("102.7 KIIS FM", "https://stream.revma.ihrhls.com/zc185", POP, "Весёлое", "Лос-Анджелес", ["pop", "hits"], { d: "iheart.com" }),
      S("Z100", "https://stream.revma.ihrhls.com/zc1469", POP, "Бодрое", "Нью-Йорк", ["pop", "hits"], { d: "iheart.com" }),
      S("America's Country", "https://ais-sa2.cdnstream1.com/1976_128.mp3", CTY, "Весёлое", "США", ["country"]),
      S("99.9 Kiss Country", "https://stream.revma.ihrhls.com/zc1577", CTY, "Весёлое", "США", ["country"], { d: "iheart.com" }),
      HIP100,
      GFUNK,
      S("Jazz24", "https://live.wostreaming.net/direct/ppm-jazz24aac-ibc1", JAZ, "Фокус", "Сиэтл", ["jazz"], { d: "jazz24.org" }),
      S("CNN", "https://tunein.cdnstream1.com/2868_96.mp3", NEW, "Фокус", "Атланта", ["news"], { d: "cnn.com", b: 96 }),
      S("NPR", "https://npr-ice.streamguys1.com/live.mp3", NEW, "Фокус", "Вашингтон", ["news", "talk"], { d: "npr.org" }),
    ],
  },
  {
    id: "it",
    title: "Италия",
    group: "Страны",
    photo: 9841618,
    glyph: "landmark",
    hue: 130,
    desc: "Национальные сети Италии: Radio Deejay, RTL 102.5, Radio Italia и другие. Многие — через HLS.",
    stations: [
      S("Radio Deejay", "https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiodeejay/radiodeejay/master_ma.m3u8", POP, "Бодрое", "Милан", ["pop", "talk"], { k: "hls", b: 96, d: "deejay.it" }),
      S("Radio Italia · Solo Musica Italiana", "https://radioitaliasmi.akamaized.net/hls/live/2093120/RISMI/stream01/streamPlaylist.m3u8", POP, "Весёлое", "Милан", ["italian pop"], { k: "hls", b: 96, d: "radioitalia.it" }),
      S("RTL 102.5", "https://dd782ed59e2a4e86aabf6fc508674b59.msvdn.net/live/S97044836/tbbP8T1ZRPBL/playlist_audio.m3u8", POP, "Бодрое", "Милан", ["pop", "hits"], { k: "hls", b: 96, d: "rtl.it" }),
      S("RTL 102.5 Disco", "https://dd782ed59e2a4e86aabf6fc508674b59.msvdn.net/live/S51100361/Sz3kCA55PrRh/playlist_audio.m3u8", RET, "Весёлое", "Милан", ["disco"], { k: "hls", b: 96, d: "rtl.it" }),
      S("Radio 105", "https://icecast.unitedradio.it/Radio105.mp3", POP, "Энергия", "Милан", ["pop"], { k: "icecast", d: "105.net" }),
      S("Virgin Radio Italy", "https://icy.unitedradio.it/Virgin.mp3", ROK, "Энергия", "Милан", ["rock"], { k: "icecast", d: "virginradio.it" }),
      S("Radio M2O", "https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiom2o/radiom2o/master_ma.m3u8", ELE, "Энергия", "Милан", ["dance"], { k: "hls", b: 96, d: "m2o.it" }),
      S("Radio Freccia", "https://dd782ed59e2a4e86aabf6fc508674b59.msvdn.net/live/S3160845/0tuSetc8UFkF/playlist_audio.m3u8", ROK, "Энергия", "Милан", ["rock"], { k: "hls", b: 96, d: "radiofreccia.it" }),
      S("Deejay 80", "https://4c4b867c89244861ac216426883d1ad0.msvdn.net/webradio/deejay80/playlist.m3u8", RET, "Ностальгия", "Милан", ["80s"], { k: "hls", b: 96, d: "deejay.it" }),
      S("RDS · Grandi Successi", "https://stream.rds.radio/audio/rds.stream_aac64/chunklist.m3u8", POP, "Весёлое", "Рим", ["hits"], { k: "hls", b: 64, d: "rds.it" }),
      S("70 80 90", "https://rblive.it:8170/radio.mp3", RET, "Ностальгия", "Италия", ["70s", "80s", "90s"]),
      S("Classic Hits Radio Italia", "https://classichitsradio.streamingmedia.it/play", RET, "Ностальгия", "Италия", ["classic hits"]),
      S("Funky Radio", "https://funkyradio.streamingmedia.it/play.mp3", RET, "Весёлое", "Италия", ["funk", "soul"]),
      S("Radio Sportiva", "https://sportiva.inmystream.it/stream/sportiva", TLK, "Энергия", "Италия", ["sport"]),
    ],
  },
  {
    id: "es",
    title: "Испания",
    group: "Страны",
    photo: 15949260,
    glyph: "landmark",
    hue: 40,
    desc: "LOS40, RNE, Cadena SER и каталонское радио.",
    stations: [
      S("LOS40", "https://playerservices.streamtheworld.com/api/livestream-redirect/Los40.mp3", POP, "Бодрое", "Мадрид", ["pop", "hits"], { d: "los40.com" }),
      S("LOS40 Classic", "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_CLASSIC.mp3", RET, "Ностальгия", "Мадрид", ["classic hits"], { d: "los40.com" }),
      S("LOS40 Urban", "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_URBAN.mp3", HIP, "Энергия", "Мадрид", ["urban"], { d: "los40.com" }),
      S("Cadena 100", "https://cadena100-cope.flumotion.com/chunks.m3u8", POP, "Спокойное", "Мадрид", ["pop"], { k: "hls", d: "cadena100.es" }),
      S("RNE Radio 3", "https://rtvelivestream.rtve.es/rtvesec/rne/rne_r3_main.m3u8", IND, "Бодрое", "Мадрид", ["indie", "alternative"], { k: "hls", d: "rtve.es" }),
      S("Onda Cero", "https://atres-live.ondacero.es/live/ondacero/bitrate_1.m3u8", NEW, "Фокус", "Мадрид", ["news", "talk"], { k: "hls", d: "ondacero.es" }),
      S("RAC1", "https://playerservices.streamtheworld.com/api/livestream-redirect/RAC_1.mp3", TLK, "Фокус", "Барселона", ["talk", "catalan"], { d: "rac1.cat" }),
      S("Cadena SER · Ràdio Barcelona", "https://playerservices.streamtheworld.com/api/livestream-redirect/SER_BARCELONA.mp3", NEW, "Фокус", "Барселона", ["news"], { d: "cadenaser.com" }),
      S("Catalunya Informació", "https://shoutcast.ccma.cat/ccma/catalunyainformacioHD.mp3", NEW, "Фокус", "Барселона", ["news"], { k: "shoutcast", d: "ccma.cat" }),
      CAFE,
      IBIZA_X,
      S("_80 Éxitos", "https://80sexitos.stream.laut.fm/80sexitos", RET, "Ностальгия", "Испания", ["80s"]),
      S("Top Urbano", "https://radio.dominiserver.com/proxy/topurbano?mp=/stream", HIP, "Весёлое", "Испания", ["urban", "latin"]),
    ],
  },
  {
    id: "jp",
    title: "Япония и аниме",
    group: "Страны",
    photo: 32549998,
    glyph: "landmark",
    hue: 335,
    desc: "J-Pop, сити-поп, аниме-радио и NHK World.",
    stations: [
      S("LISTEN.moe · J-Pop", "https://listen.moe/stream", POP, "Весёлое", "Япония", ["jpop", "anime"], { b: 192, d: "listen.moe" }),
      S("R/a/dio", "https://relay0.r-a-d.io/main.mp3", POP, "Весёлое", "Япония", ["anime", "jpop"], { d: "r-a-d.io" }),
      S("Stereo Anime", "https://radio.stereoanime.com/listen/stereoanime/128", POP, "Бодрое", "Япония", ["anime"]),
      S("J-Pop Sakura", "https://quincy.torontocast.com:2070/stream.mp3", POP, "Бодрое", "Япония", ["jpop"]),
      S("BOX · Japan City Pop", "https://play.streamafrica.net/japancitypop", RET, "Ночное", "Япония", ["citypop"], { n: "Сити-поп 80-х." }),
      S("NHK World Radio", "https://nhkworld-radio.nhkworld.jp/hls/live/nhkworld-radio-media2/index.m3u8", NEW, "Фокус", "Токио", ["news"], { k: "hls", d: "nhk.or.jp" }),
      S("Hitsujikai Radio", "https://streaming.radio.co/se4a8e6a93/listen", AMB, "Спокойное", "Япония", ["lofi", "ambient"]),
      S("Gotanno FM", "https://radio.gotanno.love/;", AMB, "Спокойное", "Япония", ["chill"]),
      S("J-Club Bandstand", "https://cast1.torontocast.com:2060/;.mp3", JAZ, "Ностальгия", "Япония", ["swing"]),
    ],
  },
  {
    id: "chanson",
    title: "Шансон и песня",
    group: "Подборки",
    photo: 3355319,
    glyph: "mic",
    hue: 18,
    desc: "Русский шансон и французская песня: Chante France, FIP «Sacré Français», Nostalgie.",
    stations: [
      S("Волшебный шансон", "https://chanson.hostingradio.ru:8041/chanson128.mp3", "Шансон", "Ностальгия", "Москва", ["chanson", "russian"], { d: "chanson.ru", n: "Русский шансон круглосуточно." }),
      S("Chante France 80's", "https://chantefrance80s.ice.infomaniak.ch/chantefrance80s-128.mp3", "Шансон", "Ностальгия", "Франция", ["chanson", "80s", "french"], { n: "Французская песня 80-х." }),
      S("Chante France 70's", "https://chantefrance70s.ice.infomaniak.ch/chantefrance70s-128.mp3", "Шансон", "Ностальгия", "Франция", ["chanson", "70s", "french"], { n: "Французская песня 70-х." }),
      S("Chante France Emotion", "https://chantefranceemotion.ice.infomaniak.ch/chantefranceemotion-128.mp3", "Шансон", "Спокойное", "Франция", ["chanson", "ballads", "french"], { n: "Лирические баллады." }),
      S("Chante France Nouveautés", "https://chantefrancenouveautes.ice.infomaniak.ch/chantefrancenouveautes-128.mp3", "Шансон", "Бодрое", "Франция", ["chanson", "new", "french"]),
      S("Chansons oubliées ou presque", "https://manager7.streamradio.fr:2580/stream", "Шансон", "Ностальгия", "Франция", ["chanson", "oldies", "french"], { n: "Забытые песни прошлых лет." }),
      S("Radio La Belle Aventure", "https://flux.radiolabelleaventure.com/listen/radio_la_belle_aventure/radio.mp3", "Шансон", "Спокойное", "Франция", ["chanson", "french"]),
      S("FIP Sacré Français", "https://stream.radiofrance.fr/fipsacrefrancais/fipsacrefrancais.m3u8?id=radiofrance", "Шансон", "Бодрое", "Париж", ["chanson", "french", "radiofrance"], { k: "hls", d: "radiofrance.fr", b: 96 }),
      S("Nostalgie Belgique", "https://stream.rcs.revma.com/5gd04cwptg0uv", RET, "Ностальгия", "Бельгия", ["oldies", "french"]),
    ],
  },
];

export const ALL_PACK_STATIONS: Draft[] = (() => {
  const seen = new Set<string>();
  const out: Draft[] = [];
  PACKS.forEach((p) =>
    p.stations.forEach((s) => {
      if (s.url && !seen.has(s.url)) {
        seen.add(s.url);
        out.push(s);
      }
    })
  );
  return out;
})();

