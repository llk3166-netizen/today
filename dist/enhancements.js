/* NAVER Maps JavaScript API Client ID is generated into naver-maps-config.js at deploy time. */
const RESTAURANT_LOCATIONS = [
  { lat: 37.54483, lng: 127.05591 },
  { lat: 37.54291, lng: 127.05381 },
  { lat: 37.54612, lng: 127.05742 },
];

let naverMapsLoading = false;
let naverMap;
let activeInfoWindow;

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

function renderNaverMap() {
  const mapElement = document.getElementById("naver-map");
  if (!mapElement) return;
  if (!window.naver?.maps) {
    showMapMessage("네이버 지도를 불러오는 중이에요…");
    loadNaverMapsSdk();
    return;
  }

  const center = new window.naver.maps.LatLng(37.54483, 127.05591);
  naverMap = new window.naver.maps.Map("naver-map", { center, zoom: 15, minZoom: 12, zoomControl: true, zoomControlOptions: { position: window.naver.maps.Position.TOP_RIGHT } });
  const bounds = new window.naver.maps.LatLngBounds();
  data.forEach((restaurant, index) => {
    const location = RESTAURANT_LOCATIONS[index];
    const position = new window.naver.maps.LatLng(location.lat, location.lng);
    const marker = new window.naver.maps.Marker({ position, map: naverMap, title: restaurant.n, icon: { content: `<div style="width:30px;height:30px;border:2px solid #fff;border-radius:50%;background:#da3743;color:#fff;display:grid;place-items:center;font:800 13px 'Noto Sans KR',sans-serif;box-shadow:0 3px 10px rgba(130,22,32,.35)">${index + 1}</div>`, anchor: new window.naver.maps.Point(15, 15) } });
    bounds.extend(position);
    const infoWindow = new window.naver.maps.InfoWindow({ content: `<div style="padding:11px 13px;min-width:150px;font-family:'Noto Sans KR',sans-serif"><strong style="font-size:13px">TOP ${index + 1}. ${restaurant.n}</strong><br><span style="font-size:11px;color:#69666a">${restaurant.c}</span></div>`, borderWidth: 0, backgroundColor: "#fff", disableAnchor: true, pixelOffset: new window.naver.maps.Point(0, -22) });
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
  window.render = function renderRecommendations() {
    const area = document.getElementById("area").value || "성수동";
    const menus = [...document.querySelectorAll('[data-group="menu"] .selected')].map((item) => item.textContent);
    const moods = [...document.querySelectorAll('[data-group="mood"] .selected')].map((item) => item.textContent);
    const waiting = document.querySelector('[data-group="wait"] .selected')?.textContent || "상관없어요";
    document.getElementById("summaryArea").textContent = area;
    document.getElementById("summaryWait").textContent = waiting;
    document.getElementById("summaryTaste").textContent = `${moods[0] || "캐주얼한"} ${menus[0] || "일식"}`;
    const cards = document.getElementById("cards");
    cards.innerHTML = data.map((restaurant, index) => `<article class="restaurant"><div class="rank"><b>TOP ${index + 1}</b><span class="score">매칭률 ${restaurant.s}</span></div><div class="info"><img class="food" src="${restaurant.img}" alt="${restaurant.n} 음식 사진"><div><div class="meta">${restaurant.c} · ${restaurant.d}</div><div class="name">${restaurant.n}</div><div class="tags"><span>${restaurant.p}</span> ★ 4.${8 - index} 리뷰 다수</div></div></div><div class="reason"><strong>✓ 오늘의 조건 매칭 추천 이유</strong><ul>${restaurant.r.map((reason) => `<li>${reason}</li>`).join("")}</ul></div><div class="actions"><button class="secondary" onclick="openNaverMap('${restaurant.n}', '${area}')">네이버 지도</button><button class="save" onclick="toast('‘${restaurant.n}’을 내 픽에 담았어요!')">♡ 후보로 담기</button></div></article>`).join("");
    cards.insertAdjacentHTML("afterend", `<section style="margin-top:20px;padding:16px;border:1px solid #e9e1df;border-radius:20px;background:#fff"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px"><strong style="font-size:15px">Top 3 위치 보기</strong><span style="font-size:11px;color:#69666a">성수동 중심 예시 좌표</span></div><div id="naver-map" role="region" aria-label="추천 식당 네이버 지도" style="height:270px;border-radius:14px;overflow:hidden;background:#f7f4f4"></div></section>`);
    renderNaverMap();
  };
});
