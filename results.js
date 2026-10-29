let currentData = [];
let currentSort = { column: 'roi', asc: false };

document.addEventListener('DOMContentLoaded', () => {
    // --- ИЗМЕНЕННАЯ ЛОГИКА ЗАГРУЗКИ ---
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode') || 'manual';
    const storageKey = mode === 'monitor' ? 'ozonMonitorResults' : 'ozonResults';

    // Меняем заголовок в зависимости от режима
    if (mode === 'monitor') {
        document.querySelector('h2').innerHTML = 'Найдено автосканером: <span id="itemCount">0</span>';
    }

    chrome.storage.local.get([storageKey], function(result) {
        if (result[storageKey]) {
            currentData = result[storageKey];
            document.getElementById('itemCount').innerText = currentData.length;
            renderCards();
        }
    });
    // -----------------------------------

    setupSort('sortRoi', 'roi', false);
    setupSort('sortPoints', 'points', false);
    setupSort('sortPrice', 'price', true);

    document.getElementById('downloadCsv').addEventListener('click', downloadCsv);
});

function setupSort(btnId, column, defaultAsc) {
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (currentSort.column === column) {
            currentSort.asc = !currentSort.asc;
        } else {
            currentSort.column = column;
            currentSort.asc = defaultAsc;
        }

        btn.innerText = (btn.innerText.replace(/[↑↓]/g, '').trim()) + (currentSort.asc ? ' ↑' : ' ↓');
        currentData.sort((a, b) => currentSort.asc ? a[column] - b[column] : b[column] - a[column]);
        renderCards();
    });
}

function renderCards() {
    const grid = document.getElementById('resultsGrid');
    grid.innerHTML = '';

    currentData.forEach(item => {
        const card = document.createElement('a');
        card.className = 'item-card';
        card.href = item.url;
        card.target = '_blank';

        card.innerHTML = `
            <img src="${item.image || 'https://ozon.ru/favicon.ico'}" class="item-img" alt="product">
            <div class="item-info">
                <div class="item-title">${item.title}</div>
                <div class="item-details">
                    <div class="price-tag">${item.price.toLocaleString('ru-RU')} ₽</div>
                    <div class="points-tag">+${item.points.toLocaleString('ru-RU')} баллов</div>
                    <div class="roi-tag">${item.roi}% <span style="font-size:12px; font-weight: normal; color: #888;">ROI</span></div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function downloadCsv() {
    let csvContent = "\uFEFFТовар;Цена;Баллы;ROI;Ссылка\n";
    currentData.forEach(item => {
        let safeTitle = item.title.replace(/;/g, ',').replace(/"/g, '""');
        csvContent += `"${safeTitle}";${item.price};${item.points};${item.roi};${item.url}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Ozon_ROI_Results.csv";
    link.click();
}