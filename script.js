let lastTopTrainId = null;
let lastRenderedHTML = "";
let cachedStatusData = null;

async function init() {
    updateClock();
    setInterval(updateClock, 1000);

    const scheduleData = await fetchSchedule();

    // Initial fetches
    cachedStatusData = await fetchStatus();
    await updateBoard(scheduleData);

    // Network Loop: Fetch status every 30 seconds
    setInterval(async () => {
        cachedStatusData = await fetchStatus();
    }, 30000);

    // Animation/Clock Loop: Render every 1 second (uses cached status)
    setInterval(() => updateBoard(scheduleData), 1000);
}

// 天気予報 (Open-Meteo API - 認証不要)


function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('current-clock').textContent = `${hours}:${minutes}`;
}

console.log("Script v103 Loaded");

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

function fetchStatus() {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/status');
        xhr.timeout = 5000; // 5秒タイムアウト
        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    resolve(data);
                } catch (e) {
                    console.error("Status parse failed", e);
                    resolve(null);
                }
            } else {
                console.error("Status fetch failed", xhr.status);
                resolve(null);
            }
        };
        xhr.onerror = function () {
            console.error("Status fetch network error");
            resolve(null);
        };
        xhr.ontimeout = function () {
            console.error("Status fetch timeout");
            resolve(null);
        };
        xhr.send();
    });
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

    // 運行情報取得 (Use cached data)
    const statusData = cachedStatusData;
    updateStatusDisplay(statusData);

    const newTopTrain = upcomingTrains[0];
    const newTopTrainId = newTopTrain ? `${newTopTrain.hour}:${newTopTrain.minute}:${newTopTrain.dest}` : "none";

    // アニメーション判定: 前回と違う一番上の列車で、かつ初回ロードではない場合
    if (lastTopTrainId && lastTopTrainId !== newTopTrainId && lastTopTrainId !== "none") {
        const rows = document.querySelectorAll('.departure-row');
        if (rows.length > 0) {
            rows[0].classList.add('departing');
            // アニメーション完了まで待ってから描画更新
            setTimeout(() => {
                renderTrains(upcomingTrains.slice(0, 3), statusData);
            }, 800); // CSSのanimation時間と合わせる
        } else {
            renderTrains(upcomingTrains.slice(0, 3), statusData);
        }
    } else {
        // 変更なし、または初回
        renderTrains(upcomingTrains.slice(0, 3), statusData);
    }

    lastTopTrainId = newTopTrainId;
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

    // Weather from server (for Android 5.0 compatibility)
    if (statusData && statusData.weather) {
        const w = statusData.weather;
        // Check if w is object (new format) or string (old fallback)
        if (typeof w === 'object') {
            document.getElementById('current-weather').textContent = `${w.temp}° / ${w.precip}%`;
        } else {
            document.getElementById('current-weather').textContent = w;
        }
    }
}

function renderTrains(trains, statusData) {
    const list = document.getElementById('departure-list');
    try {
        let newHTML = "";

        if (trains.length === 0) {
            newHTML = '<div class="loading">本日の運転は終了しました</div>';
        } else {
            // Build HTML string in memory first
            trains.forEach(train => {
                // ... (Logic mostly same, just append to string)
                // Need to copy inner logic here.
                // Using a temp container might be easier or just string concat.
                // Let's use string concat for speed.

                let typeClass = 'local';
                if (train.type === '区' || train.type.includes('区間快速')) {
                    typeClass = 'section-rapid';
                } else if (train.type === '快' || train.type.includes('快速')) {
                    typeClass = 'rapid';
                }

                let displayType = train.type;
                if (displayType === '普通') {
                    displayType = '普';
                }

                const timeStr = `${String(train.hour).padStart(2, '0')}:${String(train.minute).padStart(2, '0')}`;

                const now = new Date();
                const trainDate = new Date();
                trainDate.setHours(train.hour, train.minute, 0, 0);

                const diffMs = trainDate - now;
                const diffMins = Math.floor(diffMs / 60000);

                let typeDisplay = displayType;
                let typeExtraClass = '';
                if (diffMins <= 15 && diffMins >= 0) {
                    typeDisplay = `${diffMins}分`;
                    typeExtraClass = ' countdown';
                } else if (diffMins < 0 && diffMins >= -1) {
                    typeDisplay = '発車';
                    typeExtraClass = ' departing-soon';
                }

                let timeClass = "col-time";
                let statusText = "";
                let statusClass = "col-status";

                if (statusData && statusData.is_delay) {
                    statusText = "遅れ";
                    statusClass += " status-blink";
                } else {
                    if (diffMins >= 12) statusText = "余裕";
                    else if (diffMins >= 10) statusText = "GO!";
                    else if (diffMins === 9) statusText = "競歩";
                    else if (diffMins === 8) statusText = "RUN!";
                    else if (diffMins === 7) statusText = "ダッシュ!!";
                    else if (diffMins === 6) statusText = "猛ダッシュ!!!";
                    else if (diffMins === 5) statusText = "どうする？";
                    else if (diffMins === 4) statusText = "ワンチャン";
                    else if (diffMins <= 3 && diffMins >= 0) statusText = "challenger";
                }

                newHTML += `
                    <div class="departure-row">
                        <span class="col-type ${typeClass}${typeExtraClass}">${typeDisplay}</span>
                        <span class="${timeClass}">${timeStr}</span>
                        <span class="col-dest">${train.dest}</span>
                        <span class="${statusClass}">${statusText}</span>
                    </div>
                `;
            });
        }

        // Optimization: Only touch DOM if changed
        if (newHTML !== lastRenderedHTML) {
            list.innerHTML = newHTML;
            lastRenderedHTML = newHTML;
        }

    } catch (e) {
        console.error("Render crash:", e);
        list.innerHTML = `<div class="loading">Render Error: ${e.message}</div>`;
    }
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

    // Check sleep mode every minute
    setInterval(checkSleepMode, 60000);
    checkSleepMode();
});

function checkSleepMode() {
    const now = new Date();
    const hours = now.getHours();

    // 01:00 ~ 04:59 is Sleep Mode
    const isSleepTime = (hours >= 1 && hours < 5);

    const overlay = document.getElementById('sleep-overlay');
    const sleepClock = document.getElementById('sleep-clock');

    if (isSleepTime) {
        overlay.classList.remove('hidden');
        const h = String(hours).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        sleepClock.textContent = `${h}:${m}`;

        // Move clock slightly to prevent burn-in (every minute)
        const randomX = Math.floor(Math.random() * 10) - 5; // -5 to 5 vw
        const randomY = Math.floor(Math.random() * 10) - 5; // -5 to 5 vh
        sleepClock.style.transform = `translate(${randomX}vw, ${randomY}vh)`;

    } else {
        overlay.classList.add('hidden');
    }
}
