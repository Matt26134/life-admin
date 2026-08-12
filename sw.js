const CACHE_NAME = 'life-dashboard-v2.0.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './app.js',
  './manifest.webmanifest',
  './version.json',
  './app-icon-192.png',
  './app-icon-512.png'
];

function sharedUid(prefix){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
function openLifeDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('LifeDashboardDB',2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const store of ['tasks','lists','plans','files','inbox','settings','templates'])if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function putShared(storeName,record){
  const db=await openLifeDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).put(record);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
async function handleShareTarget(request){
  const form=await request.formData();
  const files=form.getAll('files').filter(value=>value && typeof value==='object' && 'size' in value && value.size>0);
  const now=new Date().toISOString();
  for(const file of files){
    await putShared('files',{id:sharedUid('file'),name:file.name||'Shared image',originalName:file.name||'Shared image',displayName:'',type:file.type||'application/octet-stream',size:file.size||0,blob:file,planId:'',itineraryItemId:'',planIds:[],itineraryItemIds:[],taskIds:[],pinned:false,category:'',createdAt:now,updatedAt:now,source:'android-share'});
  }
  if(!files.length){
    const text=[form.get('title'),form.get('text'),form.get('url')].filter(Boolean).join('\n').trim();
    if(text)await putShared('inbox',{id:sharedUid('inbox'),text,createdAt:now,updatedAt:now,source:'android-share'});
  }
  const target=new URL(files.length?'./?shared=files':'./?shared=item',self.registration.scope).href;
  return Response.redirect(target,303);
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(event.request).catch(() => Response.redirect(new URL('./', self.registration.scope).href,303)));
    return;
  }

  if (event.request.method !== 'GET') return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok && url.origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
