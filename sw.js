const CACHE = 'atmos-magacin-v3';
const ASSETS = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  /* cache:'reload' — uzmi sveže fajlove sa servera, ne iz keša pregledača */
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  if (req.mode === 'navigate') {
    /* stranica: prvo mreža (najnovija verzija), ali najviše 3 s — na slabom internetu otvara se sačuvana kopija,
       a nova se preuzme u pozadini i stiže pri sledećem otvaranju. Bez interneta: odmah sačuvana kopija. */
    e.respondWith((async () => {
      const net = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); }
        return res;
      });
      const saved = (await caches.match('index.html')) || (await caches.match('./'));
      if (!saved) return net;
      e.waitUntil(net.catch(() => {}));
      return Promise.race([
        net.then(res => (res && res.ok ? res : saved), () => saved),
        new Promise(r => setTimeout(() => r(saved), 3000))
      ]);
    })());
    return;
  }

  /* provera nove verzije traži sveže sa servera, pa ne sme da dobije staru kopiju iz keša */
  if (req.cache === 'no-store' || req.cache === 'reload' || req.cache === 'no-cache') return;

  /* ostalo: iz keša, a u pozadini osvežava (radi i bez interneta) */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit || caches.match('index.html'));
      return hit || net;
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      if (cs.length) return cs[0].focus();
      return self.clients.openWindow('./index.html');
    })
  );
});

/* dnevno obaveštenje i kad aplikacija nije otvorena (Android, instalirana aplikacija) */
function idbAlerts(){return new Promise(res=>{try{const r=indexedDB.open('atmosMagDB',1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('att'))d.createObjectStore('att');if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv')};
  r.onsuccess=()=>{const d=r.result;const t=d.transaction('kv','readonly').objectStore('kv').get('alerts');t.onsuccess=()=>res({d,v:t.result||null});t.onerror=()=>res({d,v:null})};r.onerror=()=>res({})}catch(e){res({})}})}
function today(){const n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0')}
self.addEventListener('periodicsync',e=>{
  if(e.tag!=='atmos-mag-daily')return;
  e.waitUntil(idbAlerts().then(({d,v})=>{
    if(!d||!v||!v.enabled||!v.n||v.notified===today())return;
    v.notified=today();d.transaction('kv','readwrite').objectStore('kv').put(v,'alerts');
    return self.registration.showNotification('Atmos Magacin — '+v.n+(v.n===1?' stvar za proveru':' stvari za proveru'),{body:(v.items||[]).slice(0,4).join('\n'),icon:'icon-192.png',badge:'icon-192.png',tag:'atmos-mag'});
  }));
});
