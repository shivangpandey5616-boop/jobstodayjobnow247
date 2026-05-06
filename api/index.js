module.exports = async (req, res) => {
  const shopifyDomain = "jobstoday.jobsnow247.com"; // ✅ updated
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

    const response = await fetch(targetURL, {
      method: req.method,
      headers: {
        ...req.headers,
        host: shopifyDomain,
        "X-Forwarded-Host": proxyHost,
        "X-Forwarded-Proto": "https",
      },
      body: bodyBuffer || null,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      let location = response.headers.get("location") || "";
      location = location
        .replace(`https://${shopifyDomain}`, `https://${proxyHost}`)
        .replace(`http://${shopifyDomain}`, `https://${proxyHost}`);
      res.setHeader("location", location);
      res.status(response.status).end();
      return;
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

    if (contentType.includes("text/html")) {
      const body = rewriteText(await response.text());
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.status(response.status).send(body);
    }

    if (contentType.includes("text/css")) {
      const body = rewriteText(await response.text());
      res.setHeader("content-type", "text/css");
      return res.status(response.status).send(body);
    }

    if (req.url.includes("sitemap") || contentType.includes("xml")) {
      const body = rewriteText(await response.text());
      res.setHeader("content-type", "application/xml; charset=utf-8");
      return res.status(response.status).send(body);
    }

    if (contentType.includes("javascript")) {
      const body = rewriteText(await response.text());
      res.setHeader("content-type", contentType);
      return res.status(response.status).send(body);
    }

    const buffer = await response.arrayBuffer();
    return res.status(response.status).send(Buffer.from(buffer));

  } catch (error) {
    res.status(500).send("Proxy error: " + error.message);
  }
};
