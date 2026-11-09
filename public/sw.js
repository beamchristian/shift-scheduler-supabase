// Service worker for the installed app.
// It does two things and nothing more:
// 1. Keeps the app's build files (scripts and styles) and icons, so it opens quickly.
// 2. Shows a friendly "You're offline" page when there is no connection, instead of the browser's error.
// It never stores schedule data or anything from /api, so managers always see the latest saved schedule.

// Change the version when the files listed below change, so old copies are cleared out.
const CACHE_NAME = "shift-scheduler-v1";
const OFFLINE_PAGE_URL = "/offline.html";
// Each new deploy brings new build files, so only the newest this many are kept.
const MOST_SAVED_FILES = 150;
const FILES_TO_KEEP_READY = [
  OFFLINE_PAGE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/favicon-32.png",
];

// Saves the offline page and icons as soon as the service worker is installed.
self.addEventListener("install", (installEvent) => {
  installEvent.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_KEEP_READY))
      .then(() => self.skipWaiting()),
  );
});

// Removes caches left by older versions, then takes over open pages straight away.
self.addEventListener("activate", (activateEvent) => {
  activateEvent.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// True for files whose names change with every build, so a saved copy is never out of date.
function isBuildFile(requestUrl) {
  return requestUrl.pathname.startsWith("/_next/static/") || requestUrl.pathname.startsWith("/icons/");
}

// Removes the oldest saved files once there are more than MOST_SAVED_FILES. The offline page is always kept.
// Returns when done.
async function trimSavedFiles(cache) {
  const savedRequests = await cache.keys();
  const extraCount = savedRequests.length - MOST_SAVED_FILES;
  const oldestFirst = savedRequests.filter(
    (savedRequest) => !FILES_TO_KEEP_READY.includes(new URL(savedRequest.url).pathname),
  );
  const requestsToRemove = oldestFirst.slice(0, Math.max(0, extraCount));
  await Promise.all(requestsToRemove.map((savedRequest) => cache.delete(savedRequest)));
}

// Returns the saved copy of a build file, or fetches it and saves it for next time.
async function buildFileFromCacheOrNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  const savedResponse = await cache.match(request);
  if (savedResponse) return savedResponse;
  const networkResponse = await fetch(request);
  if (networkResponse.ok)
    cache.put(request, networkResponse.clone()).then(() => trimSavedFiles(cache));
  return networkResponse;
}

// Loads a page from the network. When that fails (no connection), returns the offline page instead.
async function pageFromNetworkOrOfflinePage(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(OFFLINE_PAGE_URL)) || Response.error();
  }
}

// Decides how each request is handled. Anything not matched here (API calls, other sites) goes
// straight to the network as if there were no service worker.
self.addEventListener("fetch", (fetchEvent) => {
  const request = fetchEvent.request;
  if (request.method !== "GET") return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    fetchEvent.respondWith(pageFromNetworkOrOfflinePage(request));
    return;
  }
  if (isBuildFile(requestUrl)) fetchEvent.respondWith(buildFileFromCacheOrNetwork(request));
});
