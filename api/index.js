module.exports = async (req, res) => {
  const shopifyDomain = "entryleveljobs.onlinejob247.com";
  const proxyHost = req.headers.host;

  const targetURL = `https://${shopifyDomain}${req.url}`;

  try {
    let bodyBuffer = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      bodyBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      });
    }

    let fetchURL = targetURL;
    let response;
    let redirectCount = 0;

    while (redirectCount < 5) {
      response = await fetch(fetchURL, {
        method: req.method,
        headers: {
          ...req.headers,
          host: new URL(fetchURL).hostname,
          "X-Forwarded-Host": proxyHost,
          "X-Forwarded-Proto": "https",
        },
        body: bodyBuffer || null,
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        let location = response.headers.get("location") || "";

        if (location.includes(shopifyDomain)) {
          location = location
            .replace(`https://${shopifyDomain}`, `https://${proxyHost}`)
            .replace(`http://${shopifyDomain}`, `https://${proxyHost}`);
          res.setHeader("location", location);
          res.status(response.status).end();
          return;
        }

        if (location.includes(proxyHost)) {
          res.setHeader("location", location);
          res.status(response.status).end();
          return;
        }

        fetchURL = location.startsWith("http") ? location : `https://${shopifyDomain}${location}`;
        redirectCount++;
        continue;
      }

      break;
    }

    const skipHeaders = ["content-encoding", "transfer-encoding", "content-length"];
    response.headers.forEach((value, key) => {
      if (skipHeaders.includes(key)) return;
      if (key === "set-cookie") {
        value = value.replace(/Domain=[^;]+;?/gi, "");
      }
      res.setHeader(key, value);
    });

    const contentType = response.headers.get("content-type") || "";

    const rewriteText = (body) =>
      body
        .split(`https://${shopifyDomain}`).join(`https://${proxyHost}`)
        .split(`http://${shopifyDomain}`).join(`https://${proxyHost}`);

    // ✅ HTML rewrite + inject verification tag
    if (contentType.includes("text/html")) {
      let body = rewriteText(await response.text());
      body = body.replace(
        "<head>",
        `<head>\n<meta name="google-site-verification" content="oOB4GFrNSNdykfLPFYsy8byFMtrbAiccGJfrX7_UcOU" />`
      );
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.status(response.status).send(body);
    }

    // CSS rewrite
    if (contentType.includes("text/css")) {
      const body = rewriteText(await response.text());
      res.setHeader("content-type", "text/css");
      return res.status(response.status).send(body);
    }

    // Sitemap & XML rewrite
    if (req.url.includes("sitemap") || contentType.includes("xml")) {
      const body = rewriteText(await response.text());
      res.setHeader("content-type", "application/xml; charset=utf-8");
      return res.status(response.status).send(body);
    }

    // JS rewrite
    if (contentType.includes("javascript")) {
      const body = rewriteText(await response.text());
      res.setHeader("content-type", contentType);
      return res.status(response.status).send(body);
    }

    // Binary passthrough
    const buffer = await response.arrayBuffer();
    return res.status(response.status).send(Buffer.from(buffer));

  } catch (error) {
    res.status(500).send("Proxy error: " + error.message);
  }
};
