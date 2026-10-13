const NAVER_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json";

function cleanText(value = "") {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function budgetRange(label) {
  const ranges = {
    "1만원 이하": { min: 0, max: 10000 },
    "1~2만원": { min: 10000, max: 20000 },
    "2~3만원": { min: 20000, max: 30000 },
    "3만원 이상": { min: 30000, max: null },
  };
  return ranges[label] || ranges["1~2만원"];
}

function sendJson(response, status, body) {
  response.status(status).json(body);
}

module.exports = async function restaurants(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "GET 요청만 지원합니다." });
  }

  const area = String(request.query.area || "").trim().slice(0, 80);
  const menu = String(request.query.menu || "맛집").trim().slice(0, 80);
  const budget = String(request.query.budget || "1~2만원").trim();
  const people = Math.min(50, Math.max(1, Number.parseInt(request.query.people, 10) || 1));

  if (!area) {
    return sendJson(response, 400, { error: "검색할 지역을 입력해 주세요." });
  }

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Naver Search API credentials are not configured.");
    return sendJson(response, 500, { error: "검색 서비스를 준비하지 못했어요. 잠시 후 다시 시도해 주세요." });
  }

  try {
    const searchKeyword = `${area} ${menu} 맛집`;
    const url = new URL(NAVER_SEARCH_URL);
    url.searchParams.set("query", searchKeyword);
    url.searchParams.set("display", "20");
    url.searchParams.set("sort", "comment");
    const naverResponse = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!naverResponse.ok) {
      console.error(`Naver local search failed with status ${naverResponse.status}.`);
      return sendJson(response, 502, { error: "네이버 검색 결과를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." });
    }

    const payload = await naverResponse.json();
    const range = budgetRange(budget);
    const results = (payload.items || []).map((item) => {
      const name = cleanText(item.title);
      const mapSearchQuery = `${area} ${name}`;
      return {
        name,
        category: cleanText(item.category),
        address: cleanText(item.address),
        roadAddress: cleanText(item.roadAddress),
        telephone: cleanText(item.telephone),
        mapUrl: `https://map.naver.com/p/search/${encodeURIComponent(mapSearchQuery)}`,
        mapSearchQuery,
        thumbnail: null,
        priceStatus: "가격 확인 필요",
        priceNote: "네이버 지역 검색 결과에는 메뉴 가격 정보가 없어 예산 적합 여부를 확인할 수 없어요.",
      };
    });

    return sendJson(response, 200, {
      query: { area, menu, searchKeyword, budget, people, perPersonBudget: range, totalBudget: { min: range.min * people, max: range.max === null ? null : range.max * people } },
      priceDataAvailable: false,
      results,
    });
  } catch (error) {
    console.error("Naver local search request failed.", error instanceof Error ? error.message : "Unknown error");
    return sendJson(response, 502, { error: "검색 중 문제가 생겼어요. 네트워크 상태를 확인한 뒤 다시 시도해 주세요." });
  }
};
