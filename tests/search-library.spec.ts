import { expect, test, type Page } from "@playwright/test";
import { artworkUrl } from "../src/lib/artwork";
import { Buffer } from "node:buffer";

const art = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2094a9"/><circle cx="16" cy="16" r="8" fill="#f9c36b"/></svg>').toString("base64");
function wav() {
  const sr=8000,n=sr*90,b=Buffer.alloc(44+n*2); b.write("RIFF");b.writeUInt32LE(b.length-8,4);b.write("WAVEfmt ",8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.sin(i/sr*440*Math.PI*2)*1000|0,44+i*2);return b;
}
async function boot(page: Page, width=390) {
  await page.setViewportSize({width,height:900});
  await page.addInitScript(() => localStorage.setItem("pr.guest","1"));
  await page.goto("/");
  await expect(page.getByRole("button",{name:/Быстрый старт/}).first()).toBeVisible();
}
async function collections(page: Page) {
  await page.getByRole("navigation",{name:"Разделы",exact:true}).getByRole("button",{name:/^Обзор(?: \d)?$/}).click();
  if (page.viewportSize()!.width < 768) await page.getByLabel("Раздел обзора").selectOption("collections");
  else await page.getByRole("button",{name:"Музыка офлайн",exact:true}).click();
}
async function seedOffline(page: Page) {
  await page.evaluate(async ({wave,art}) => {
    const {db,draftToStation}=await import("/src/lib/db.ts");
    const {createPlaylist}=await import("/src/lib/playlists.ts");
    const {putOfflineBlob}=await import("/src/lib/offline.ts");
    const bytes=Uint8Array.from(atob(wave),c=>c.charCodeAt(0));
    const a={id:"offline-a",title:"Ёлка у моря",subtitle:"Björk",album:"Летний вечер",url:"https://audio.example.test/a.wav",kind:"vod" as const,addedAt:1};
    const b={id:"offline-b",title:"Тихий свет",subtitle:"Кино",album:"Ночная смена",url:"https://local.pocket-radio.invalid/offline-b",kind:"vod" as const,local:true,addedAt:2};
    const missing={...b,id:"missing-file",title:"Потерянный файл",url:"https://local.pocket-radio.invalid/missing"};
    await createPlaylist("Поездка к морю",[a,b,missing],{cover:art});
    await createPlaylist("Любимое",[a],{cover:art});
    await putOfflineBlob("pli:offline-a",a.url,bytes,"audio/wav",bytes.length);
    await putOfflineBlob("pli:offline-b",b.url,bytes,"audio/wav",bytes.length);
    await db.offline.put({stationId:"pli:missing-file",size:300,ts:1});
    const station=draftToStation({name:"Запись эфира",url:"https://audio.example.test/c.wav",kind:"vod",genre:"Джаз",logo:art});
    await db.stations.put(station);await putOfflineBlob(station.id,station.url,bytes,"audio/wav",bytes.length);
  },{wave:wav().toString("base64"),art});
}
const device = (page: Page) => page.getByRole("region",{name:"Музыка на устройстве",exact:true});
async function openDevice(page: Page) {
  await collections(page);
  await page.getByRole("button",{name:/^На устройстве/}).click();
  await expect(device(page).getByRole("status")).not.toContainText("Проверяем");
}

test("artwork policy upgrades legacy logos but rejects unsafe and generated sources", () => {
  expect(artworkUrl("http://example.test/logo.ico")).toBe("https://example.test/logo.ico");
  expect(artworkUrl("//example.test/logo.png")).toBe("https://example.test/logo.png");
  expect(artworkUrl(art)).toBe(art);
  for (const value of ["javascript:alert(1)","https://user:password@example.test/a.png","https://archive.org/services/img/a","not a url"]) expect(artworkUrl(value)).toBeUndefined();
});

test("offline library joins all playlists, verifies real files, deduplicates and searches metadata", async ({page}) => {
  await boot(page);await seedOffline(page);await openDevice(page);
  await expect(device(page).locator("[data-offline-track]")).toHaveCount(3);
  await expect(device(page).getByText("Потерянный файл",{exact:true})).toHaveCount(0);
  const query=page.getByRole("searchbox",{name:"Поиск по музыке на устройстве"});
  for (const term of ["елка bjork","вечер моря","любимое"]) {
    await query.fill(term);
    await expect(device(page).locator("[data-offline-track]")).toHaveCount(1);
    await expect(device(page).locator("[data-offline-track]")).toContainText("Ёлка у моря");
  }
  await query.fill("");await device(page).getByRole("button",{name:"Свои файлы",exact:true}).click();
  await expect(device(page).locator("[data-offline-track]")).toHaveCount(1);
  await expect(device(page).locator("[data-offline-track]")).toContainText("Тихий свет");
  await device(page).getByRole("button",{name:"Скачанное",exact:true}).click();
  await expect(device(page).locator("[data-offline-track]")).toHaveCount(2);
  await query.fill("ничего подобного");
  await expect(device(page).getByRole("heading",{name:"Нет совпадений"})).toBeVisible();
  await device(page).getByRole("button",{name:"Сбросить поиск и фильтр"}).click();
  await expect(device(page).locator("[data-offline-track]")).toHaveCount(3);
  await page.reload();await collections(page);
  await expect(device(page)).toBeVisible();
});

test("cached search and filtered playback work with network disconnected", async ({page,context}) => {
  await boot(page);await seedOffline(page);await openDevice(page);
  await page.evaluate(async()=>{(window as any).__offlinePlayer=(await import("/src/lib/player.ts")).player;});
  await context.setOffline(true);
  await page.getByRole("searchbox",{name:"Поиск по музыке на устройстве"}).fill("кино смена");
  await expect(device(page).locator("[data-offline-track]")).toHaveCount(1);
  await device(page).getByRole("button",{name:"Слушать найденное",exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>{const p=(window as any).__offlinePlayer.getState();return {status:p.status,cached:p.fromCache,queue:p.queue};})).toEqual({status:"playing",cached:true,queue:["pli:offline-b"]});
  await expect(device(page).locator('.cover')).toHaveAttribute("data-artwork","ready");
  await device(page).getByRole("button",{name:"Пауза: Тихий свет",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__offlinePlayer.getState().status)).toBe("paused");
  await context.setOffline(false);
});

test("station search paginates raw provider pages, including transliteration and duplicates", async ({page}) => {
  const offsets: number[]=[];
  await page.route("**/api/radio-browser/**",async route=>{
    const url=new URL(route.request().url());
    if(!url.pathname.endsWith("/search")){await route.fulfill({json:[]});return;}
    const offset=Number(url.searchParams.get("offset"));offsets.push(offset);
    const variant=url.searchParams.get("name")?.startsWith("ретро")?"cyr":"lat";
    const count=offset===0?30:1;
    await route.fulfill({json:Array.from({length:count},(_,i)=>({stationuuid:`${variant}-${offset+i}`,name:`Retro ${variant} ${offset+i}`,url:`https://audio.example.test/${variant}/${offset+i}`,url_resolved:"",tags:"pop",favicon:"",countrycode:"DE",votes:1,codec:"MP3",bitrate:128}))});
  });
  await boot(page);await page.getByRole("button",{name:"Обзор",exact:true}).click();await page.getByLabel("Раздел обзора").selectOption("search");
  await page.getByRole("textbox",{name:"Поиск радиостанций",exact:true}).fill("ретро");
  await expect(page.getByText("Найдено: 60",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Показать ещё",exact:true}).click();
  await expect(page.getByText("Найдено: 62",{exact:true})).toBeVisible();
  expect(offsets).toContain(30);expect(offsets).not.toContain(60);
  await expect(page.getByRole("button",{name:"Показать ещё",exact:true})).toHaveCount(0);
});

test("provider pagination does not stop after filtering duplicates or invalid streams", async ({page}) => {
  await boot(page);
  await page.route("**/api/radio-browser/search**",async route=>{
    const offset=Number(new URL(route.request().url()).searchParams.get("offset"));
    await route.fulfill({json:offset===0?Array.from({length:30},(_,i)=>({stationuuid:String(i),name:"Duplicates",url:i<10?"https://audio.example.test/Station":i<20?"https://audio.example.test/station":"https://",url_resolved:"",tags:"",favicon:"",countrycode:"",votes:1,codec:"MP3",bitrate:128})):[]});
  });
  const result=await page.evaluate(async()=>(await import("/src/lib/radiobrowser.ts")).searchStationsPage({limit:30,offset:0}));
  expect(result.items).toHaveLength(2);expect(result.hasMore).toBe(true);expect(result.nextOffset).toBe(30);
});

test("music source switching preserves the submitted query and retries the failed page", async ({page}) => {
  let fail=true;const pages:number[]=[];
  const track=(id:string)=>({id,title:`Song ${id}`,creator:"Test Artist",url:`https://audio.example.test/${id}.mp3`,foreign_landing_url:`https://example.test/${id}`,license:"by",license_url:"https://creativecommons.org/licenses/by/4.0/",source:"jamendo",category:"music",filetype:"mp3",duration:90000});
  await page.route("https://api.openverse.org/v1/audio/**",async route=>{const pg=Number(new URL(route.request().url()).searchParams.get("page")||1);pages.push(pg);if(pg===2&&fail){await route.fulfill({status:503,json:{detail:"temporary"}});return;}await route.fulfill({json:{page:pg,page_count:2,results:[track(String(pg))]}});});
  let commons="";
  await page.route("https://commons.wikimedia.org/w/api.php**",async route=>{commons=new URL(route.request().url()).searchParams.get("gsrsearch")||"";await route.fulfill({json:{query:{pages:{}}}});});
  await boot(page);await collections(page);await page.getByLabel("Источник музыки").selectOption("openverse");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Test Artist");await page.getByRole("button",{name:"Найти",exact:true}).click();
  await expect(page.locator("[data-provider-track]")).toHaveCount(1);
  await page.getByRole("button",{name:"Показать ещё",exact:true}).click();await expect(page.getByRole("button",{name:"Повторить",exact:true})).toBeVisible();
  fail=false;await page.getByRole("button",{name:"Повторить",exact:true}).click();await expect(page.locator("[data-provider-track]")).toHaveCount(2);expect(pages.at(-1)).toBe(2);
  await page.getByLabel("Источник музыки").selectOption("commons");await expect.poll(()=>commons).toContain("Test Artist");await expect(page.getByLabel("Запрос для поиска офлайн-музыки")).toHaveValue("Test Artist");
  await page.getByRole("button",{name:/^На устройстве/}).click();await expect(device(page)).toBeVisible();await page.getByRole("group",{name:"Где искать музыку"}).getByRole("button",{name:/^Найти музыку/}).click();await expect(page.getByLabel("Запрос для поиска офлайн-музыки")).toHaveValue("Test Artist");
});

for(const width of [320,390,768,1440]) test(`offline and online music search fit all app interfaces at ${width}px`,async({page})=>{
  test.setTimeout(120_000);await boot(page,width);await seedOffline(page);await openDevice(page);
  if(width===320)await page.evaluate(async()=>(await import("/src/lib/uiStyle.ts")).setUiPrefs({scale:125,reduceMotion:true}));
  for(const design of ["classic","panorama","focus","atelier","nocturne","editorial","library","console"] as const){
    await page.evaluate(async design=>(await import("/src/lib/appDesign.ts")).applyAppDesign(design),design);
    await expect(device(page).locator("[data-offline-track]")).toHaveCount(3);
    expect(await device(page).locator("h2").evaluate(e=>e.scrollWidth-e.clientWidth),design+" heading").toBeLessThanOrEqual(1);
    for(const mode of ["device","find"]){
      await page.getByRole("group",{name:"Где искать музыку"}).getByRole("button",{name:mode==="device"?/^На устройстве/:/^Найти музыку/}).click();
      const geometry=await page.locator(".music-workspace").evaluate(e=>({overflow:e.scrollWidth-e.clientWidth,controls:[...e.querySelectorAll("button,input,select")].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1);}).map(el=>el.getAttribute("aria-label")||el.textContent)}));
      expect(geometry.overflow,design+mode).toBeLessThanOrEqual(1);
      // Quick suggestions intentionally scroll horizontally inside their own carousel.
      expect(geometry.controls.filter(t=>!t?.startsWith("Быстрый поиск:")),design+mode).toEqual([]);
    }
    await page.getByRole("button",{name:/^На устройстве/}).click();
  }
});

test("32px logos render in all new styles and retry after a transient offline failure", async ({page}) => {
  let broken=true;
  await page.route("https://img.example.test/logo.svg",route=>broken?route.abort():route.fulfill({contentType:"image/svg+xml",body:Buffer.from(art.split(",")[1],"base64")}));
  await boot(page,1440);
  await page.evaluate(async()=>{const {db,draftToStation}=await import("/src/lib/db.ts");await db.stations.put(draftToStation({name:"Small logo station",url:"https://stream.example.test/a",logo:"https://img.example.test/logo.svg"}));});
  await page.evaluate(async()=>(await import("/src/lib/appDesign.ts")).applyAppDesign("focus"));
  const cover=page.locator(".focus-feature-art .cover");await expect(cover).toHaveAttribute("data-artwork","error");
  broken=false;await page.evaluate(()=>window.dispatchEvent(new Event("online")));await expect(cover).toHaveAttribute("data-artwork","ready");
  for(const design of ["panorama","focus","atelier","nocturne","editorial","library","console"] as const){
    await page.evaluate(async design=>(await import("/src/lib/appDesign.ts")).applyAppDesign(design),design);
    const covers=page.getByRole("main").locator('.cover:visible img[src="https://img.example.test/logo.svg"]');
    await expect(covers.first()).toBeVisible();
    expect(await covers.first().evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBe(32);
    await expect(covers.first()).toHaveCSS("opacity","1");
  }
});

test("playlist cover reaches tracks without individual artwork, including after reload", async ({page})=>{
  await boot(page);await seedOffline(page);
  await page.evaluate(async()=>{const {listPlaylists,playPlaylist}=await import("/src/lib/playlists.ts");const pl=(await listPlaylists()).find(p=>p.name==="Поездка к морю")!;await playPlaylist(pl,{startId:"offline-b"});});
  await expect.poll(()=>page.evaluate(async()=>(await import("/src/lib/player.ts")).player.getState().station?.logo)).toBe(art);
  await page.reload();await expect.poll(()=>page.evaluate(async()=>(await import("/src/lib/player.ts")).player.getState().station?.logo)).toBe(art);
});


test("embedded MP3 cover and album are retained on local import and reload", async ({page}) => {
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAY0lEQVR4nO3PQQ3AIADAQMAQHtGEwIngcVnSU9DOfe74s6UDXjWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgfYrSAeWbdPPDAAAAAElFTkSuQmCC","base64");
  const frame=(name:string,data:Buffer)=>{const h=Buffer.alloc(10);h.write(name);h.writeUInt32BE(data.length,4);return Buffer.concat([h,data]);};
  const text=(name:string,value:string)=>frame(name,Buffer.concat([Buffer.from([3]),Buffer.from(value)]));
  const body=Buffer.concat([text("TIT2","Песня с обложкой"),text("TPE1","Локальный исполнитель"),text("TALB","Альбом с устройства"),frame("APIC",Buffer.concat([Buffer.from([0]),Buffer.from("image/png\0"),Buffer.from([3,0]),png]))]);
  const header=Buffer.from([73,68,51,3,0,0,(body.length>>21)&127,(body.length>>14)&127,(body.length>>7)&127,body.length&127]);
  await boot(page);await openDevice(page);
  await page.getByLabel("Аудиофайлы с устройства").setInputFiles({name:"local-cover.mp3",mimeType:"audio/mpeg",buffer:Buffer.concat([header,body,Buffer.alloc(256)])});
  await expect(device(page).locator("[data-offline-track]")).toHaveCount(1,{timeout:15000});
  await expect(device(page).locator(".cover")).toHaveAttribute("data-artwork","ready");
  await page.getByRole("searchbox",{name:"Поиск по музыке на устройстве"}).fill("альбом устройства");
  await expect(device(page).locator("[data-offline-track]")).toHaveCount(1);
  const saved=await page.evaluate(async()=>{const {listPlaylists}=await import("/src/lib/playlists.ts");const p=(await listPlaylists())[0];return {album:p.items[0].album,logo:p.items[0].logo,cover:p.cover};});
  expect(saved.album).toBe("Альбом с устройства");expect(saved.logo).toMatch(/^data:image\/jpeg/);expect(saved.cover).toBe(saved.logo);
  await page.reload();await collections(page);await expect(device(page).locator(".cover")).toHaveAttribute("data-artwork","ready");
});

test("a late uncancellable Soma response cannot overwrite a newly selected station source", async ({page})=>{
  let release!:()=>void,requested=false;
  const gate=new Promise<void>(resolve=>release=resolve);
  await page.route("https://somafm.com/channels.json",async route=>{requested=true;await gate;await route.fulfill({json:{channels:[{id:"old",title:"Old Soma",description:"Old request",genre:"ambient",listeners:1,playlists:[{format:"mp3",url:"https://somafm.com/old.pls"}]}]}});});
  await page.route("**/api/radio-browser/**",async route=>{await route.fulfill({json:new URL(route.request().url()).pathname.endsWith("/search")?[{stationuuid:"new-rb",name:"Fresh Radio",url:"https://audio.example.test/fresh",tags:"",countrycode:"",votes:1,codec:"MP3",bitrate:128}]:[]});});
  await boot(page);await page.getByRole("button",{name:"Обзор",exact:true}).click();await page.getByLabel("Раздел обзора").selectOption("search");
  await page.getByLabel("Источник каталога").selectOption("soma");await expect.poll(()=>requested).toBe(true);
  await page.getByLabel("Источник каталога").selectOption("rb");await expect(page.getByText("Fresh Radio",{exact:true})).toBeVisible();
  release();await page.evaluate(async() => {await (await import("/src/lib/sources.ts")).somaChannels();});
  await expect(page.getByText("Fresh Radio",{exact:true})).toBeVisible();await expect(page.getByText("SomaFM · Old Soma",{exact:true})).toHaveCount(0);
});

test("HTML error pages and empty files are never advertised as downloaded music",async({page})=>{
  await boot(page);
  await page.route("https://audio.example.test/error",r=>r.fulfill({status:200,contentType:"text/html",body:"<h1>Sign in</h1>"}));
  await page.route("https://audio.example.test/empty",r=>r.fulfill({status:200,contentType:"audio/mpeg",body:""}));
  const failures=await page.evaluate(async()=>{const {downloadVod}=await import("/src/lib/offline.ts");const {db,draftToStation}=await import("/src/lib/db.ts");const errors=[];for(const kind of ["error","empty"]){try{await downloadVod(draftToStation({name:kind,url:"https://audio.example.test/"+kind,kind:"vod"}),()=>{});}catch(e){errors.push((e as Error).message);}}return {errors,count:await db.offline.count()};});
  expect(failures.count).toBe(0);expect(failures.errors[0]).toContain("вместо аудиофайла");expect(failures.errors[1]).toContain("пустой аудиофайл");
});

test("reconciling the library cannot delete audio while its index write is still in flight",async({page})=>{
  await boot(page);await seedOffline(page);
  const result=await page.evaluate(async()=>{
    const {db}=await import("/src/lib/db.ts"), {putOfflineBlob,reconcileOfflineCache,audioCacheKey}=await import("/src/lib/offline.ts");
    let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(resolve=>release=resolve),atIndex=new Promise<void>(resolve=>entered=resolve);
    const put=db.offline.put.bind(db.offline);
    db.offline.put=(async (...args:any[])=>{if(args[0]?.stationId==="writing-now"){entered();await gate;}return (put as any)(...args);}) as typeof db.offline.put;
    const writing=putOfflineBlob("writing-now","https://audio.example.test/new",new Uint8Array([1,2,3]),"audio/mpeg",3);
    await atIndex;await reconcileOfflineCache();
    const cache=await caches.open("radio-audio-v1"),retained=!!await cache.match(audioCacheKey("writing-now"));
    release();await writing;db.offline.put=put;
    return {retained,indexed:!!await db.offline.get("writing-now")};
  });
  expect(result).toEqual({retained:true,indexed:true});
});

for(const width of [320,1440])test(`station search and expanded filters fit all designs at ${width}px`,async({page})=>{
  test.setTimeout(90000);
  await page.route("**/api/radio-browser/**",route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith("/search")?[{stationuuid:"design-radio",name:"Очень длинное название радиостанции с живой музыкой",url:"https://audio.example.test/radio",tags:"jazz",favicon:art,countrycode:"DE",state:"Франкфурт-на-Майне",votes:34000,codec:"MP3",bitrate:320}]:[]}));
  await boot(page,width);await page.getByRole("navigation",{name:"Разделы",exact:true}).getByRole("button",{name:/^Обзор(?: \d)?$/}).click();
  if(width<768)await page.getByLabel("Раздел обзора").selectOption("search");else await page.getByRole("button",{name:"Поиск станций",exact:true}).click();
  if(width===320)await page.evaluate(async()=>(await import("/src/lib/uiStyle.ts")).setUiPrefs({scale:125}));
  await page.getByRole("button",{name:"Фильтры станций",exact:true}).click();
  for(const design of ["classic","panorama","focus","atelier","nocturne","editorial","library","console"] as const){
    await page.evaluate(async design=>(await import("/src/lib/appDesign.ts")).applyAppDesign(design),design);
    await expect(page.getByText("Очень длинное название радиостанции с живой музыкой",{exact:true})).toBeVisible();
    const overflow=await page.locator('[data-discover-panel="search"]').evaluate(e=>Math.max(e.scrollWidth-e.clientWidth,document.documentElement.scrollWidth-innerWidth));
    expect(overflow,design).toBeLessThanOrEqual(1);
    for(const name of ["Страна","Язык","Формат","Минимальный битрейт","Сортировка"]){const r=await page.getByLabel(name,{exact:true}).boundingBox();expect(r!.x).toBeGreaterThanOrEqual(0);expect(r!.x+r!.width).toBeLessThanOrEqual(width+1);}
  }
});

test("discovered audio downloads into the searchable library and plays with network disabled",async({page,context})=>{
  const audio=wav();
  await page.route("https://api.openverse.org/v1/audio/**",r=>r.fulfill({json:{page:1,page_count:1,results:[{id:"download-flow",title:"Quiet Harbour",creator:"Evening Ensemble",url:"https://audio.example.test/harbour.wav",foreign_landing_url:"https://example.test/original",license:"by",license_url:"https://creativecommons.org/licenses/by/4.0/",source:"jamendo",category:"music",filetype:"wav",duration:90000}]}}));
  await page.route("https://audio.example.test/harbour.wav",r=>r.fulfill({contentType:"audio/wav",body:audio}));
  await boot(page);await collections(page);await page.getByLabel("Источник музыки").selectOption("openverse");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Evening Ensemble");await page.getByRole("button",{name:"Найти",exact:true}).click();
  await page.getByRole("button",{name:"Скачать офлайн: Quiet Harbour"}).click();
  await page.getByRole("dialog").last().getByRole("button",{name:"Создать",exact:true}).click();await expect(page.getByText(/Готово: скачано 1/)).toBeVisible();
  await page.getByRole("button",{name:/^На устройстве/}).click();await expect(device(page).locator("[data-offline-track]")).toHaveCount(1);
  await page.getByRole("searchbox",{name:"Поиск по музыке на устройстве"}).fill("evening harbour");await expect(device(page).locator("[data-offline-track]")).toHaveCount(1);
  await page.evaluate(async()=>{(window as any).__offlinePlayer=(await import("/src/lib/player.ts")).player;});await context.setOffline(true);
  await device(page).getByRole("button",{name:"Слушать найденное",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{const p=(window as any).__offlinePlayer.getState();return {status:p.status,cached:p.fromCache};})).toEqual({status:"playing",cached:true});
  await context.setOffline(false);
});
