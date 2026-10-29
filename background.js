let isParsing = false;
let currentProgress = "";

let monitorSettings = {
    enabled: false,
    interval: 30,
    minPoints: 1000, 
    targetUrl: "https://www.ozon.ru/highlight/bally-za-otzyv-1171518/"
};
let notifiedItems = new Set();
let foundInBackgroundCount = 0;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Статус ручного парсинга
    if (request.action === "parsing_started") { isParsing = true; } 
    if (request.action === "update_status") { currentProgress = request.text; }
    if (request.action === "parsing_finished") { 
        isParsing = false; 
        chrome.tabs.create({ url: 'results.html' });
    }
    if (request.action === "get_status") { sendResponse({ isParsing, currentProgress }); }
    
    // Настройки монитора
    if (request.action === "toggle_monitor") {
        monitorSettings = { ...monitorSettings, ...request.settings };
        manageAlarms();
        sendResponse(monitorSettings);
    }
    if (request.action === "get_monitor_status") {
        sendResponse(monitorSettings);
    }
    if (request.action === "reset_parsing_state") {
        isParsing = false;
        currentProgress = "";
        sendResponse({ status: "reset" });
    }

    // Обработка результатов фонового поиска
    if (request.action === "background_items_found") {
        let newFoundItems = [];
        
        request.items.forEach(item => {
            if (!notifiedItems.has(item.id)) {
                notifiedItems.add(item.id);
                newFoundItems.push(item);
            }
        });
        
        if (newFoundItems.length > 0) {
            // Обновляем бейдж
            foundInBackgroundCount += newFoundItems.length;
            chrome.action.setBadgeText({ text: foundInBackgroundCount.toString() });
            chrome.action.setBadgeBackgroundColor({ color: "#e91e63" });
            
            // СОХРАНЯЕМ В ПАМЯТЬ ДЛЯ ТАБЛИЦЫ РЕЗУЛЬТАТОВ
            chrome.storage.local.get(['ozonMonitorResults'], function(result) {
                let existing = result.ozonMonitorResults || [];
                let updated = [...existing, ...newFoundItems];
                updated.sort((a,b) => b.roi - a.roi); // Сортируем по выгоде
                chrome.storage.local.set({ ozonMonitorResults: updated });
            });
        }
    }
}); // <--- ВОТ ЭТА СКОБКА И ТОЧКА С ЗАПЯТОЙ БЫЛИ ПРОПУЩЕНЫ

function manageAlarms() {
    chrome.alarms.clearAll();
    if (monitorSettings.enabled) {
        scheduleNextMonitor();
        triggerBackgroundCheck();
    } else {
        notifiedItems.clear();
        foundInBackgroundCount = 0;
        chrome.action.setBadgeText({ text: "" }); 
    }
}

function scheduleNextMonitor() {
    const jitter = Math.floor(Math.random() * 20) - 10; 
    const nextRun = Math.max(5, monitorSettings.interval + jitter); 
    chrome.alarms.create("monitorCheck", { delayInMinutes: nextRun });
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "monitorCheck" && monitorSettings.enabled) {
        triggerBackgroundCheck();
        scheduleNextMonitor();
    }
});

function triggerBackgroundCheck() {
    // Ищем любую открытую вкладку Озона и просим её сделать проверку
    chrome.tabs.query({url: "*://*.ozon.ru/*"}, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: "run_background_check", 
                settings: monitorSettings 
            });
        }
    });
}