const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NAVER_SEARCH_CLIENT_ID = "test-client-id";
process.env.NAVER_SEARCH_CLIENT_SECRET = "test-client-secret";

const restaurants = require("./restaurants");

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function withMockedFetch(response, callback) {
  const originalFetch = global.fetch;
  global.fetch = async () => response;
  try {
    await callback();
  } finally {
    global.fetch = originalFetch;
  }
}

function request(query = {}) {
  return { method: "GET", query: { area: "성수동", menu: "일식", budget: "1~2만원", people: "2", ...query } };
}

test("returns normalized restaurants through the server endpoint", async () => {
  const response = createResponse();
  await withMockedFetch({
    ok: true,
    json: async () => ({ items: [{ title: "<b>성수</b> 식당", category: "음식점>일식", address: "서울 성동구 성수동", roadAddress: "서울 성동구 성수이로 1", telephone: "02-1234-5678" }] }),
  }, () => restaurants(request(), response));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.results[0].name, "성수 식당");
  assert.equal(response.body.query.searchKeyword, "성수동 일식 맛집");
});

test("maps Naver authentication errors to a safe client error", async () => {
  const response = createResponse();
  await withMockedFetch({ ok: false, status: 401 }, () => restaurants(request(), response));

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.code, "NAVER_AUTH_FAILED");
  assert.match(response.body.error, /인증/);
});

test("maps temporary Naver failures to a retryable error", async () => {
  const response = createResponse();
  await withMockedFetch({ ok: false, status: 429 }, () => restaurants(request(), response));

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "NAVER_TEMPORARY_ERROR");
});
