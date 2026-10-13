/* NAVER Maps JavaScript API Client ID is generated into naver-maps-config.js at deploy time. */
let naverMapsLoading = false;
let naverMap;
let activeInfoWindow;
let currentRestaurants = [];
let searchRequestId = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selectedValues(group) {
  return [...document.querySelectorAll(`[data-group="${group}"] .selected`)].map((item) => item.textContent.trim());
}

function selectedValue(group, fallback) {
  return document.querySelector(`[data-group="${group}"] .selected`)?.textContent.trim() || fallback;
}

function loadNaverMapsSdk() {
  if (window.naver?.maps || naverMapsLoading) return;
  if (!window.NAVER_MAPS_CLIENT_ID || window.NAVER_MAPS_CLIENT_ID === "YOUR_NAVER_MAPS_CLIENT_ID") return;
  naverMapsLoading = true;
  const sdk = document.createElement("script");
  sdk.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(window.NAVER_MAPS_CLIENT_ID)}`;
  sdk.async = true;
  sdk.onload = () => renderNaverMap();
  sdk.onerror = () => showMapMessage("지도를 불러오지 못했어요. 네이버 클라우드 플랫폼의 Web Dynamic Map 허용 도메인을 확인해 주세요.");
  document.head.appendChild(sdk);
}

function showMapMessage(message) {
  const mapElement = document.getElementById("naver-map");
  if (mapElement) mapElement.innerHTML = `<p style="margin:0;padding:22px;color:#69666a;font-size:13px;line-height:1.6">${message}</p>`;
}

function openNaverMap(name, area) {
  const query = encodeURIComponent(`${name} ${area}`);
  window.open(`https://map.naver.com/p/search/${query}`, "_blank", "noopener");
}

function openRestaurantMap(index) {
  const restaurant = currentRestaurants[index];
  if (restaurant) openNaverMap(restaurant.name, restaurant.address);
}

function saveRestaurant(index) {
  const restaurant = currentRestaurants[index];
  if (restaurant) toast(`‘${restaurant.name}’을 내 픽에 담았어요!`);
}

function renderNaverMap() {
  const mapElement = document.getElementById("naver-map");
  if (!mapElement) return;
  if (!window.naver?.maps) {
    showMapMessage("네이버 지도를 불러오는 중이에요…");
    loadNaverMapsSdk();
    return;
  }

  const mappedRestaurants = currentRestaurants.filter((restaurant) => Number.isFinite(restaurant.latitude) && Number.isFinite(restaurant.longitude));
  if (!mappedRestaurants.length) {
    showMapMessage("검색 결과의 위치 정보를 받아오지 못했어요. 각 식당의 네이버 지도 버튼에서 위치를 확인해 주세요.");
    return;
  }

  const center = new window.naver.maps.LatLng(mappedRestaurants[0].latitude, mappedRestaurants[0].longitude);
  naverMap = new window.naver.maps.Map("naver-map", { center, zoom: 15, minZoom: 12, zoomControl: true, zoomControlOptions: { position: window.naver.maps.Position.TOP_RIGHT } });
  const bounds = new window.naver.maps.LatLngBounds();
  mappedRestaurants.forEach((restaurant, index) => {
    const position = new window.naver.maps.LatLng(restaurant.latitude, restaurant.longitude);
    const marker = new window.naver.maps.Marker({ position, map: naverMap, title: restaurant.name, icon: { content: `<div style="width:30px;height:30px;border:2px solid #fff;border-radius:50%;background:#da3743;color:#fff;display:grid;place-items:center;font:800 13px 'Noto Sans KR',sans-serif;box-shadow:0 3px 10px rgba(130,22,32,.35)">${index + 1}</div>`, anchor: new window.naver.maps.Point(15, 15) } });
    bounds.extend(position);
    const infoWindow = new window.naver.maps.InfoWindow({ content: `<div style="padding:11px 13px;min-width:150px;font-family:'Noto Sans KR',sans-serif"><strong style="font-size:13px">TOP ${index + 1}. ${escapeHtml(restaurant.name)}</strong><br><span style="font-size:11px;color:#69666a">${escapeHtml(restaurant.category)}</span></div>`, borderWidth: 0, backgroundColor: "#fff", disableAnchor: true, pixelOffset: new window.naver.maps.Point(0, -22) });
    window.naver.maps.Event.addListener(marker, "click", () => {
      if (activeInfoWindow) activeInfoWindow.close();
      infoWindow.open(naverMap, marker);
      activeInfoWindow = infoWindow;
    });
  });
  naverMap.fitBounds(bounds, { top: 34, right: 34, bottom: 34, left: 34 });
}

window.addEventListener("DOMContentLoaded", () => {
  loadNaverMapsSdk();
  window.render = async function renderRecommendations() {
    const area = document.getElementById("area").value.trim() || "성수동";
    const menus = selectedValues("menu");
    const moods = selectedValues("mood");
    const waiting = selectedValue("wait", "상관없어요");
    const budget = selectedValue("budget", "예산 상관없음");
    const purpose = selectedValue("purpose", "식사");
    const cards = document.getElementById("cards");
    const requestId = ++searchRequestId;
    document.getElementById("summaryArea").textContent = area;
    document.querySelector(".place").textContent = `⌖ ${area}⌄`;
    document.querySelector("#results .summary span:nth-child(2)").textContent = budget;
    document.getElementById("summaryWait").textContent = waiting;
    document.getElementById("summaryTaste").textContent = `${moods[0] || "캐주얼한"} ${menus[0] || "일식"}`;
    cards.innerHTML = `<p class="lead" role="status">${escapeHtml(area)}에서 ${escapeHtml((menus.length ? menus : ["맛집"]).join(", "))} 조건의 식당을 찾고 있어요…</p>`;
    document.getElementById("restaurant-map")?.remove();

    try {
      const search = new URLSearchParams({
        area,
        menus: (menus.length ? menus : ["맛집"]).join(","),
        moods: moods.join(","),
        budget,
        purpose,
        waiting,
      });
      const response = await fetch(`/api/restaurants?${search}`);
      const payload = await response.json();
      if (requestId !== searchRequestId) return;
      if (!response.ok) throw new Error(payload.error || "식당을 찾지 못했어요.");

      currentRestaurants = payload.restaurants;
      if (!currentRestaurants.length) {
        cards.innerHTML = `<p class="lead">${escapeHtml(area)}에서 조건에 맞는 식당을 찾지 못했어요. 지역 또는 메뉴를 바꿔 다시 검색해 주세요.</p>`;
        return;
      }

      cards.innerHTML = currentRestaurants.map((restaurant, index) => `<article class="restaurant"><div class="rank"><b>TOP ${index + 1}</b><span class="score">네이버 리뷰 우선</span></div><div class="info"><img class="food" src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=300&q=80" alt="음식 이미지"><div><div class="meta">${escapeHtml(restaurant.category)}</div><div class="name">${escapeHtml(restaurant.name)}</div><div class="tags"><span>${escapeHtml(restaurant.address || area)}</span></div></div></div><div class="reason"><strong>✓ 선택 조건으로 구성한 추천 이유</strong><ul><li>${escapeHtml(area)}의 ${escapeHtml(restaurant.matchedMenu || "맛집")} 검색 결과예요.</li><li>${escapeHtml(purpose)} 목적 · ${escapeHtml(moods.join(" · ") || "분위기 상관없음")} 분위기 선호를 함께 확인해 보세요.</li><li>${escapeHtml(budget)} 예산 · ${escapeHtml(waiting)} 조건은 매장 상세에서 최종 확인해 주세요.</li></ul></div><div class="actions"><button class="secondary" onclick="openRestaurantMap(${index})">네이버 지도</button><button class="save" onclick="saveRestaurant(${index})">♡ 후보로 담기</button></div></article>`).join("");
      cards.insertAdjacentHTML("afterend", `<section id="restaurant-map" style="margin-top:20px;padding:16px;border:1px solid #e9e1df;border-radius:20px;background:#fff"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px"><strong style="font-size:15px">Top 3 위치 보기</strong><span style="font-size:11px;color:#69666a">${escapeHtml(area)} · ${escapeHtml((menus.length ? menus : ["맛집"]).join(", "))}</span></div><div id="naver-map" role="region" aria-label="추천 식당 네이버 지도" style="height:270px;border-radius:14px;overflow:hidden;background:#f7f4f4"></div></section>`);
      renderNaverMap();
    } catch (error) {
      if (requestId !== searchRequestId) return;
      currentRestaurants = [];
      cards.innerHTML = `<p class="lead" role="alert">${escapeHtml(error.message || "식당을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")}</p>`;
    }
  };
});
