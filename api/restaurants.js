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

function cleanList(value, limit = 3) {
  return String(value ?? "")
    .split(",")
    .map((item) => cleanText(item).slice(0, 30))
    .filter(Boolean)
    .slice(0, limit);
}

function searchMenuName(menu) {
  return menu.replace("고기/구이", "고기").replace("면/국밥", "국밥").replace("카페/브런치", "브런치");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const area = cleanText(req.query.area).slice(0, 50);
  const menus = cleanList(req.query.menus || req.query.menu);
  const moods = cleanList(req.query.moods);
  const budget = cleanText(req.query.budget).slice(0, 30);
  const purpose = cleanText(req.query.purpose).slice(0, 30);
  const waiting = cleanText(req.query.waiting).slice(0, 30);
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;

  if (!area) {
    return res.status(400).json({ error: "지역을 입력해 주세요." });
  }

  if (!clientId || !clientSecret) {
    console.error("NAVER Search API credentials are not configured.");
    return res.status(503).json({ error: "식당 검색 설정을 준비 중이에요." });
  }

  const requestedMenus = menus.length ? menus : ["맛집"];
  const conditions = { menus: requestedMenus, moods, budget, purpose, waiting };

  try {
    const searches = await Promise.all(requestedMenus.map(async (menu) => {
      const query = `${area} ${searchMenuName(menu)} 맛집`.trim();
      const url = new URL(NAVER_LOCAL_SEARCH_URL);
      url.searchParams.set("query", query);
      url.searchParams.set("display", "5");
      url.searchParams.set("sort", "comment");

      const response = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      });
      if (!response.ok) throw new Error(`NAVER local search failed: ${response.status}`);

      const payload = await response.json();
      return (payload.items ?? []).map((item) => ({
        name: cleanText(item.title),
        category: cleanText(item.category) || "음식점",
        address: cleanText(item.roadAddress) || cleanText(item.address),
        latitude: coordinate(item.mapy),
        longitude: coordinate(item.mapx),
        matchedMenu: menu,
      }));
    }));

    const seen = new Set();
    const restaurants = searches.flat().filter((restaurant) => {
      const key = `${restaurant.name}|${restaurant.address}`;
      if (!restaurant.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ area, conditions, restaurants });
  } catch (error) {
    console.error("NAVER local search request failed", { message: error.message, area, menus: requestedMenus });
    return res.status(502).json({ error: "식당 검색 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요." });
  }
};
