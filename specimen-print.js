/* ═══════════════════════════════════════════════════════════════════════════
   PIXEL TO DATASCAPE — 표본 카드 인쇄 (SPECIMEN PRINT)  ·  자기완결형 단일 파일
   ───────────────────────────────────────────────────────────────────────────
   ▶ 설치: index.html 의 <script src="script.js"></script> 바로 "다음" 줄에
            <script src="specimen-print.js"></script>  한 줄만 추가하면 끝.
            (style.css / script.js 는 건드리지 않습니다 — CSS는 이 파일이 직접 주입)

   판형: 카드 = A4 전면(210×297) 꽉 채움. 이미지 2:1 세로(재단 104×208) · 도련 2mm ·
         재단 크롭마크 · 절취선(여백) · 앞뒤 미러 · 이미지 가로·세로 정중앙.
         절취선 끝은 가장자리 6mm 안쪽에서 끊어 가정용 프린터에서 안 잘리게 함.

   동작: LOG 뷰의 [ PRINT ] 버튼을 표본 카드 모드로 교체. observationLog(수집 로그)를
         1장=1카드(앞=관측 A / 뒤=관측 B)로 펼쳐 A4 양면용 페이지를 만든다.
   되돌리기: index.html 의 위 <script> 한 줄만 지우면 기존 인쇄로 복귀.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────── 1) CSS 주입 (style.css 이후 = 캐스케이드 우선) ───────────────── */
  const CSS = `
/* 위도·경도·페이지 번호 전용 ExtraLight (ttf가 index.html과 같은 폴더에 있다고 가정 — 다른 폴더면 url() 경로만 수정) */
@font-face {
  font-family: 'MozillaHeadline ExtraLight';
  src: local('MozillaHeadline ExtraLight'), local('MozillaHeadline-ExtraLight'),
       url('MozillaHeadline-ExtraLight.ttf') format('truetype');
  font-weight: 100 900; font-style: normal; font-display: swap;
}
.spec-page { display: none; }                       /* 화면에선 숨김 */
@media print {
  /* 기존 @media print 의 A3(420mm)·@page 를 표본 모드에서만 무력화 (@page 는 JS가 A4로 덮어씀) */
  html.printing-specimen, html.printing-specimen body { width: 210mm !important; margin: 0 !important; }

  .spec-page {
    display: flex !important; align-items: center; justify-content: center;
    width: 210mm; height: 297mm; background: #fff; overflow: hidden; box-sizing: border-box;
    page-break-after: always; break-after: page;
  }
  .spec-page:last-child { page-break-after: auto; break-after: auto; }

  /* 카드 = A4 전면 */
  .spec-card { position: relative; width: 210mm; height: 297mm; background: #fff;
    overflow: hidden; font-family: var(--font-mono, 'Courier Prime', monospace); color: #111; }
  .spec-cut { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }

  /* 이미지(도련 박스 = 재단선보다 2mm 큼, A4 가로·세로 정중앙) */
  .spec-chip { position: absolute; left: 53mm; top: 46.5mm; width: 104mm; height: 204mm;
    overflow: hidden; background: #000; z-index: 1; }
  /* 원본이 가로 2:1 → 반시계 90° 회전해 세로 슬롯(2:1)에 통째로 채움.
     회전 전 박스 = 칸의 가로·세로를 뒤바꾼 212×108 → 회전 후 108×212(칸)에 정확히 맞음 */
  .spec-chip img { position: absolute; top: 50%; left: 50%; width: 204mm; height: 104mm;
    transform: translate(-50%, -50%) rotate(-90deg); transform-origin: center;
    object-fit: cover; display: block; }

  /* 상단 3단: 좌표 │ RAW DATA │ 색상정보(작은 칸) */
  .spec-coord { position: absolute; top: 6mm; width: 36mm; z-index: 6; line-height: 1.5; font-family: 'MozillaHeadline-ExtraLight', var(--font-mono, 'Courier Prime', monospace); }
  .spec-coord .lat { font-size: 13.5pt; font-weight: 400; letter-spacing: .02em; }

  .spec-raw { position: absolute; top: 6mm; width: 48mm; z-index: 6; }
  .spec-raw .hd  { font-size: 8pt; font-weight: 600; color: #111; letter-spacing: .02em; }
  .spec-raw .val { font-weight: 300; font-size: 7pt; line-height: 1.6; color: #111; letter-spacing: .01em; margin-top: 1.2mm; }
  .spec-raw .fid { display: block; word-break: break-all; }

  .spec-color { position: absolute; top: 6mm; width: 44mm; z-index: 6; }
  .spec-color .hd  { font-size: 8pt; font-weight: 600; color: #111; letter-spacing: .02em; }
  .spec-color .hd .sw { display: inline-block; width: 3mm; height: 3mm; vertical-align: -.3mm; margin-right: 1.4mm; border: .2mm solid #111; }
  .spec-color .val { font-weight: 300; font-size: 7pt; line-height: 1.6; color: #111; letter-spacing: .01em; margin-top: 1.2mm; }

  /* 분석 텍스트 : 세로짜기 대신 '눕힌' 가로 텍스트박스 */
  .spec-vtext { position: absolute; top: 66mm; height: 210mm; width: 48mm; z-index: 6; overflow: hidden; }
  .spec-vtext-in { position: absolute; top: 50%; left: 50%; width: 145mm; height: 46mm;
    transform: translate(-50%, -50%) rotate(-90deg); transform-origin: center;
    font-family: var(--font-kr, 'Noto Sans KR', sans-serif); font-weight: 250; font-size: 7pt; line-height: 1.7;
    letter-spacing: .01em; color: #111; text-align: left;
    word-break: keep-all; overflow-wrap: normal; line-break: strict; }
  .spec-vtext-in .vt-sec { margin-bottom: 2.4mm; }
  .spec-vtext-in .vt-sec:last-child { margin-bottom: 0; }
  .spec-vtext-in .vt-lbl { font-weight: 600; margin-right: 1.4mm; white-space: nowrap; }
 
  /* 하단: 오른쪽 = KEYWORDS · 오른쪽 아래 구석 = 페이지 번호(RAW DATA와 동일 서체/크기) */
  .spec-pageno { position: absolute; left: 159mm; bottom: 6mm; z-index: 6;
    font-family: 'MozillaHeadline-ExtraLight', var(--font-mono, 'MozillaHeadline-Light', monospace); font-size: 13.5pt; color: #111; letter-spacing: .01em; }
  .spec-keys { position: absolute; left: 59mm; bottom: 6mm; width: 94mm; z-index: 6; text-align: left; }
  .spec-keys .hd { font-size: 8pt; font-weight: 600; color: #111; letter-spacing: .02em; }
  .spec-keys .kv { font-weight: 300; font-size: 7pt; line-height: 1.6; color: #111; letter-spacing: .01em; margin-top: 1mm; }

  /* 앞/뒤 미러 (재단·절취선은 중앙 대칭이라 그대로, 메타·텍스트만 좌우 반전) */
  /* ▼▼ 위치 조정 노브 (앞·뒤 동일 배치) — left(가로) mm 값만 바꾸면 박스가 좌우로 움직입니다.
     세로/너비는 각 박스 base 규칙(.spec-coord/.spec-raw/.spec-color/.spec-vtext/.spec-foot)의 top/width/bottom */
  .spec-card .spec-coord { left: 8mm; }
  .spec-card .spec-raw   { left: 59mm; text-align: left; }
  .spec-card .spec-color { left: 159mm; text-align: left; }
  .spec-card .spec-vtext { left: 160mm; }
}`;
  if (!document.getElementById('spec-print-css')) {
    const s = document.createElement('style');
    s.id = 'spec-print-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ───────────────── 2) 헬퍼 (hexHSL 있으면 재사용, 없으면 자체) ───────────────── */
  const _hsl = (typeof hexHSL === 'function') ? hexHSL : function (hex) {
    hex = (hex || '#808080').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    const r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b = parseInt(hex.slice(4,6),16)/255;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
    let h = 0, s = 0, l = (mx + mn) / 2;
    if (d) { s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
      if (mx===r) h = (g-b)/d + (g<b?6:0); else if (mx===g) h = (b-r)/d + 2; else h = (r-g)/d + 4; h *= 60; }
    return { h: h, s: s, l: l };
  };
  function _rgb(hex) {
    hex = (hex || '#808080').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  }
  // COVERAGE : 지배색과 가까운(거리 ≤ TH) 픽셀 비율(%). 같은 출처 이미지라 canvas 안전. 실패 시 null.
  function coverage(imgPath, hex) {
    return new Promise(function (res) {
      const img = new Image();
      img.onload = function () {
        try {
          const W = 64, H = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, W, H);
          const d = cx.getImageData(0, 0, W, H).data, rgb = _rgb(hex), r0 = rgb[0], g0 = rgb[1], b0 = rgb[2], TH = 45;
          let hit = 0; const N = W * H;
          for (let i = 0; i < d.length; i += 4) {
            const dr = d[i]-r0, dg = d[i+1]-g0, db = d[i+2]-b0;
            if (Math.sqrt(dr*dr + dg*dg + db*db) <= TH) hit++;
          }
          res(Math.round(hit / N * 1000) / 10);
        } catch (e) { res(null); }
      };
      img.onerror = function () { res(null); };
      img.src = imgPath;
    });
  }

  /* ───────────────── 3) 선 SVG (절취선·재단 크롭마크) — A4(210×297) ───────────────── */
  function cutSVG() {
    const W = 210, H = 297, bleed = 2, tw = 100, th = 200;
    const iw = tw + 2*bleed, ih = th + 2*bleed;                          // 108 × 212
    const ix = (W - iw)/2, iy = (H - ih)/2, ex = ix + iw, ey = iy + ih;  // 51 · 42.5 · 159 · 254.5
    const tx = ix + bleed, ty = iy + bleed, trx = tx + tw, tby = ty + th; // 53 · 44.5 · 157 · 252.5
    const SAFE = 0, coff = 2.0, clen = 4.2;     // SAFE=0: 절취선을 종이 끝까지 연장
    const crop = function (cx, cy, hx, vy) {
      return `<line x1="${cx+hx*coff}" y1="${cy}" x2="${cx+hx*(coff+clen)}" y2="${cy}"/>` +
             `<line x1="${cx}" y1="${cy+vy*coff}" x2="${cx}" y2="${cy+vy*(coff+clen)}"/>`;
    };
    const marks = crop(tx,ty,-1,-1) + crop(trx,ty,1,-1) + crop(tx,tby,-1,1) + crop(trx,tby,1,1);
    return `<svg class="spec-cut" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#111" stroke-width="0.2" stroke-dasharray="0.15 1.7" stroke-linecap="round">
        <line x1="${tx}"  y1="${SAFE}" x2="${tx}"  y2="${iy}"/><line x1="${tx}"  y1="${ey}" x2="${tx}"  y2="${H-SAFE}"/>
        <line x1="${trx}" y1="${SAFE}" x2="${trx}" y2="${iy}"/><line x1="${trx}" y1="${ey}" x2="${trx}" y2="${H-SAFE}"/>
        <line x1="${SAFE}" y1="${ty}"  x2="${ix}" y2="${ty}"/><line x1="${ex}" y1="${ty}"  x2="${W-SAFE}" y2="${ty}"/>
        <line x1="${SAFE}" y1="${tby}" x2="${ix}" y2="${tby}"/><line x1="${ex}" y1="${tby}" x2="${W-SAFE}" y2="${tby}"/>
      </g>
      <g stroke="#111" stroke-width="0.25">${marks}</g>
    </svg>`;
  }

  /* ───────────────── 4) 카드 1면 (관측 1건) ─────────────────
     ※ 데이터 매핑은 여기만 고치면 됩니다 (sub 2번째 줄·분석 텍스트 등). */
  function cardHTML(e, side, cov, pageno) {
    const hex = (e.color || '#1a1a1a').toUpperCase();
    const rgb = _rgb(hex), r = rgb[0], g = rgb[1], b = rgb[2], c = _hsl(hex);
    const hsl = `${Math.round(c.h)}°,${Math.round(c.s*100)}%,${Math.round(c.l*100)}%`;
    // 옆 텍스트 = ACTUAL DATA 두 분류(designation=지정/위치 + topo=지형) + GEMINI 추론(visual).
    // GEMINI(visual)를 빼고 순수 ACTUAL만 두려면 아래 배열에서 e.visual 만 지우면 됩니다.
    // 눕힌 본문 = ACTUAL DATA 두 분류를 라벨로 구분: ■ DESIGNATION(designation) · ■ TOPOGRAPHICAL(topo).
    // GEMINI 추론(visual)을 세 번째 섹션으로 넣으려면 아래 cats 에 한 줄 추가하면 됩니다.
    const strip = function (s) { return (s || '').replace(/\*+/g, ''); };
    const cats = [];
    if (e.designation) cats.push(`<div class="vt-sec"><span class="vt-lbl">■ DESIGNATION</span>${strip(e.designation)}</div>`);
    if (e.topo)        cats.push(`<div class="vt-sec"><span class="vt-lbl">■ TOPOGRAPHICAL</span>${strip(e.topo)}</div>`);
    const analysis = cats.join('') || `<div class="vt-sec">${strip(e.keywords)}</div>`;
    return `<div class="spec-card ${side}">
      ${cutSVG()}
      <div class="spec-chip"><img src="${e.imgPath}" alt="" onerror="this.style.display='none'"></div>
      <div class="spec-coord">
        <div class="lat">${e.lat || ''}<br>${e.lon || ''}</div>
      </div>
      <div class="spec-raw">
        <div class="hd">RAW DATA</div>
        <div class="val"><span class="fid">FILE_ID ${e.fileId || '—'}</span>DATE ${e.captureDate || '—'}<br>RES ${e.resolution || '—'}<br>ALT ${e.sensorAlt || '—'}<br>ELEV ${e.groundElev || '—'}</div>
      </div>
      <div class="spec-color">
        <div class="hd"><span class="sw" style="background:${hex}"></span>${hex}</div>
        <div class="val">RGB(${r},${g},${b})<br>HSL(${hsl})${cov != null ? '<br>COVERAGE ' + cov + '%' : ''}</div>
      </div>
      <div class="spec-vtext"><div class="spec-vtext-in">${analysis}</div></div>
      <div class="spec-keys"><div class="hd">KEYWORDS</div><div class="kv">${e.keywords || '—'}</div></div>
      <div class="spec-pageno">${pageno}</div>
    </div>`;
  }

  /* ───────────────── 5) 문서 생성 : 1장=1카드, 짝=앞면 / 홀=뒷면 ───────────────── */
  async function buildSpecimenDocument() {
    const out = document.getElementById('print-output');
    if (!out) return;
    let dyn = document.getElementById('dyn-print-page');
    if (!dyn) { dyn = document.createElement('style'); dyn.id = 'dyn-print-page'; document.head.appendChild(dyn); }
    dyn.textContent = '@media print{@page{size:A4 portrait;margin:0}}';   // 기존 A3 덮어쓰기

    /* ▼ 인쇄에서 제외할 이미지 : FILE_ID(파일명)를 한 줄에 하나씩. 부분 문자열도 매칭됨.
         (데이터/CSV는 그대로 두고 인쇄에서만 뺍니다. 다시 넣으려면 그 줄을 지우거나 //로 주석) */
    const EXCLUDE = [
      '0F81C84A-4986-4827-B0C5-1BC12AE70FF2_4_5005_c.jpeg',
    ];
    const list = observationLog.filter(function (e) {
      return !EXCLUDE.some(function (x) { return x && (e.fileId || '').indexOf(x) !== -1; });
    });

    const covs = await Promise.all(list.map(function (e) { return coverage(e.imgPath, e.color); }));
    const total = list.length;
    out.innerHTML = list.map(function (e, i) {
      const pageno = String(i + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
      return `<section class="spec-page">${cardHTML(e, 'front', covs[i], pageno)}</section>`;
    }).join('');

    const imgs = Array.prototype.slice.call(out.querySelectorAll('.spec-chip img'));
    await Promise.all(imgs.map(function (im) {
      return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
    }));
  }
  window.buildSpecimenDocument = buildSpecimenDocument;   // 디버그/수동 호출용

  /* ───────────────── 6) PRINT 버튼 재바인딩 ───────────────── */
  function bind() {
    const btn = document.getElementById('print-btn');
    if (!btn) return;
    const fresh = btn.cloneNode(true);                 // 기존 핸들러 제거
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', async function () {
      if (!observationLog.length) { alert('수집된 데이터가 없습니다. 좌표를 먼저 관측하세요.'); return; }
      fresh.textContent = '[ 변환 중... ]';
      await buildSpecimenDocument();
      fresh.textContent = '[ PRINT ]';
      document.documentElement.classList.add('printing-specimen');
      document.body.classList.add('printing-specimen');
      window.print();
      setTimeout(function () {
        document.documentElement.classList.remove('printing-specimen');
        document.body.classList.remove('printing-specimen');
      }, 500);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();