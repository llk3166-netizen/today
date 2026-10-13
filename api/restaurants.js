const NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json";

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function coordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 10000000 : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const area = cleanText(req.query.area).slice(0, 50);
  const menu = cleanText(req.query.menu).slice(0, 30);
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;

  if (!area) {
    return res.status(400).json({ error: "지역을 입력해 주세요." });
  }

  if (!clientId || !clientSecret) {
    console.error("NAVER Search API credentials are not configured.");
    return res.status(503).json({ error: "식당 검색 설정을 준비 중이에요." });
  }

  const query = `${area} ${menu || "맛집"}`.trim();
  const url = new URL(NAVER_LOCAL_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("display", "3");
  url.searchParams.set("sort", "random");

  try {
    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      console.error("NAVER local search failed", { status: response.status, query });
      return res.status(502).json({ error: "네이버에서 식당 정보를 가져오지 못했어요." });
    }

    const payload = await response.json();
    const restaurants = (payload.items ?? []).map((item) => ({
      name: cleanText(item.title),
      category: cleanText(item.category) || "음식점",
      address: cleanText(item.roadAddress) || cleanText(item.address),
      latitude: coordinate(item.mapy),
      longitude: coordinate(item.mapx),
    }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ area, query, restaurants });
  } catch (error) {
    console.error("NAVER local search request failed", { message: error.message, query });
    return res.status(502).json({ error: "식당 검색 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요." });
  }
};
