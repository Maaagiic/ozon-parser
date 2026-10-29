const btnStart = document.getElementById("startBtn");
const btnStop = document.getElementById("stopBtn");
const status = document.getElementById("status");
const pBar = document.getElementById("pBar");

const toggleMonitorBtn = document.getElementById("toggleMonitorBtn");
const monitorStatusDot = document.getElementById("monitorStatusDot");
const monitorUrlInput = document.getElementById("monitorUrl");
const monitorMinPointsInput = document.getElementById("monitorMinPoints"); 
const monitorIntervalInput = document.getElementById("monitorInterval");

chrome.action.setBadgeText({ text: "" });

function updateUI(isParsing, progressText) {
    if (isParsing) {
        btnStart.disabled = true;
        btnStop.style.display = "block";
        pBar.style.display = "block";
        status.innerText = progressText || "Парсинг в процессе...";
    } else {
        btnStart.disabled = false;
        btnStop.style.display = "none";
        pBar.style.display = "none";
        status.innerText = "Готов к работе";
    }
}

// Запуск в активной вкладке
btnStart.addEventListener("click", () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0] || !tabs[0].url.includes("ozon.ru")) {
            status.innerText = "Ошибка: Откройте сайт Ozon!";
            return;
        }
        
        // Попытка отправить сообщение
        chrome.tabs.sendMessage(tabs[0].id, {
            action: "start_parsing", 
            pages: document.getElementById("pagesInput").value, 
            minPoints: document.getElementById("minPointsInput").value 
        }, (response) => {
            // Если возникла ошибка (страница обновлена или закрыта)
            if (chrome.runtime.lastError) {
                console.error("Tab connection lost");
                // Сбрасываем флаг в фоне, чтобы кнопка снова стала активной
                chrome.runtime.sendMessage({ action: "reset_parsing_state" });
                status.innerText = "Ошибка связи. Обновите страницу.";
                updateUI(false);
                return;
            }
            updateUI(true, "Запуск...");
        });
    });
});
document.getElementById("viewMonitorResults").addEventListener("click", () => {
    chrome.tabs.create({ url: 'results.html?mode=monitor' });
});

btnStop.addEventListener("click", () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0].url.includes("ozon.ru")) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "stop_now" });
        }
    });
    status.innerText = "Останавливаю...";
    btnStop.disabled = true;
});

function updateMonitorUI(settings) {
    if (settings.enabled) {
        toggleMonitorBtn.innerText = "Выключить авто-поиск";
        toggleMonitorBtn.className = "btn-off";
        monitorStatusDot.classList.add("active");
        monitorUrlInput.disabled = true;
        monitorMinPointsInput.disabled = true; 
        monitorIntervalInput.disabled = true;
    } else {
        toggleMonitorBtn.innerText = "Включить авто-поиск";
        toggleMonitorBtn.className = "btn-on";
        monitorStatusDot.classList.remove("active");
        monitorUrlInput.disabled = false;
        monitorMinPointsInput.disabled = false; 
        monitorIntervalInput.disabled = false;
    }
    if (settings.targetUrl) monitorUrlInput.value = settings.targetUrl;
    if (settings.minPoints) monitorMinPointsInput.value = settings.minPoints; 
    if (settings.interval) monitorIntervalInput.value = settings.interval;
}

toggleMonitorBtn.addEventListener("click", () => {
    const isEnabling = toggleMonitorBtn.innerText.includes("Включить");
    const settings = {
        enabled: isEnabling,
        targetUrl: monitorUrlInput.value,
        minPoints: parseInt(monitorMinPointsInput.value), 
        interval: parseInt(monitorIntervalInput.value)
    };
    chrome.runtime.sendMessage({ action: "toggle_monitor", settings: settings }, updateMonitorUI);
});

chrome.runtime.sendMessage({ action: "get_status" }, (response) => {
    if(response) updateUI(response.isParsing, response.currentProgress);
});
chrome.runtime.sendMessage({ action: "get_monitor_status" }, updateMonitorUI);

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "update_status") {
        status.innerText = request.text;
        const match = request.text.match(/(\d+)\s+из\s+(\d+)/);
        if (match) pBar.value = (parseInt(match[1]) / parseInt(match[2])) * 100;
    }
    if (request.action === "parsing_finished") updateUI(false);
});