let currentRestaurants = [];
let searchRequestId = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function selectedValues(group) { return [...document.querySelectorAll(`[data-group="${group}"] .selected`)].map((item) => item.textContent.trim()); }
function selectedValue(group, fallback) { return document.querySelector(`[data-group="${group}"] .selected`)?.textContent.trim() || fallback; }
function saveRestaurant(index) { const restaurant = currentRestaurants[index]; if (restaurant) toast(`‘${restaurant.name}’을 내 픽에 담았어요!`); }
function mapsLink(restaurant) { return restaurant.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.name} ${restaurant.address}`)}`; }

function restaurantCard(restaurant, index, area) {
  const openLabel = restaurant.openNow === true ? "영업 중" : restaurant.openNow === false ? "현재 영업 종료" : "영업 상태 확인 필요";
  const rating = restaurant.rating ? `★ ${restaurant.rating}${restaurant.userRatingCount ? ` (${Number(restaurant.userRatingCount).toLocaleString("ko-KR")})` : ""}` : "평점 정보 확인 필요";
  return `<article class="restaurant"><div class="rank"><b>TOP ${index + 1}</b><span class="score">Google Places</span></div><div class="info"><img class="food" src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=300&q=80" alt="음식 이미지"><div><div class="meta">${escapeHtml(restaurant.category)}</div><div class="name">${escapeHtml(restaurant.name)}</div><div class="tags"><span>${escapeHtml(restaurant.address || area)}</span></div></div></div><div class="reason"><strong>✦ Gemini가 정리한 추천 이유</strong><ul><li>${escapeHtml(restaurant.reason)}</li><li><b>주요 메뉴·특징:</b> ${escapeHtml(restaurant.mainMenu)}</li><li><b>가격:</b> ${escapeHtml(restaurant.price)} · <b>${openLabel}</b></li><li><b>대기:</b> ${escapeHtml(restaurant.waiting)}</li><li><b>평점:</b> ${rating}</li></ul></div><div class="actions"><a class="secondary" style="text-align:center;text-decoration:none;color:inherit" href="${escapeHtml(mapsLink(restaurant))}" target="_blank" rel="noopener noreferrer">Google 지도</a><button class="save" onclick="saveRestaurant(${index})">♡ 후보로 담기</button></div></article>`;
}

window.addEventListener("DOMContentLoaded", () => {
  window.render = async function renderRecommendations() {
    const area = document.getElementById("area").value.trim() || "성수동";
    const menus = selectedValues("menu"); const moods = selectedValues("mood");
    const waiting = selectedValue("wait", "상관없어요"); const budget = selectedValue("budget", "예산 상관없음"); const purpose = selectedValue("purpose", "식사");
    const cards = document.getElementById("cards"); const requestId = ++searchRequestId;
    document.getElementById("summaryArea").textContent = area;
    document.querySelector(".place").textContent = `⌖ ${area}⌄`;
    document.querySelector("#results .summary span:nth-child(2)").textContent = budget;
    document.getElementById("summaryWait").textContent = waiting;
    document.getElementById("summaryTaste").textContent = `${moods[0] || "캐주얼한"} ${menus[0] || "맛집"}`;
    cards.innerHTML = `<p class="lead" role="status">Google Places에서 ${escapeHtml(area)}의 식당과 상세 정보를 찾고 있어요…</p>`;
    try {
      const search = new URLSearchParams({ area, menus: (menus.length ? menus : ["맛집"]).join(","), moods: moods.join(","), budget, purpose, waiting });
      const response = await fetch(`/api/restaurants?${search}`); const payload = await response.json();
      if (requestId !== searchRequestId) return;
      if (!response.ok) throw new Error(payload.error || "식당을 찾지 못했어요.");
      currentRestaurants = payload.restaurants || [];
      if (!currentRestaurants.length) { cards.innerHTML = `<p class="lead">${escapeHtml(area)}에서 조건에 맞는 식당을 찾지 못했어요. 지역 또는 메뉴를 바꿔 다시 검색해 주세요.</p>`; return; }
      cards.innerHTML = currentRestaurants.map((restaurant, index) => restaurantCard(restaurant, index, area)).join("");
    } catch (error) {
      if (requestId !== searchRequestId) return;
      currentRestaurants = [];
      cards.innerHTML = `<p class="lead" role="alert">${escapeHtml(error.message || "식당을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")}</p>`;
    }
  };
});
