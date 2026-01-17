async function init() {
    updateClock();
    setInterval(updateClock, 1000);

    const scheduleData = await fetchSchedule();
    await updateBoard(scheduleData);

    // 1分ごとに更新
    setInterval(() => updateBoard(scheduleData), 60000);
}

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('current-clock').textContent = `${hours}:${minutes}`;
}

async function fetchSchedule() {
    try {
        const res = await fetch('/data/schedule.json');
        return await res.json();
    } catch (e) {
        console.error("Schedule load failed", e);
        document.querySelector('.loading').textContent = `Error: ${e.message}`;
        return null;
    }
}

async function fetchStatus() {
    try {
        const res = await fetch('/api/status');
        return await res.json();
    } catch (e) {
        console.error("Status load failed", e);
        return null;
    }
}

async function updateBoard(scheduleData) {
    if (!scheduleData) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isWeekend = (now.getDay() === 0 || now.getDay() === 6); // 0=Sun, 6=Sat

    const scheduleList = isWeekend ? scheduleData.schedule.holiday : scheduleData.schedule.weekday;

    // 現在時刻以降の列車をフィルタリング
    const upcomingTrains = scheduleList.filter(train => {
        return (train.hour > currentHour) || (train.hour === currentHour && train.minute >= currentMinute);
    });

    // 翌日の列車も少し表示したいが、今回は簡易的に当日分のみ

    // 運行情報取得
    const statusData = await fetchStatus();
    updateStatusDisplay(statusData);

    renderTrains(upcomingTrains.slice(0, 3), statusData);
}

function updateStatusDisplay(statusData) {
    const msgContainer = document.getElementById('scroll-message');
    const msgBox = document.querySelector('.scroll-message-container');

    if (statusData && statusData.is_delay) {
        msgContainer.textContent = `${statusData.detail} (更新日時: ${statusData.timestamp.split(' ')[1]})`;
        msgContainer.style.animationDuration = "10s"; // 遅延時は少し速く

        // スタイル: 遅延 (赤)
        msgBox.classList.remove('normal');
    } else {
        msgContainer.textContent = "現在、鹿児島本線は通常通り運行しています。";
        msgContainer.style.animationDuration = "15s"; // 通常速度

        // スタイル: 平常 (緑)
        msgBox.classList.add('normal');
    }

    if (statusData && statusData.timestamp) {
        document.getElementById('last-updated').textContent = `情報更新: ${statusData.timestamp}`;
    }
}

function renderTrains(trains, statusData) {
    const list = document.getElementById('departure-list');
    list.innerHTML = '';

    if (trains.length === 0) {
        list.innerHTML = '<div class="loading">本日の運転は終了しました</div>';
        return;
    }

    trains.forEach(train => {
        const row = document.createElement('div');
        row.className = 'departure-row';

        // 種別クラス (local, rapid, etc)
        // 種別クラス (local, rapid, etc)
        let typeClass = 'local';
        if (train.type === '区' || train.type.includes('区間快速')) {
            typeClass = 'section-rapid';
        } else if (train.type === '快' || train.type.includes('快速')) {
            typeClass = 'rapid';
        }

        // 種別表示文字列 (普通 -> 普)
        let displayType = train.type;
        if (displayType === '普通') {
            displayType = '普';
        }

        const timeStr = `${String(train.hour).padStart(2, '0')}:${String(train.minute).padStart(2, '0')}`;

        let statusText = "";
        let statusClass = "col-status";

        if (statusData && statusData.is_delay) {
            statusText = "遅れ";
            statusClass += " status-blink";
        }

        row.innerHTML = `
            <span class="col-type ${typeClass}">${displayType}</span>
            <span class="col-time">${timeStr}</span>
            <span class="col-dest">${train.dest}</span>
            <span class="${statusClass}">${statusText}</span>
        `;
        list.appendChild(row);
    });
}


// Wake Lock API
let wakeLock = null;

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock is active!');
        } catch (err) {
            console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
        }
    }
}

// Re-acquire wake lock on visibility change
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// Try to acquire logic on interaction (required by most browsers)
document.addEventListener('click', requestWakeLock);
document.addEventListener('touchstart', requestWakeLock);

document.addEventListener('DOMContentLoaded', () => {
    init();
    requestWakeLock(); // Try automatically just in case
});
