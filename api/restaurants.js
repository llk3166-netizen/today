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

function sendError(response, status, code, error) {
  return sendJson(response, status, { code, error });
}

function upstreamFailure(response, status) {
  if (status === 401 || status === 403) {
    return sendError(response, 502, "NAVER_AUTH_FAILED", "네이버 검색 서비스 인증을 확인하지 못했어요.");
  }

  if (status === 429 || status >= 500) {
    return sendError(response, 503, "NAVER_TEMPORARY_ERROR", "네이버 검색 서비스가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요.");
  }

  return sendError(response, 502, "NAVER_SEARCH_FAILED", "네이버 검색 결과를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
}

module.exports = async function restaurants(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendError(response, 405, "METHOD_NOT_ALLOWED", "GET 요청만 지원합니다.");
  }

  const area = String(request.query.area || "").trim().slice(0, 80);
  const menu = String(request.query.menu || "맛집").trim().slice(0, 80);
  const budget = String(request.query.budget || "1~2만원").trim();
  const people = Math.min(50, Math.max(1, Number.parseInt(request.query.people, 10) || 1));

  if (!area) {
    return sendError(response, 400, "INVALID_AREA", "검색할 지역을 입력해 주세요.");
  }

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Naver Search API credentials are not configured.");
    return sendError(response, 500, "SERVER_CONFIGURATION_ERROR", "검색 서비스를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  try {
    const searchKeyword = `${area} ${menu} 맛집`;
    const url = new URL(NAVER_SEARCH_URL);
    url.searchParams.set("query", searchKeyword);
    url.searchParams.set("display", "20");
    url.searchParams.set("sort", "comment");
    const naverResponse = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!naverResponse.ok) {
      console.error(`Naver local search failed with status ${naverResponse.status}.`);
      return upstreamFailure(response, naverResponse.status);
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
    return sendError(response, 503, "NAVER_NETWORK_ERROR", "네이버 검색 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
};
