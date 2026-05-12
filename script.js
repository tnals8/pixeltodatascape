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
const dataContainer = document.querySelector('.data-container');

let rawText = "", geminiText = "", actualText = "";

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

const getColorLine = (label, value) => {
    const textValue = value || 'N/A';
    const match = textValue.match(/#([0-9A-F]{6})/i);
    const hex = match ? match[0] : "#333";
    return `<b>${label.padEnd(10, '\u00A0')}</b> <
    an class="color-swatch" style="background:${hex}"></span> ${textValue}`;
};

function renderPixelated(progress) {
    if (!currentImg.src) return;
    
    const tw = imageCanvas.clientWidth;
    const th = imageCanvas.clientHeight;
    imageCanvas.width = tw;
    imageCanvas.height = th;

    const sw = currentImg.width;
    const sh = currentImg.height;
    const tarRatio = tw / th;
    const srcRatio = sw / sh;
    
    let cropW, cropH, startX, startY;
    
    if (srcRatio > tarRatio) {
        cropH = sh;
        cropW = sh * tarRatio;
        startX = (sw - cropW) / 2;
        startY = 0;
    } else {
        cropW = sw;
        cropH = sw / tarRatio;
        startX = 0;
        startY = (sh - cropH) / 2;
    }

    let blockSize = 80 - (79 * progress);
    let tinyW = Math.max(1, Math.floor(tw / blockSize));
    let tinyH = Math.max(1, Math.floor(th / blockSize));
    
    ctx.imageSmoothingEnabled = false;
    
    const off = document.createElement('canvas');
    off.width = tinyW; 
    off.height = tinyH;
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

            let initialJitterX = (Math.random() - 0.5) * 15;
            let initialJitterY = (Math.random() - 0.5) * 12;

            let baseXPct = 8 + (data.xRank / totalPoints) * 75 + initialJitterX; 
            let baseYPct = 5 + (data.yRank / totalPoints) * 90 + initialJitterY;

            let xPercent = baseXPct;
            let yPercent = baseYPct;

            let isOverlapping = true;
            let attempts = 0;
            let radius = 0;

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
                    let dx = Math.abs(xPercent - p.x);
                    let dy = Math.abs(yPercent - p.y);
                    if (dx < 3.0 && dy < 1.5) { 
                        isOverlapping = true;
                        break;
                    }
                }
                if (isOverlapping) {
                    attempts++;
                    radius += 0.15;
                }
            }
            
            placed.push({ x: xPercent, y: yPercent });
            wrapper.style.left = `${xPercent}%`;
            wrapper.style.top = `${yPercent}%`;

            const r = Math.random();
            if (r > 0.8 && r < 0.96) wrapper.classList.add('size-2');
            else if (r >= 0.96) wrapper.classList.add('size-3');

            const chip = document.createElement('div');
            chip.className = 'mini-chip';
            getAverageColor(`images/${row[1]}`, (hex) => {
                chip.style.setProperty('--bg-color', hex);
                chip.dataset.avgColor = hex;
            });

            const labels = document.createElement('div');
            labels.className = 'chip-labels';
            labels.innerHTML = `<div>LAT ${row[7] || 'N/A'}</div><div>LON ${row[8] || 'N/A'}</div>`;

            chip.addEventListener('click', () => {
                
                document.querySelectorAll('.mini-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                app.classList.add('split-mode');
                // 칩 클릭 시 패널 열릴 때
                app.classList.add('split-mode');
                const menu = document.getElementById('top-right-menu');
                if (menu) {
                    menu.style.opacity = '0';
                    menu.style.pointerEvents = 'none';
                }
                document.getElementById('top-right-menu').style.opacity = '0';
                document.getElementById('top-right-menu').style.pointerEvents = 'none';
                document.getElementById('top-right-menu').style.opacity = '0';
                document.getElementById('top-right-menu').style.pointerEvents = 'none';
                // ✨ [추가 1] 패널이 열리면 우측 상단 메뉴 숨기기
                document.getElementById('top-right-menu').style.opacity = '0';
                document.getElementById('top-right-menu').style.pointerEvents = 'none';
                rightPanel.scrollTop = 0;
                document.querySelector('.guide-text').style.display = 'none';
                const scrollInstr = document.querySelector('.scroll-instruction');
                scrollInstr.style.display = 'block';
                setTimeout(() => { scrollInstr.style.opacity = '1'; }, 10);
                textRaw.innerHTML = textGemini.innerHTML = textActual.innerHTML = '';
                document.querySelector('.data-container').style.transform = `translateY(0px)`;

                const overlayColor = chip.dataset.avgColor || '#333';
                colorOverlay.style.backgroundColor = overlayColor;
                colorOverlay.style.opacity = 1;

                // ✨ [이 줄을 추가하세요!] 인디케이터의 빛 색상을 현재 칩의 색상으로 바꿈
                document.getElementById('v-indicator').style.setProperty('--dynamic-glow', overlayColor);

                currentImg.src = `images/${row[1]}`;
                currentImg.onload = () => renderPixelated(0);

                textCoord.innerHTML = `LATITUDE: ${row[7]}<br>LONGITUDE: ${row[8]}`;

                rawText = `<b class="title">[ Raw Data ]</b>\nFILE_ID: ${row[1]}\nCAPTURE_DATE: ${row[3]}\nRESOLUTION: ${row[4]}\nSENSOR_ALTITUDE: ${row[6]}\nGROUND_ELEVATION: ${row[9]}`;
                geminiText = `<b class="title">[ GEMINI INFERENCE_ ]</b>\n[Visual]\n${row[10]}\n\n[Geo-Pattern]\n${row[12]}\n\n[Palette]\n${row[13]}`;
                actualText = `<b class="title">[ ARCHIVE: GROUND TRUTH_ ]</b>\n<b>■ DESIGNATION</b>\n${row[14]}\n\n<b>■ TOPOGRAPHICAL</b>\n${row[15]} ${row[17]}\n\n<b>■ COLOR SPEC</b>\n${getColorLine('Primary', row[18])}\n${getColorLine('Secondary', row[19])}\n${getColorLine('Accent', row[20])}\n${getColorLine('Shadow', row[21])}\n\n<b>■ KEYWORDS</b>\n${row[22]}`;
            });

            wrapper.appendChild(chip);
            wrapper.appendChild(labels);
            chipGrid.appendChild(wrapper);
        });

        // ✨ 칩 순차적 등장 로직 (수정 완료!)
        const allChips = Array.from(document.querySelectorAll('.chip-package'));
        allChips.sort(() => Math.random() - 0.5);
        
        setTimeout(() => {
            allChips.forEach((chip, index) => {
                const delay = (index * 120) + (Math.random() * 20); 
                setTimeout(() => {
                    chip.classList.add('show');
                }, delay);
            });
        }, 600); 

    } // complete 함수 닫기
}); // Papa.parse 닫기[cite: 7]

closeBtn.addEventListener('click', () => {
    app.classList.remove('split-mode');
    const menu = document.getElementById('top-right-menu');
    if (menu) {
        menu.style.opacity = '1';
        menu.style.pointerEvents = 'auto';
    }
    document.getElementById('top-right-menu').style.opacity = '1';
    document.getElementById('top-right-menu').style.pointerEvents = 'auto';
    document.getElementById('top-right-menu').style.opacity = '1';
    document.getElementById('top-right-menu').style.pointerEvents = 'auto';
    document.querySelectorAll('.mini-chip').forEach(c => c.classList.remove('active'));
document.getElementById('nav-guide').style.opacity = '1'; // 혹시 스크롤해서 투명해졌다면 다시 100% 보이게 복구
    document.querySelector('.scroll-instruction').style.display = 'none'; // SCROLL 문구 숨기기
    document.querySelector('.scroll-instruction').style.opacity = '0';
    document.querySelector('.guide-text').style.display = 'block'; // CLICK 문구 다시 등장!
});

rightPanel.addEventListener('scroll', () => {
    const navGuide = document.getElementById('nav-guide');
    if (rightPanel.scrollTop > 50) {
        navGuide.style.opacity = '0';
    } else {
        navGuide.style.opacity = '1';
    }
    if (rightPanel.scrollTop > 50) {
        document.getElementById('nav-guide').style.opacity = '0';
    } else {
        document.getElementById('nav-guide').style.opacity = '1';
    }
    
    const maxScroll = rightPanel.scrollHeight - rightPanel.clientHeight;
    if (maxScroll <= 0) return;
    const progress = rightPanel.scrollTop / maxScroll;
    
    let visualProgress = Math.min(progress / 0.8, 1);
    colorOverlay.style.opacity = 1 - visualProgress;
    renderPixelated(visualProgress);
    
    textRaw.innerHTML = getSyncedText(rawText, progress, 0.05, 0.25);
    textGemini.innerHTML = getSyncedText(geminiText, progress, 0.30, 0.50);
    textActual.innerHTML = getSyncedText(actualText, progress, 0.55, 0.85);

    if (progress >= 0.55) {
        textGemini.classList.add('corrected');
    } else {
        textGemini.classList.remove('corrected');
    }

    const textSection = document.querySelector('.text-section');
    const contentHeight = dataContainer.scrollHeight;
    const viewHeight = textSection.clientHeight;
    if (contentHeight > viewHeight) {
        const maxMove = contentHeight - viewHeight + 120;
        dataContainer.style.transform = `translateY(-${progress * maxMove}px)`;
    } else {
        // ✨ 이 세 줄을 추가해 주세요! 
        // 텍스트가 지워져서 상자가 짧아지면 다시 맨 밑(원래 위치)으로 부드럽게 내려놓습니다.
        dataContainer.style.transform = `translateY(0px)`;
    }

    const vDots = [
        document.getElementById('v-d1'),
        document.getElementById('v-d2'),
        document.getElementById('v-d3'),
        document.getElementById('v-d4')
    ];
    vDots.forEach(d => d.classList.remove('active'));
    
    if (progress >= 0.55) vDots[3].classList.add('active');
    else if (progress >= 0.30) vDots[2].classList.add('active');
    else if (progress >= 0.05) vDots[1].classList.add('active');
    else vDots[0].classList.add('active');
});

window.addEventListener('resize', () => {
    if (app.classList.contains('split-mode')) renderPixelated(1 - Number(colorOverlay.style.opacity));
});

const themeToggleBtn = document.getElementById('theme-toggle');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        if (document.body.classList.contains('dark-mode')) {
            themeToggleBtn.textContent = '[ LIGHT_MODE ]';
        } else {
            themeToggleBtn.textContent = '[ DARK_MODE ]';
        }
    });
}
// =========================================
// ✨ ABOUT / SOURCE 드롭다운 열기 / 닫기
// =========================================
const aboutBtn = document.getElementById('about-btn');
const sourceBtn = document.getElementById('source-btn');
const aboutDropdown = document.getElementById('about-dropdown');
const sourceDropdown = document.getElementById('source-dropdown');

// ABOUT 클릭 시
aboutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (sourceDropdown.classList.contains('show')) {
        sourceDropdown.classList.remove('show'); 
        setTimeout(() => { 
            aboutDropdown.classList.add('show'); 
        }, 300); // ✨ 사라지는 게 빨라졌으니 300으로 원복
    } else {
        aboutDropdown.classList.toggle('show');
    }
});

// SOURCE 클릭 시
sourceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (aboutDropdown.classList.contains('show')) {
        aboutDropdown.classList.remove('show');
        setTimeout(() => { 
            sourceDropdown.classList.add('show'); 
        }, 300); // ✨ 300으로 원복
    } else {
        sourceDropdown.classList.toggle('show');
    }
});

// 화면 아무 곳이나 클릭하면 열려있는 창 닫기
document.addEventListener('click', (e) => {
    if (!e.target.closest('#top-right-menu')) {
        if (aboutDropdown) aboutDropdown.classList.remove('show');
        if (sourceDropdown) sourceDropdown.classList.remove('show');
    }
});