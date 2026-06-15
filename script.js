const app = document.getElementById('app');
const rightPanel = document.getElementById('right-panel');
const closeBtn = document.getElementById('close-btn');
const chipGrid = document.getElementById('chip-grid');

const imageCanvas = document.getElementById('main-image-canvas');
const ctx = imageCanvas.getContext('2d');
let currentImg = new Image();

const colorOverlay = document.getElementById('color-overlay');
const textCoord = document.getElementById('text-coord');
const textRaw = document.getElementById('text-raw');
const textGemini = document.getElementById('text-gemini');
const textActual = document.getElementById('text-actual');
const textVisual = document.getElementById('text-visual'); 
const dataContainer = document.querySelector('.data-container');

let rawText = "", geminiText = "", actualText = "", visualText = "";

function getAverageColor(imgSrc, callback) {
    const img = new Image();
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

const getColorLine = (label, value) => {
    const textValue = value || 'N/A';
    const match = textValue.match(/#([0-9A-F]{6})/i);
    const hex = match ? match[0] : "#333";
    return `<b>${label.padEnd(10, '\u00A0')}</b> <span class="color-swatch" style="background:${hex}"></span> ${textValue}`;
};

// 정돈 패널용: 라벨 없이 스와치 + hex 만 (kv 행의 값으로 사용)
const colSw = (value) => {
    const m = (value || '').match(/#([0-9A-F]{6})/i);
    const hex = m ? m[0] : '#333';
    return `<span class="color-swatch" style="background:${hex}"></span> ${hex}`;
};

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

Papa.parse("data.csv", {
    download: true,
    complete: function(results) {
        let validRows = results.data.slice(2).filter(row => row[1]);

        function parseDMS(dmsStr) {
            if (!dmsStr) return 0;
            const parts = dmsStr.match(/(\d+)°(\d+)'(\d+(?:\.\d+)?)"([NSEW])/);
            if (!parts) return 0;
            let decimal = parseFloat(parts[1]) + (parseFloat(parts[2]) / 60) + (parseFloat(parts[3]) / 3600);
            if (parts[4] === 'S' || parts[4] === 'W') decimal *= -1;
            return decimal;
        }

        let mapData = validRows.map(row => ({
            raw: row, lat: parseDMS(row[7]), lon: parseDMS(row[8])
        }));

        let sortedX = [...mapData].sort((a, b) => a.lon - b.lon);
        sortedX.forEach((d, i) => d.xRank = i);
        let sortedY = [...mapData].sort((a, b) => b.lat - a.lat);
        sortedY.forEach((d, i) => d.yRank = i);

        const totalPoints = mapData.length > 1 ? mapData.length - 1 : 1;
        let placed = []; 

        mapData.forEach((data) => {
            const row = data.raw;
            // 강조 별표(*) 일괄 제거: 이 행의 모든 문자열 셀에서 * 삭제 → 화면 디코드·리스트·로그·기록·인쇄 전부 적용
            for (let i = 0; i < row.length; i++) { if (typeof row[i] === 'string') row[i] = row[i].replace(/\*+/g, ''); }
            const wrapper = document.createElement('div');
            wrapper.className = 'chip-package';

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
            chip.dataset.fileid = row[1]; 
            const labels = document.createElement('div');
            labels.className = 'chip-labels';
            labels.innerHTML = `LAT ${row[7]}<br>LON ${row[8]}`;
            const getHex = (val) => (val || '').match(/#([0-9A-F]{6})/i)?.[0] || 'transparent';
            const c1 = getHex(row[18]); const c2 = getHex(row[19]); 
            const c3 = getHex(row[20]); const c4 = getHex(row[21]);

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

            chip.addEventListener('click', () => {
                document.querySelectorAll('.mini-chip').forEach(c => c.classList.remove('active'));
                document.querySelectorAll('.chip-package').forEach(p => p.style.zIndex = ''); 
                document.querySelectorAll('.chip-labels').forEach(label => {
                    label.style.opacity = ''; label.style.fontWeight = ''; label.style.textShadow = ''; 
                });

                chip.classList.add('visited');

                
                chip.classList.add('active');
                const packageEl = chip.closest('.chip-package');
                if (packageEl) {
                    packageEl.style.zIndex = '999'; 
                    const activeLabel = packageEl.querySelector('.chip-labels');
                    if (activeLabel) {
                        activeLabel.style.opacity = '1'; activeLabel.style.fontWeight = '500'; 
                        activeLabel.style.textShadow = 'none'; 
                        activeLabel.style.webkitTextStroke = '2px var(--bg-left)'; 
                        activeLabel.style.paintOrder = 'stroke fill'; 
                    }
                }
                app.classList.add('split-mode');
                const menu = document.getElementById('top-right-menu');
                if (menu) { menu.style.opacity = '0'; menu.style.pointerEvents = 'none'; }
                rightPanel.scrollTop = 0;
                const guideTextEl = document.querySelector('.guide-text');
                if (guideTextEl) guideTextEl.style.display = 'none';
                const scrollInstr = document.querySelector('.scroll-instruction');
                if (scrollInstr) {
                    scrollInstr.style.display = 'block';
                    setTimeout(() => { scrollInstr.style.opacity = '1'; }, 10);
                }

                if (textRaw) textRaw.innerHTML = '';
                if (textGemini) textGemini.innerHTML = '';
                if (textActual) textActual.innerHTML = '';
                if (textVisual) textVisual.innerHTML = '';
                document.querySelector('.data-container').style.transform = '';
                
                const overlayColor = chip.dataset.avgColor || '#333';
                colorOverlay.style.backgroundColor = overlayColor; colorOverlay.style.opacity = 1;
                document.getElementById('v-indicator').style.setProperty('--dynamic-glow', overlayColor);

                recordObservation({
                    fileId: row[1], lat: row[7], lon: row[8], color: overlayColor, keywords: row[22] || '',
                    imgPath: `images/${row[1]}`, captureDate: row[3] || '', resolution: row[4] || '', sensorAlt: row[6] || '', groundElev: row[9] || '',
                    visual: row[10] || '', geoPattern: row[12] || '', palette: row[13] || '', designation: row[14] || '', topo: `${row[15] || ''} ${row[17] || ''}`.trim(),
                    colPrimary: row[18] || '', colSecondary: row[19] || '', colAccent: row[20] || '', colShadow: row[21] || ''
                });
                currentImg.src = `images/${row[1]}`;
                currentImg.onload = () => renderPixelated(0);
                textCoord.innerHTML = `LATITUDE: ${row[7]}<br>LONGITUDE: ${row[8]}`;

                rawText = `
                    <b class="title">[ Raw Data ]</b>
                    <div class="content-wrapper"><div class="kv-rows">
                        <div class="kv"><span class="k">FILE_ID</span><span class="v">${row[1]}</span></div>
                        <div class="kv"><span class="k">CAPTURE_DATE</span><span class="v">${row[3]}</span></div>
                        <div class="kv"><span class="k">RESOLUTION</span><span class="v">${row[4]}</span></div>
                        <div class="kv"><span class="k">SENSOR_ALTITUDE</span><span class="v">${row[6]}</span></div>
                        <div class="kv"><span class="k">GROUND_ELEVATION</span><span class="v">${row[9]}</span></div>
                    </div></div>`;

                geminiText = `
                    <b class="title">[ INFERENCE DATA ]</b>
                    <div class="content-wrapper">
                        <div class="field"><b>Visual</b><div class="v">${row[10]}</div></div>
                        <div class="field"><b>Geo-Pattern</b><div class="v">${row[12]}</div></div>
                        <div class="field"><b>Palette</b><div class="v">${row[13]}</div></div>
                    </div>`;

                actualText = `
                    <b class="title">[ ACTUAL DATA ]</b>
                    <div class="content-wrapper">
                        <div class="field"><b>■ DESIGNATION</b><div class="v">${row[14]}</div></div>
                        <div class="field"><b>■ TOPOGRAPHICAL</b><div class="v">${row[15]} ${row[17]}</div></div>
                    </div>`;

                visualText = `
                    <b class="title">[ VISUAL APPLICATION ]</b>
                    <div class="content-wrapper">
                        <div class="field"><b>■ COLOR SPEC</b>
                            <div class="kv-rows">
                                <div class="kv"><span class="k">Primary</span><span class="v">${colSw(row[18])}</span></div>
                                <div class="kv"><span class="k">Secondary</span><span class="v">${colSw(row[19])}</span></div>
                                <div class="kv"><span class="k">Accent</span><span class="v">${colSw(row[20])}</span></div>
                                <div class="kv"><span class="k">Shadow</span><span class="v">${colSw(row[21])}</span></div>
                            </div>
                        </div>
                        <div class="field"><b>■ KEYWORDS</b><div class="v">${row[22]}</div></div>
                    </div>`;
            });

            wrapper.appendChild(chip); wrapper.appendChild(labels);
            chipGrid.appendChild(wrapper);
            document.getElementById('list-body').appendChild(listRow);
        });

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

closeBtn.addEventListener('click', () => {
    app.classList.remove('split-mode');
    const menu = document.getElementById('top-right-menu');
    if (menu) { menu.style.opacity = '1'; menu.style.pointerEvents = 'auto'; }
    document.querySelectorAll('.mini-chip').forEach(c => c.classList.remove('active'));
    const scrollInstr = document.querySelector('.scroll-instruction');
    if (scrollInstr) { scrollInstr.style.display = 'none'; scrollInstr.style.opacity = '0'; }
    const guideText = document.querySelector('.guide-text');
    if (guideText) { guideText.style.display = 'block'; }
});

rightPanel.addEventListener('scroll', () => {
    const scrollInstr = document.querySelector('.scroll-instruction');
    if (scrollInstr) scrollInstr.style.opacity = rightPanel.scrollTop > 10 ? '0' : '1'; 
    const navGuide = document.getElementById('nav-guide');
    if (navGuide) navGuide.style.opacity = rightPanel.scrollTop > 50 ? '0' : '1';
    const maxScroll = rightPanel.scrollHeight - rightPanel.clientHeight;
    if (maxScroll <= 0) return;
    const progress = rightPanel.scrollTop / maxScroll;
    
    const vDots = [
        document.getElementById('v-d1'), document.getElementById('v-d2'),
        document.getElementById('v-d3'), document.getElementById('v-d4')
    ];
    vDots.forEach(d => { if (d) d.classList.remove('active'); });
    if (progress >= 0.55) { if (vDots[3]) vDots[3].classList.add('active'); }
    else if (progress >= 0.30) { if (vDots[2]) vDots[2].classList.add('active'); }
    else if (progress >= 0.05) { if (vDots[1]) vDots[1].classList.add('active'); }
    else { if (vDots[0]) vDots[0].classList.add('active'); }
    
    let visualProgress = Math.min(progress / 0.8, 1);
    if (colorOverlay) colorOverlay.style.opacity = 1 - visualProgress;
    if (typeof renderPixelated === 'function') renderPixelated(visualProgress);
    
    if (textRaw) textRaw.innerHTML = getSyncedText(rawText, progress, 0.05, 0.25);
    if (textGemini) {
        if (progress > 0.25) textGemini.classList.add('show-line'); else textGemini.classList.remove('show-line');
        textGemini.innerHTML = getSyncedText(geminiText, progress, 0.30, 0.50);
        if (progress > 0.52) textGemini.classList.add('rejected'); else textGemini.classList.remove('rejected');
    }
    if (textActual) {
        if (progress > 0.50) textActual.classList.add('show-line'); else textActual.classList.remove('show-line');
        textActual.innerHTML = getSyncedText(actualText, progress, 0.55, 0.80);
    }
    if (textVisual) {
        if (progress > 0.80) textVisual.classList.add('show-line'); else textVisual.classList.remove('show-line');
        textVisual.innerHTML = getSyncedText(visualText, progress, 0.85, 1.0);
    }
    
    const textSection = document.querySelector('.text-section');
    if (dataContainer && textSection) {
        const overflow = dataContainer.scrollHeight - textSection.clientHeight;
        const holdUntil = 0.25; 
        if (overflow > 0 && progress > holdUntil) {
            const pullProgress = (progress - holdUntil) / (1 - holdUntil);
            dataContainer.style.transform = `translateY(-${overflow * pullProgress}px)`;
        } else { dataContainer.style.transform = ''; }
    }
});

const viewToggleBtn = document.getElementById('view-toggle-btn');
const listView = document.getElementById('list-view');
const logView = document.getElementById('log-view');
let viewMode = 'GRID'; let isListView = false;
const aboutBtn = document.getElementById('about-btn');
const sourceBtn = document.getElementById('source-btn');
const aboutDropdown = document.getElementById('about-dropdown');
const sourceDropdown = document.getElementById('source-dropdown');

if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', () => {
        const isDropdownOpen = aboutDropdown.classList.contains('show') || sourceDropdown.classList.contains('show');
        if (aboutDropdown.classList.contains('show')) aboutDropdown.classList.remove('show');
        if (sourceDropdown.classList.contains('show')) sourceDropdown.classList.remove('show');
        const delayTime = isDropdownOpen ? 300 : 0; 
        setTimeout(() => {
            viewMode = (viewMode === 'GRID') ? 'LOG' : 'GRID'; isListView = (viewMode !== 'GRID');
            chipGrid.style.display = (viewMode === 'GRID') ? 'block' : 'none'; listView.style.display = 'none';
            if (logView) logView.style.display = (viewMode === 'LOG') ? 'block' : 'none';
            const nextLabel = (viewMode === 'GRID') ? 'LOG' : 'GRID'; viewToggleBtn.textContent = `[ VIEW : ${nextLabel} ]`;
        }, delayTime); 
    });
}

function resetToGrid() {
    viewMode = 'GRID'; isListView = false; chipGrid.style.display = 'block'; listView.style.display = 'none';
    if (logView) logView.style.display = 'none'; if (viewToggleBtn) viewToggleBtn.textContent = '[ VIEW : LOG ]';
}

aboutBtn.addEventListener('click', (e) => {
    e.stopPropagation(); if (isListView) resetToGrid();
    if (sourceDropdown.classList.contains('show')) { sourceDropdown.classList.remove('show'); setTimeout(() => { aboutDropdown.classList.add('show'); }, 300); }
    else { aboutDropdown.classList.toggle('show'); }
});

sourceBtn.addEventListener('click', (e) => {
    e.stopPropagation(); if (isListView) resetToGrid();
    if (aboutDropdown.classList.contains('show')) { aboutDropdown.classList.remove('show'); setTimeout(() => { sourceDropdown.classList.add('show'); }, 300); }
    else { sourceDropdown.classList.toggle('show'); }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#top-right-menu')) { aboutDropdown.classList.remove('show'); sourceDropdown.classList.remove('show'); }
});

const observationLog = []; const seenFileIds = new Set(); 
function recordObservation(entry) {
    if (seenFileIds.has(entry.fileId)) return; seenFileIds.add(entry.fileId);
    entry.time = new Date(); observationLog.push(entry); renderLog();
}

function renderLog() {
    const logBody = document.getElementById('log-body'); const logCount = document.getElementById('log-count'); const logEmpty = document.getElementById('log-empty');
    if (!logBody) return;
    if (logCount) logCount.textContent = `COLLECTED : ${observationLog.length}`;
    if (observationLog.length === 0) { if (logEmpty) logEmpty.style.display = 'block'; return; }
    if (logEmpty) logEmpty.style.display = 'none';
    logBody.innerHTML = observationLog.map((e, i) => {
        const idx = String(i + 1).padStart(3, '0'); const t = e.time.toLocaleTimeString('en-GB'); 
        return `<div class="log-row" data-fileid="${e.fileId}">
                <span class="lc-idx">${idx}</span><span class="lc-id">${e.fileId}</span><span class="lc-coord">${e.lat} / ${e.lon}</span>
                <span class="lc-color"><span class="log-swatch" style="background:${e.color};"></span><span class="lc-hex">${e.color.toUpperCase()}</span></span>
                <span class="lc-time">${t}</span><span class="lc-keyword">${e.keywords || 'NO_KEYWORD'}</span>
            </div>`;
    }).join('');
    logBody.querySelectorAll('.log-row').forEach(rowEl => {
        rowEl.addEventListener('click', () => {
            const fid = rowEl.dataset.fileid; const chip = document.querySelector(`.mini-chip[data-fileid="${CSS.escape(fid)}"]`);
            if (chip) { resetToGrid(); chip.click(); }
        });
    });
}


/* ───────────────────────────────────────────────────────────────────────────
   [정리됨] 기존 접지(폴드) 인쇄 시스템(구 417줄~끝)은 제거했습니다.
   인쇄는 specimen-print.js(표본 카드 모드)가 PRINT 버튼을 바인딩해 담당합니다.
   index.html 의 <script src="script.js"></script> 다음 줄에
   <script src="specimen-print.js"></script> 한 줄만 추가하면 됩니다.
   ─────────────────────────────────────────────────────────────────────────── */
