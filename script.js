const app = document.getElementById('app');
const rightPanel = document.getElementById('right-panel');
const closeBtn = document.getElementById('close-btn');
const chipGrid = document.getElementById('chip-grid');

const imageCanvas = document.getElementById('main-image-canvas');
const ctx = imageCanvas.getContext('2d');
let currentImg = new Image();
currentImg.crossOrigin = "Anonymous";

const colorOverlay = document.getElementById('color-overlay');
const textCoord = document.getElementById('text-coord');
const textRaw = document.getElementById('text-raw');
const textGemini = document.getElementById('text-gemini');
const textActual = document.getElementById('text-actual');
const textVisual = document.getElementById('text-visual'); /* 추가 */
const dataContainer = document.querySelector('.data-container');

let rawText = "", geminiText = "", actualText = "", visualText = "";

// 1. 색상 추출 함수
function getAverageColor(imgSrc, callback) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imgSrc;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 1, 1);
        try {
            const data = ctx.getImageData(0, 0, 1, 1).data;
            const hex = "#" + ((1 << 24) + (data[0] << 16) + (data[1] << 8) + data[2]).toString(16).slice(1).toUpperCase();
            callback(hex);
        } catch (e) { callback("#333333"); }
    };
    img.onerror = () => callback("#333333");
}

// 2. 텍스트 내 컬러 스와치 생성
const getColorLine = (label, value) => {
    const textValue = value || 'N/A';
    const match = textValue.match(/#([0-9A-F]{6})/i);
    const hex = match ? match[0] : "#333";
    return `<b>${label.padEnd(10, '\u00A0')}</b> <span class="color-swatch" style="background:${hex}"></span> ${textValue}`;
};

// 3. 이미지 픽셀레이션 렌더링
function renderPixelated(progress) {
    if (!currentImg.src) return;
    const tw = imageCanvas.clientWidth;
    const th = imageCanvas.clientHeight;
    imageCanvas.width = tw; imageCanvas.height = th;
    const sw = currentImg.width; const sh = currentImg.height;
    const tarRatio = tw / th; const srcRatio = sw / sh;
    let cropW, cropH, startX, startY;
    if (srcRatio > tarRatio) {
        cropH = sh; cropW = sh * tarRatio;
        startX = (sw - cropW) / 2; startY = 0;
    } else {
        cropW = sw; cropH = sw / tarRatio;
        startX = 0; startY = (sh - cropH) / 2;
    }
    let blockSize = 80 - (79 * progress);
    let tinyW = Math.max(1, Math.floor(tw / blockSize));
    let tinyH = Math.max(1, Math.floor(th / blockSize));
    ctx.imageSmoothingEnabled = false;
    const off = document.createElement('canvas');
    off.width = tinyW; off.height = tinyH;
    const offCtx = off.getContext('2d');
    offCtx.drawImage(currentImg, startX, startY, cropW, cropH, 0, 0, tinyW, tinyH);
    ctx.drawImage(off, 0, 0, tinyW, tinyH, 0, 0, tw, th);
}

// 4. 타이핑 효과 함수
function getSyncedText(text, progress, start, end) {
    if (progress <= start) return "";
    if (progress >= end) return text;
    const ratio = (progress - start) / (end - start);
    const visibleText = text.replace(/<[^>]*>/g, "");
    const charLimit = Math.floor(ratio * visibleText.length);
    let result = ""; let visibleCount = 0; let i = 0;
    while (i < text.length && visibleCount < charLimit) {
        if (text[i] === '<') { 
            let tag = ""; while (i < text.length && text[i] !== '>') { tag += text[i]; i++; }
            tag += '>'; i++; result += tag;
        } else { result += text[i]; visibleCount++; i++; }
    }
    return result;
}

// 5. 데이터 파싱 및 렌더링 (핵심!)
Papa.parse("data.csv", {
    download: true,
    complete: function(results) {
        let validRows = results.data.slice(2).filter(row => row[1]);

        // [복구] 수민님의 좌표 변환 함수
        function parseDMS(dmsStr) {
            if (!dmsStr) return 0;
            const parts = dmsStr.match(/(\d+)°(\d+)'(\d+(?:\.\d+)?)"([NSEW])/);
            if (!parts) return 0;
            let decimal = parseFloat(parts[1]) + (parseFloat(parts[2]) / 60) + (parseFloat(parts[3]) / 3600);
            if (parts[4] === 'S' || parts[4] === 'W') decimal *= -1;
            return decimal;
        }

        let mapData = validRows.map(row => ({
            raw: row,
            lat: parseDMS(row[7]),
            lon: parseDMS(row[8])
        }));

        let sortedX = [...mapData].sort((a, b) => a.lon - b.lon);
        sortedX.forEach((d, i) => d.xRank = i);
        let sortedY = [...mapData].sort((a, b) => b.lat - a.lat);
        sortedY.forEach((d, i) => d.yRank = i);

        const totalPoints = mapData.length > 1 ? mapData.length - 1 : 1;
        let placed = []; 

        mapData.forEach((data) => {
            const row = data.raw;
            const wrapper = document.createElement('div');
            wrapper.className = 'chip-package';

            // [복구] 별자리 배치 로직
            let initialJitterX = (Math.random() - 0.5) * 15;
            let initialJitterY = (Math.random() - 0.5) * 12;
            let baseXPct = 8 + (data.xRank / totalPoints) * 75 + initialJitterX; 
            let baseYPct = 5 + (data.yRank / totalPoints) * 90 + initialJitterY;
            let xPercent = baseXPct; let yPercent = baseYPct;

            let isOverlapping = true; let attempts = 0; let radius = 0;
            while (isOverlapping && attempts < 150) { 
                isOverlapping = false;
                if (attempts > 0) {
                    let angle = Math.random() * Math.PI * 2;
                    xPercent = baseXPct + Math.cos(angle) * radius;
                    yPercent = baseYPct + Math.sin(angle) * (radius * 1.2); 
                }
                xPercent = Math.max(5, Math.min(85, xPercent));
                yPercent = Math.max(5, Math.min(95, yPercent));
                for (let i = 0; i < placed.length; i++) {
                    let p = placed[i];
                    if (Math.abs(xPercent - p.x) < 3.0 && Math.abs(yPercent - p.y) < 1.5) { isOverlapping = true; break; }
                }
                if (isOverlapping) { attempts++; radius += 0.15; }
            }
            placed.push({ x: xPercent, y: yPercent });
            wrapper.style.left = `${xPercent}%`; wrapper.style.top = `${yPercent}%`;

            const r = Math.random();
            if (r > 0.8 && r < 0.96) wrapper.classList.add('size-2');
            else if (r >= 0.96) wrapper.classList.add('size-3');

            const chip = document.createElement('div');
            chip.className = 'mini-chip';
            const labels = document.createElement('div');
            labels.className = 'chip-labels';
            labels.innerHTML = `LAT ${row[7]}<br>LON ${row[8]}`;
           // ✨ CSV에서 헥스(HEX) 색상 코드 뽑아내기
            const getHex = (val) => (val || '').match(/#([0-9A-F]{6})/i)?.[0] || 'transparent';
            const c1 = getHex(row[18]); const c2 = getHex(row[19]); 
            const c3 = getHex(row[20]); const c4 = getHex(row[21]);

            // ✨ 리스트 행 구조: 6개의 열로 완벽 분리
            const listRow = document.createElement('div');
            listRow.className = 'list-row';
            listRow.innerHTML = `
                <div class="col-id">${row[1]}</div>
                <div class="col-coord">LAT ${row[7]}<br>LON ${row[8]}</div>
                <div class="col-date">${row[3] || 'UNKNOWN'}</div>
                <div class="col-color">
                    <span class="list-color-swatch"></span>
                    <span class="hex-text">#...</span>
                </div>
                <div class="col-palette">
                    <span class="palette-swatch" style="background:${c1}"></span>
                    <span class="palette-swatch" style="background:${c2}"></span>
                    <span class="palette-swatch" style="background:${c3}"></span>
                    <span class="palette-swatch" style="background:${c4}"></span>
                </div>
                <div class="col-keyword">${row[22] || 'NO_KEYWORD'}</div> 
            `;

            listRow.addEventListener('click', () => { chip.click(); });

            getAverageColor(`images/${row[1]}`, (hex) => {
                chip.style.setProperty('--bg-color', hex); chip.dataset.avgColor = hex;
                const swatch = listRow.querySelector('.list-color-swatch');
                const hexText = listRow.querySelector('.hex-text');
                if (swatch) swatch.style.background = hex;
                if (hexText) hexText.textContent = hex;
            });

            // 칩 클릭 시 데이터 로드
            chip.addEventListener('click', () => {
              document.querySelectorAll('.mini-chip').forEach(c => c.classList.remove('active'));
                document.querySelectorAll('.chip-package').forEach(p => p.style.zIndex = ''); /* 다른 애들은 원래 층수로 복구 */
                document.querySelectorAll('.chip-labels').forEach(label => {
                    label.style.opacity = '';
                    label.style.fontWeight = '';
                    label.style.textShadow = ''; /* 텍스트 외곽선도 초기화 */
                });

                // 2. 누른 칩 테두리 켜기
                chip.classList.add('active');

                // 3. 누른 칩 패키지를 맨 위로 올리고, 텍스트 스타일 먹이기
                const packageEl = chip.closest('.chip-package');
                if (packageEl) {
                    packageEl.style.zIndex = '999'; /* ✨ 누른 칩을 무조건 가장 윗면으로 끌어올림 */
                    
                    const activeLabel = packageEl.querySelector('.chip-labels');
                    if (activeLabel) {
                        activeLabel.style.opacity = '1';
                        
                        /* ✨ 1. 글자 굵기 조절 (기존 700 -> 500으로 완화. 더 얇길 원하면 400) */
                        activeLabel.style.fontWeight = '500'; 
                        
                        /* ✨ 2. 글자 외곽선 (배경색으로 1px 테두리를 쳐서 다른 칩과 겹쳐도 뚫고 나옴!) */
                        activeLabel.style.textShadow = 'none'; 
                        activeLabel.style.webkitTextStroke = '2px var(--bg-left)'; /* 선 굵기 (원하시면 2px~4px 조절) */
                        activeLabel.style.paintOrder = 'stroke fill'; /* ✨ 핵심: 굵은 선을 글자 뒤로 숨겨서 뼈대를 침범하지 않게 함! */}
                }
                app.classList.add('split-mode');
                const menu = document.getElementById('top-right-menu');
                if (menu) { menu.style.opacity = '0'; menu.style.pointerEvents = 'none'; }
                rightPanel.scrollTop = 0;
                document.querySelector('.guide-text').style.display = 'none';
                const scrollInstr = document.querySelector('.scroll-instruction');
                scrollInstr.style.display = 'block';
                setTimeout(() => { scrollInstr.style.opacity = '1'; }, 10);

                // 박스가 없어도 에러가 나지 않도록 안전하게 분리
                if (textRaw) textRaw.innerHTML = '';
                if (textGemini) textGemini.innerHTML = '';
                if (textActual) textActual.innerHTML = '';
                if (textVisual) textVisual.innerHTML = '';
                document.querySelector('.data-container').style.transform = `translateY(0px)`;
                
                const overlayColor = chip.dataset.avgColor || '#333';
                colorOverlay.style.backgroundColor = overlayColor; colorOverlay.style.opacity = 1;
                document.getElementById('v-indicator').style.setProperty('--dynamic-glow', overlayColor);
                currentImg.src = `images/${row[1]}`;
                currentImg.onload = () => renderPixelated(0);
                textCoord.innerHTML = `LATITUDE: ${row[7]}<br>LONGITUDE: ${row[8]}`;
                // script.js 내의 각 텍스트 변수 설정 부분을 아래 구조로 감싸주세요.
                // <b class="title">은 왼쪽열로, <div class="content-wrapper">는 오른쪽열로 갑니다.

                rawText = `
                    <b class="title">[ Raw Data ]</b>
                    <div class="content-wrapper">
                        FILE_ID: ${row[1]}<br>
                        CAPTURE_DATE: ${row[3]}<br>
                        RESOLUTION: ${row[4]}<br>
                        SENSOR_ALTITUDE: ${row[6]}<br>
                        GROUND_ELEVATION: ${row[9]}
                    </div>`;

                geminiText = `
                    <b class="title">[ GEMINI INFERENCE_ ]</b>
                    <div class="content-wrapper">
                        <b>[Visual]</b> ${row[10]}
                        <b>[Geo-Pattern]</b> ${row[12]}
                        <b>[Palette]</b> ${row[13]}
                    </div>`;

                actualText = `
                    <b class="title">[ ACTUAL DATA ]</b>
                    <div class="content-wrapper">
                        <b>■ DESIGNATION</b> ${row[14]}
                        <b>■ TOPOGRAPHICAL</b> ${row[15]} ${row[17]}
                    </div>`;

                // ✨ 4개의 컬러가 모두 들어있는 완전판입니다!
                // ✨ 그냥 깔끔하게 4줄 세로 나열!
                visualText = `
                    <b class="title">[ VISUAL APPLICATION ]</b>
                    <div class="content-wrapper">
                        <b>■ COLOR SPEC</b> 
                        <div style="line-height: 1.8; margin-top: 5px;">
                            ${getColorLine('Primary', row[18])}<br>
                            ${getColorLine('Secondary', row[19])}<br>
                            ${getColorLine('Accent', row[20])}<br>
                            ${getColorLine('Shadow', row[21])}
                        </div>
                        <br>
                        <b>■ KEYWORDS</b> ${row[22]}
                    </div>`;
});


            wrapper.appendChild(chip); wrapper.appendChild(labels);
            chipGrid.appendChild(wrapper);
            document.getElementById('list-body').appendChild(listRow);
        });

        // [복구] 수민님표 "랜덤 딜레이" 애니메이션
        const allChips = Array.from(document.querySelectorAll('.chip-package'));
        allChips.sort(() => Math.random() - 0.5); 
        setTimeout(() => {
            allChips.forEach((c, i) => {
                const delay = (i * 120) + (Math.random() * 20); 
                setTimeout(() => { c.classList.add('show'); }, delay);
            });
        }, 600);
    } 
});

// 6. 패널 닫기 및 유틸리티
closeBtn.addEventListener('click', () => {
    app.classList.remove('split-mode');
    
    const menu = document.getElementById('top-right-menu');
    if (menu) { menu.style.opacity = '1'; menu.style.pointerEvents = 'auto'; }
    
    document.querySelectorAll('.mini-chip').forEach(c => c.classList.remove('active'));
    
   // ✨ 스크롤 안내 문구는 확실히 숨기고
    const scrollInstr = document.querySelector('.scroll-instruction');
    if (scrollInstr) {
        scrollInstr.style.display = 'none';
        scrollInstr.style.opacity = '0';
    }
    
    // ✨ [핵심] 처음에 있던 "클릭해보세요" 가이드 텍스트를 다시 보여줍니다
    const guideText = document.querySelector('.guide-text');
    if (guideText) {
        guideText.style.display = 'block'; // 다시 나타나게 함
    }
});


// --- 기존에 복잡하게 얽혀 있던 rightPanel 스크롤 이벤트 전체를 이걸로 교체하세요 ---

// --- script.js 맨 아래쪽 스크롤 이벤트 내부를 이 코드로 교체 ---
// ==========================================
// ✨ 스크롤 이벤트 전체 (이 블록으로 통째로 교체하세요!)
// ==========================================
rightPanel.addEventListener('scroll', () => {
    // 1. 스크롤 안내 문구 숨기기
    const scrollInstr = document.querySelector('.scroll-instruction');
    if (scrollInstr) scrollInstr.style.opacity = rightPanel.scrollTop > 10 ? '0' : '1'; 
    
    const navGuide = document.getElementById('nav-guide');
    if (navGuide) navGuide.style.opacity = rightPanel.scrollTop > 50 ? '0' : '1';
    
    // 2. 스크롤 진행도(progress) 계산
    const maxScroll = rightPanel.scrollHeight - rightPanel.clientHeight;
    if (maxScroll <= 0) return;
    const progress = rightPanel.scrollTop / maxScroll;
    
    // 3. ✨ 인디케이터 점 4개 제어 (수민님 오리지널 0단계 -> 3단계 로직)
    const vDots = [
        document.getElementById('v-d1'),
        document.getElementById('v-d2'),
        document.getElementById('v-d3'),
        document.getElementById('v-d4')
    ];
    // 일단 모든 점 끄기
    vDots.forEach(d => { if (d) d.classList.remove('active'); });
    if (progress >= 0.55) {
        if (vDots[3]) vDots[3].classList.add('active'); // Actual부터 끝까지 4번 점 유지
    } else if (progress >= 0.30) {
        if (vDots[2]) vDots[2].classList.add('active');
    } else if (progress >= 0.05) {
        if (vDots[1]) vDots[1].classList.add('active');
    } else {
        if (vDots[0]) vDots[0].classList.add('active'); // Idle
    }
    
    // 4. 이미지 픽셀레이션 및 컬러 오버레이 해제 (복구 완료)
    let visualProgress = Math.min(progress / 0.8, 1);
    if (colorOverlay) colorOverlay.style.opacity = 1 - visualProgress;
    if (typeof renderPixelated === 'function') renderPixelated(visualProgress);
    

    // 5. ✨ 텍스트 타이핑 효과 및 제미나이 팩트체크 & 경계선 모션
    if (textRaw) {
        textRaw.innerHTML = getSyncedText(rawText, progress, 0.05, 0.25);
    }
    
    if (textGemini) {
        // Raw Data 타이핑이 끝나는 0.25 직후에 제미나이 위쪽 선 생성
        if (progress > 0.25) textGemini.classList.add('show-line');
        else textGemini.classList.remove('show-line');

        textGemini.innerHTML = getSyncedText(geminiText, progress, 0.30, 0.50);
        
        // 제미나이 팩트체크(취소선) 모션
        if (progress > 0.52) textGemini.classList.add('rejected');
        else textGemini.classList.remove('rejected');
    }

    if (textActual) {
        // 제미나이 타이핑이 끝나는 0.50 직후에 실제 데이터 위쪽 선 생성
        if (progress > 0.50) textActual.classList.add('show-line');
        else textActual.classList.remove('show-line');

        textActual.innerHTML = getSyncedText(actualText, progress, 0.55, 0.80);
    }

    if (textVisual) {
        // 실제 데이터 타이핑이 끝나는 0.80 직후에 비주얼 위쪽 선 생성
        if (progress > 0.80) textVisual.classList.add('show-line');
        else textVisual.classList.remove('show-line');

        textVisual.innerHTML = getSyncedText(visualText, progress, 0.85, 1.0);
    }
    
    // 6. ✨ 스마트 스크롤 엔진 (가려짐 + 밑에 숨는 현상 완벽 해결)
    const textSection = document.querySelector('.text-section');
    if (dataContainer && textSection) {
        let yOffset = 0;
        
        // ✨ 스크롤의 40% 지점(Raw, Gemini 타이핑 구간)까지는 컨테이너를 제자리에 고정합니다.
        // 이렇게 하면 위경도 띠에 가려지지 않고 편안하게 읽을 수 있습니다.
        if (progress > 0.4) {
            // ✨ 40%를 넘어가면, 그때부터 끝까지 750px을 아주 스무스하게 끌어올립니다!
            // 750px이면 화면 밑에 숨어있던 비주얼 어플리케이션이 넉넉하게 다 올라옵니다.
            yOffset = ((progress - 0.4) / 0.6) * 950; 
        }
        
        dataContainer.style.transform = `translateY(-${yOffset}px)`;
    }
}); // <-- 스크롤 이벤트 끝나는 곳

// ==========================================
// 7. 뷰 전환 및 드롭다운 메뉴 (패널 자동 연동 완벽 적용)
// ==========================================
const viewToggleBtn = document.getElementById('view-toggle-btn');
const listView = document.getElementById('list-view');
let isListView = false; 

const aboutBtn = document.getElementById('about-btn');
const sourceBtn = document.getElementById('source-btn');
const aboutDropdown = document.getElementById('about-dropdown');
const sourceDropdown = document.getElementById('source-dropdown');

if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', () => {
        // ✨ 1. 현재 ABOUT이나 SOURCE 창이 열려있는지 상태 확인
        const isDropdownOpen = aboutDropdown.classList.contains('show') || sourceDropdown.classList.contains('show');

        // ✨ 2. 일단 열려있는 창부터 부드럽게 닫기 명령!
        if (aboutDropdown.classList.contains('show')) aboutDropdown.classList.remove('show');
        if (sourceDropdown.classList.contains('show')) sourceDropdown.classList.remove('show');

        // ✨ 3. 창이 열려있었다면 닫힐 시간(300ms)을 기다려주고, 아니면 즉시(0ms) 전환
        const delayTime = isDropdownOpen ? 300 : 0; 

        setTimeout(() => {
            isListView = !isListView;
            if (isListView) {
                chipGrid.style.display = 'none'; 
                listView.style.display = 'block';
                viewToggleBtn.textContent = '[ VIEW : GRID ]'; 
            } else {
                chipGrid.style.display = 'grid'; 
                listView.style.display = 'none';
                viewToggleBtn.textContent = '[ VIEW : LIST ]';
            }
        }, delayTime); // 계산된 딜레이 타임 적용
    });
}

aboutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // ✨ [추가] LIST 상태에서 ABOUT을 누르면 강제로 GRID 뷰로 돌려놓기
    if (isListView && viewToggleBtn) {
        viewToggleBtn.click(); // 사용자를 대신해서 VIEW 버튼을 눌러줍니다!
    }

    if (sourceDropdown.classList.contains('show')) {
        sourceDropdown.classList.remove('show');
        setTimeout(() => { aboutDropdown.classList.add('show'); }, 300);
    } else { aboutDropdown.classList.toggle('show'); }
});

sourceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // ✨ [추가] LIST 상태에서 SOURCE를 누르면 강제로 GRID 뷰로 돌려놓기
    if (isListView && viewToggleBtn) {
        viewToggleBtn.click();
    }

    if (aboutDropdown.classList.contains('show')) {
        aboutDropdown.classList.remove('show');
        setTimeout(() => { sourceDropdown.classList.add('show'); }, 300);
    } else { sourceDropdown.classList.toggle('show'); }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#top-right-menu')) {
        aboutDropdown.classList.remove('show'); 
        sourceDropdown.classList.remove('show');
    }
});

