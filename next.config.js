// Next.js settings.
module.exports = {
  // Extra response headers. The service worker must never be cached by the browser or a CDN,
  // or phones would keep running an old version after a deploy.
  // Returns the list of header rules.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};
