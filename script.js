let lastTopTrainId = null;
let lastHakataTrainId = null;
let lastRenderedHTML = "";
let lastHakataRenderedHTML = "";
let cachedStatusData = null;
let globalScheduleData = null;
let globalHakataData = null;

async function init() {
    updateClock();
    setInterval(updateClock, 1000);

    globalScheduleData = await fetchSchedule();
    globalHakataData = await fetchHakataSchedule();

    // Initial fetches
    cachedStatusData = await fetchStatus();
    updateBoard(globalScheduleData, false);
    updateBoard(globalHakataData, true);

    // Network Loop: Fetch status every 30 seconds
    setInterval(async () => {
        cachedStatusData = await fetchStatus();
    }, 30000);

    // Render loop every 1 second
    setInterval(() => {
        updateBoard(globalScheduleData, false);
        updateBoard(globalHakataData, true);
    }, 1000);
}

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    document.getElementById('current-clock').textContent = timeStr;
    const hEl = document.getElementById('current-clock-hakata');
    if (hEl) hEl.textContent = timeStr;
}

console.log("Script v111 Loaded (Hakata Dest Names)");

async function fetchSchedule() {
    try {
        const url = window.SCHEDULE_URL || '/data/schedule.json';
        const res = await fetch(url + '?t=' + new Date().getTime());
        return await res.json();
    } catch (e) {
        console.error("Schedule load failed", e);
        document.querySelector('.loading').textContent = `Error: ${e.message}`;
        return null;
    }
}

async function fetchHakataSchedule() {
    try {
        const url = '/hakata_schedule.json';
        const res = await fetch(url + '?t=' + new Date().getTime());
        return await res.json();
    } catch (e) {
        console.error("Hakata Schedule load failed", e);
        return null;
    }
}

function fetchStatus() {
    return new Promise(async (resolve) => {
        try {
            const url = '/api/status';
            const res = await fetch(url + '?t=' + new Date().getTime());
            const data = await res.json();
            resolve(data);
        } catch (e) {
            console.error("Status fetch failed", e);
            resolve(null);
        }
    });
}

async function updateBoard(scheduleData, isHakata = false) {
    if (!scheduleData) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isWeekend = (now.getDay() === 0 || now.getDay() === 6);

    const scheduleList = isWeekend ? scheduleData.schedule.holiday : scheduleData.schedule.weekday;

    const upcomingTrains = scheduleList.filter(train => {
        return (train.hour > currentHour) || (train.hour === currentHour && train.minute >= currentMinute);
    });

    const statusData = cachedStatusData;
    updateStatusDisplay(statusData, isHakata);
    const newTopTrain = upcomingTrains[0];
    const newTopTrainId = newTopTrain ? `${newTopTrain.hour}:${newTopTrain.minute}:${newTopTrain.dest}` : "none";

    let currentLastId = isHakata ? lastHakataTrainId : lastTopTrainId;
    if (currentLastId && currentLastId !== newTopTrainId && currentLastId !== "none") {
        const rows = document.getElementById(isHakata ? 'hakata-departure-list' : 'departure-list').querySelectorAll('.departure-row');
        if (rows.length > 0) {
            rows[0].classList.add('departing');
            setTimeout(() => {
                renderTrains(upcomingTrains.slice(0, 3), statusData, isHakata);
            }, 800);
        } else {
            renderTrains(upcomingTrains.slice(0, 3), statusData, isHakata);
        }
    } else {
        renderTrains(upcomingTrains.slice(0, 3), statusData, isHakata);
    }

    if (isHakata) { lastHakataTrainId = newTopTrainId; } else { lastTopTrainId = newTopTrainId; }
}

function updateStatusDisplay(statusData, isHakata = false) {
    const msgContainer = document.getElementById(isHakata ? 'scroll-message-hakata' : 'scroll-message');
    const msgBox = msgContainer.parentElement;

    if (statusData && statusData.is_delay) {
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

    const lastUpdatedEl = document.getElementById('last-updated');
    if (statusData && statusData.timestamp) {
        lastUpdatedEl.textContent = `情報更新: ${statusData.timestamp}`;
    } else {
        lastUpdatedEl.textContent = !statusData ? "Data: NULL" : "TS: MISSING";
    }

    const weatherEl = document.getElementById(isHakata ? 'current-weather-hakata' : 'current-weather');
    if (weatherEl.textContent.includes('--') || weatherEl.textContent === "") {
        if (statusData && statusData.weather) {
            const w = statusData.weather;
            if (typeof w === 'object' && w.temp !== "--") {
                weatherEl.textContent = `${w.temp}° / ${w.precip}%`;
            } else if (typeof w === 'string' && w !== "" && !w.includes("--")) {
                weatherEl.textContent = w;
            }
        }
    }
}

function renderTrains(trains, statusData, isHakata = false) {
    const list = document.getElementById(isHakata ? 'hakata-departure-list' : 'departure-list');
    try {
        let newHTML = "";

        if (trains.length === 0) {
            newHTML = '<div class="loading">本日の運転は終了しました</div>';
        } else {
            trains.forEach(train => {
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
                } else if (diffMins <= 15 && diffMins > -2) {
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
                    if (train.arrival_time) {
                        statusText = `${train.arrival_time}着`;
                    } else {
                        statusText = "";
                    }
                    if (train.transfer_req) {
                        statusClass += " transfer-req";
                        if (train.transfer_info) {
                            statusText = train.transfer_info;
                            if (train.transfer_arrival) {
                                statusText += `<br><span class="transfer-arrival">${train.transfer_arrival}</span>`;
                            }
                        } else {
                            statusText = "要乗換";
                        }
                    }
                } else {
                    statusText = "";
                }

                newHTML += `
                    <div class="departure-row">
                        <span class="col-type ${typeClass}${typeExtraClass}">${typeDisplay}</span>
                        <span class="${timeClass}">${timeStr}</span>
                        <span class="col-dest">${isHakata ? train.dest : '<span style="color: var(--text-secondary); margin: 0 20px 0 10px; font-size: 0.8em; vertical-align: middle;">▶</span>' + train.dest}</span>
                        <span class="${statusClass}">${statusText}</span>
                    </div>
                `;
            });
        }

        const prevHTML = isHakata ? lastHakataRenderedHTML : lastRenderedHTML;
        if (newHTML !== prevHTML) {
            list.innerHTML = newHTML;
            if (isHakata) { lastHakataRenderedHTML = newHTML; } else { lastRenderedHTML = newHTML; }
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

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

document.addEventListener('click', requestWakeLock);
document.addEventListener('touchstart', requestWakeLock);

// Client-Side Weather Fetching (Direct Open-Meteo)
function fetchWeather() {
    const lat = 33.606;
    const lon = 130.422;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&timezone=Asia/Tokyo&forecast_hours=1`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            try {
                const temp = Math.round(data.current.temperature_2m);
                const precip = data.hourly.precipitation_probability[0] || 0;
                const weatherText = `${temp}° / ${precip}%`;
                document.getElementById('current-weather').textContent = weatherText;
                const hEl = document.getElementById('current-weather-hakata');
                if (hEl) hEl.textContent = weatherText;
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

    fetchWeather();
    setInterval(fetchWeather, 30 * 60 * 1000);

    setInterval(checkSleepMode, 60000);
    checkSleepMode();
});

function checkSleepMode() {
    const now = new Date();
    const hours = now.getHours();
    const isSleepTime = (hours >= 1 && hours < 5);

    const overlay = document.getElementById('sleep-overlay');
    const sleepClock = document.getElementById('sleep-clock');

    if (isSleepTime) {
        overlay.classList.remove('hidden');
        const h = String(hours).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        sleepClock.textContent = `${h}:${m}`;
        const randomX = Math.floor(Math.random() * 10) - 5;
        const randomY = Math.floor(Math.random() * 10) - 5;
        sleepClock.style.transform = `translate(${randomX}vw, ${randomY}vh)`;
    } else {
        overlay.classList.add('hidden');
    }
}
