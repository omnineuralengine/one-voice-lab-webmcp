// Hermetic Next.js font responses for local WebMCP validation. The non-URL
// font sources become deterministic in-memory bytes inside the Next font loader.
module.exports = {
  "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap": `
    /* latin */
    @font-face {
      font-family: 'Geist';
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url(webmcp-geist-latin.woff2) format('woff2');
    }
  `,
  "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap": `
    /* latin */
    @font-face {
      font-family: 'Geist Mono';
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url(webmcp-geist-mono-latin.woff2) format('woff2');
    }
  `,
};
