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
        const url = window.SCHEDULE_URL || '/data/schedule.json';
        // Add timestamp to bypass cache
        const res = await fetch(url + '?t=' + new Date().getTime());
        return await res.json();
    } catch (e) {
        console.error("Schedule load failed", e);
        document.querySelector('.loading').textContent = `Error: ${e.message}`;
        return null;
    }
}

function fetchStatus() {
    return new Promise(async (resolve) => {
        try {
            // Use server API for realtime status instead of static JSON
            const url = '/api/status';
            const res = await fetch(url + '?t=' + new Date().getTime()); // Anti-cache
            const data = await res.json();
            // API returns the flat status object directly
            resolve(data);
        } catch (e) {
            console.error("Status fetch failed", e);
            resolve(null);
        }
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

// Consolidated Status Display Logic
function updateStatusDisplay(statusData) {
    const msgContainer = document.getElementById('scroll-message');
    const msgBox = document.querySelector('.scroll-message-container');

    // 1. Scrolling Message & Color
    if (statusData && statusData.is_delay) { // Matched Scraper key 'is_delay'
        msgContainer.textContent = statusData.message;
        msgContainer.style.animationDuration = "10s";
        msgBox.classList.remove('normal');
        msgBox.classList.add('delayed');
    } else {
        msgContainer.textContent = (statusData && statusData.message) ? statusData.message : "現在、鹿児島本線は通常通り運行しています。";
        msgContainer.style.animationDuration = "15s";
        msgBox.classList.remove('delayed');
        msgBox.classList.add('normal');
    }

    // 2. Last Updated Timestamp
    const lastUpdatedEl = document.getElementById('last-updated');
    if (statusData && statusData.timestamp) {
        lastUpdatedEl.textContent = `情報更新: ${statusData.timestamp}`;
    } else {
        // Debug fallback: Show WHY it is missing
        if (!statusData) {
            lastUpdatedEl.textContent = "Data: NULL";
        } else {
            lastUpdatedEl.textContent = "TS: MISSING";
        }
    }

    // 3. Weather Fallback (Hybrid)
    // If client-side fetch failing (Android), use server data
    const weatherEl = document.getElementById('current-weather');
    // If empty or default "--", try server data
    if (weatherEl.textContent.includes('--') || weatherEl.textContent === "") {
        if (statusData && statusData.weather) {
            const w = statusData.weather;
            if (typeof w === 'object' && w.temp !== "--") {
                weatherEl.textContent = `${w.temp}° / ${w.precip}%`;
                console.log("Using server weather fallback");
            } else if (typeof w === 'string' && w !== "" && !w.includes("--")) {
                weatherEl.textContent = w;
            }
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

                // Status Priority Logic:
                // 1. Delay (Most important)
                // 2. Imminent Departure / Countdown (RUN!, etc.) -> "Previous runs" user liked this
                // 3. Arrival/Transfer Info (Standard info)

                if (statusData && statusData.is_delay) {
                    statusText = "遅れ";
                    statusClass += " status-blink";
                } else if (diffMins <= 15 && diffMins > -2) {
                    // Countdown Mode (Prioritize this over transfer info for fun/urgency)
                    // Note: typeDisplay already shows countdown/departure, but statusText adds flavor
                    if (diffMins > 15) statusText = "";
                    else if (diffMins >= 14) statusText = "余裕";
                    else if (diffMins >= 12) statusText = "準備開始";
                    else if (diffMins >= 10) statusText = "GO!";
                    else if (diffMins === 9) statusText = "競歩";
                    else if (diffMins === 8) statusText = "RUN!";
                    else if (diffMins === 7) statusText = "ダッシュ!!";
                    else if (diffMins === 6) statusText = "猛ダッシュ!!!";
                    else if (diffMins === 5) statusText = "どうする？";
                    else if (diffMins === 4) statusText = "ワンチャン";
                    else if (diffMins <= 3 && diffMins >= 0) statusText = "challenger";
                    else if (diffMins < 0) statusText = "発車";

                } else if (train.arrival_time || train.transfer_req) {
                    // Arrival Time Mode (Standard info when not urgent)
                    if (train.arrival_time) {
                        statusText = `${train.arrival_time}着`;
                    } else {
                        statusText = "";
                    }

                    if (train.transfer_req) {
                        statusClass += " transfer-req";
                        if (train.transfer_info) {
                            statusText = train.transfer_info; // Overwrites arrival time if transfer is key
                            if (train.transfer_arrival) {
                                statusText += `<br><span class="transfer-arrival">${train.transfer_arrival}</span>`;
                            }
                        } else {
                            statusText = "要乗換";
                        }
                    }
                } else {
                    // Default / Far future
                    statusText = "";
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

// Try to acquire logic on interaction
document.addEventListener('click', requestWakeLock);
document.addEventListener('touchstart', requestWakeLock);


// Client-Side Weather Fetching (Direct Open-Meteo)
function fetchWeather() {
    const lat = 33.81;
    const lon = 130.54;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&timezone=Asia/Tokyo&forecast_hours=1`;

    console.log("Fetching weather client-side...");
    fetch(url)
        .then(response => response.json())
        .then(data => {
            try {
                const temp = Math.round(data.current.temperature_2m);
                const precip = data.hourly.precipitation_probability[0] || 0;
                const weatherText = `${temp}° / ${precip}%`;

                document.getElementById('current-weather').textContent = weatherText;
                console.log("Weather updated:", weatherText);
            } catch (e) {
                console.error("Weather parse error:", e);
            }
        })
        .catch(err => {
            console.error("Weather fetch failed:", err);
        });
}


document.addEventListener('DOMContentLoaded', () => {
    init();
    requestWakeLock();

    // Weather Init
    fetchWeather();
    setInterval(fetchWeather, 30 * 60 * 1000); // Every 30 mins

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
