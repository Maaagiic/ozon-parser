let shouldStop = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_parsing") {
        shouldStop = false;
        startParsing(parseInt(request.pages), parseInt(request.minPoints));
    }
    if (request.action === "stop_now") {
        shouldStop = true;
    }
    if (request.action === "run_background_check") {
        // Фоновая проверка из запущенной вкладки
        runBackgroundCheck(request.settings);
    }
});

function findTitleRobust(itemNode) {
    let bestTitle = "";
    function search(obj) {
        if (typeof obj === 'string') {
            if (/[а-яА-Я]/.test(obj) && obj.length > 15 && !obj.includes('/product/') && !obj.includes('осталось') && !obj.includes('баллов')) {
                if (obj.length > bestTitle.length) bestTitle = obj;
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (let key in obj) search(obj[key]);
        }
    }
    search(itemNode);
    return bestTitle || "Товар с выгодой";
}

function findImageRobust(itemNode) {
    let foundImg = "";
    function search(obj) {
        if (foundImg) return;
        if (typeof obj === 'string' && (obj.includes('cdn1.ozone.ru') || obj.includes('ir.ozone.ru')) && (obj.endsWith('.jpg') || obj.endsWith('.webp'))) {
            foundImg = obj; return;
        }
        if (typeof obj === 'object' && obj !== null) {
            for (let key in obj) search(obj[key]);
        }
    }
    search(itemNode);
    return foundImg || "https://ozon.ru/favicon.ico";
}

function extractItems(data) {
    let found = [];
    function traverse(node) {
        if (typeof node === 'object' && node !== null) {
            if (node.action && node.action.link && node.action.link.includes('/product/')) found.push(node);
            for (let key in node) {
                if (typeof node[key] === 'string' && node[key].startsWith('{"')) {
                    try { traverse(JSON.parse(node[key])); } catch (e) {}
                } else traverse(node[key]);
            }
        } else if (Array.isArray(node)) { node.forEach(traverse); }
    }
    traverse(data);
    return found;
}

function findNextPage(data) {
    let nextUrl = "";
    function traverse(node) {
        if (nextUrl) return;
        if (typeof node === 'object' && node !== null) {
            if (node.nextPage && typeof node.nextPage === 'string' && node.nextPage.includes('page=')) {
                nextUrl = node.nextPage; return;
            }
            for (let key in node) {
                if (typeof node[key] === 'string' && node[key].startsWith('{"')) {
                    try { traverse(JSON.parse(node[key])); } catch (e) {}
                } else traverse(node[key]);
            }
        } else if (Array.isArray(node)) { node.forEach(traverse); }
    }
    traverse(data);
    return nextUrl;
}

// --- РУЧНОЙ ПАРСИНГ ---
async function startParsing(maxPages, minPointsLimit) {
    chrome.runtime.sendMessage({ action: "parsing_started" });
    let currentTargetUrl = window.location.pathname + window.location.search;
    let allResults = [];
    let pageCount = 1;

    const delay = () => new Promise(res => setTimeout(res, Math.floor(Math.random() * 1000) + 1000));

    while (currentTargetUrl && pageCount <= maxPages && !shouldStop) {
        chrome.runtime.sendMessage({ action: "update_status", text: `Парсинг страницы ${pageCount} из ${maxPages}...` });
        
        try {
            const apiUrl = `https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=${encodeURIComponent(currentTargetUrl)}`;
            const response = await fetch(apiUrl, {
                headers: { 'accept': 'application/json', 'x-o3-app-name': 'dweb_client' }
            });
            
            const data = await response.json();
            const items = extractItems(data);

            items.forEach(item => {
                const itemStr = JSON.stringify(item).toLowerCase();
                const pointsMatch = itemStr.match(/(\d[\d\s\u2009]*)\s*баллов за отзыв/);
                const priceMatch = itemStr.match(/(\d[\d\s\u2009]*)\u20bd/);
                
                if (pointsMatch && priceMatch) {
                    const points = parseInt(pointsMatch[1].replace(/\D/g, ''));
                    const price = parseInt(priceMatch[1].replace(/\D/g, ''));
                    if (points >= minPointsLimit) {
                        allResults.push({
                            points, price, roi: +((points / price) * 100).toFixed(1),
                            title: findTitleRobust(item),
                            image: findImageRobust(item),
                            url: "https://www.ozon.ru" + item.action.link.split('?')[0]
                        });
                    }
                }
            });

            currentTargetUrl = findNextPage(data);
            if (currentTargetUrl && pageCount < maxPages && !shouldStop) {
                pageCount++;
                await delay();
            } else break;
        } catch (e) { break; }
    }

    const unique = Array.from(new Map(allResults.map(i => [i.url, i])).values()).sort((a,b) => b.roi - a.roi);
    chrome.storage.local.set({ ozonResults: unique }, () => {
        chrome.runtime.sendMessage({ action: "parsing_finished" });
    });
}

// --- ФОНОВАЯ ПРОВЕРКА ---
// Запрос идёт из открытой вкладки Ozon с её сессией, поэтому сайт не отвечает 403
async function runBackgroundCheck(settings) {
    try {
        const urlObj = new URL(settings.targetUrl);
        const apiUrl = `https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=${encodeURIComponent(urlObj.pathname + urlObj.search)}`;
        
        const response = await fetch(apiUrl, {
            headers: { 'accept': 'application/json', 'x-o3-app-name': 'dweb_client' }
        });

        if (response.ok) {
            const data = await response.json();
            const items = extractItems(data);
            let foundItems = [];

            items.forEach(item => {
                const itemStr = JSON.stringify(item).toLowerCase();
                const pointsMatch = itemStr.match(/(\d[\d\s\u2009]*)\s*баллов за отзыв/);
                const priceMatch = itemStr.match(/(\d[\d\s\u2009]*)\u20bd/);
                
                if (pointsMatch && priceMatch) {
                    const points = parseInt(pointsMatch[1].replace(/\D/g, ''));
                    const price = parseInt(priceMatch[1].replace(/\D/g, ''));
                    
                    if (points >= settings.minPoints) {
                        const itemUrl = "https://www.ozon.ru" + item.action.link.split('?')[0];
                        const itemId = itemUrl.split('/')[4] || itemUrl; 
                        
                        foundItems.push({
                            id: itemId,
                            points: points, 
                            price: price, 
                            roi: +((points / price) * 100).toFixed(1),
                            title: findTitleRobust(item),
                            image: findImageRobust(item),
                            url: itemUrl
                        });
                    }
                }
            });

            // Отправляем массив объектов обратно в фон
            chrome.runtime.sendMessage({ action: "background_items_found", items: foundItems });
        }
    } catch (e) {}
}