module.exports = async (req, res) => {
  const shopifyDomain = "jobstoday.jobsnow247.com";

  if (req.url.includes("cdn.shopify.com")) {
    res.redirect(301, `https://cdn.shopify.com${req.url}`);
    return;
  }

  const targetURL = `https://${shopifyDomain}${req.url}`;

  try {
    const response = await fetch(targetURL, {
      method: req.method,
      headers: {
        ...req.headers,
        host: shopifyDomain,
        "X-Forwarded-Host": req.headers.host,
        "X-Forwarded-Proto": "https",
      },
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : null,
      redirect: "manual",
    });

    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location && location.includes(shopifyDomain)) {
        const newLocation = location.replace(
          `https://${shopifyDomain}`,
          `https://${req.headers.host}`
        );
        res.setHeader("location", newLocation);
        res.status(response.status).end();
        return;
      }
    }

    // Copy all headers
    response.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding"].includes(key)) {
        res.setHeader(key, value);
      }
    });

    const contentType = response.headers.get("content-type") || "";

    // ✅ HTML rewrite
    if (contentType.includes("text/html")) {
      let body = await response.text();
      body = body
        .split(`https://${shopifyDomain}`)
        .join(`https://${req.headers.host}`);
      body = body
        .split(`http://${shopifyDomain}`)
        .join(`https://${req.headers.host}`);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.status(response.status).send(body);
      return;
    }

    // ✅ CSS rewrite
    if (contentType.includes("text/css")) {
      let body = await response.text();
      body = body
        .split(`https://${shopifyDomain}`)
        .join(`https://${req.headers.host}`);
      res.setHeader("content-type", "text/css");
      res.status(response.status).send(body);
      return;
    }

    // ✅ Sitemap & XML rewrite
    if (req.url.includes("sitemap") || contentType.includes("xml")) {
      let body = await response.text();
      body = body
        .split(`https://${shopifyDomain}`)
        .join(`https://${req.headers.host}`);
      body = body
        .split(`http://${shopifyDomain}`)
        .join(`https://${req.headers.host}`);
      res.setHeader("content-type", "application/xml; charset=utf-8");
      res.status(response.status).send(body);
      return;
    }

    // All other files pass through
    const buffer = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(buffer));

  } catch (error) {
    res.status(500).send("Proxy error: " + error.message);
  }
};
