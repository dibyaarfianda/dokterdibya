export function workerSource(version, assets) {
  if (
    !/^[a-f0-9]{12}$/.test(version) ||
    assets.some(
      (path) => !path.startsWith("/staff-preview/") || path.includes(".."),
    )
  )
    throw new Error("Invalid preview cache manifest");
  return `const PREFIX='dibya-staff-preview-';
const CACHE=PREFIX+'${version}';
const BASE='/staff-preview/';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(BASE))return;
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(BASE+'index.html')));return;}
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));
});`;
}
