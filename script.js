let lastTopTrainId = null;

async function init() {
    updateClock();
    setInterval(updateClock, 1000);

    const scheduleData = await fetchSchedule();
    await updateBoard(scheduleData);

    // 天気を取得
    await updateWeather();
    // 30分ごとに天気更新
    setInterval(updateWeather, 30 * 60 * 1000);

    // 1秒ごとに更新 (アニメーションと時刻同期のため)
    setInterval(() => updateBoard(scheduleData), 1000);
}

// 天気予報 (Open-Meteo API - 認証不要)
async function updateWeather() {
    try {
        // 教育大前駅付近 (福岡県宗像市)
        const lat = 33.81;
        const lon = 130.54;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&timezone=Asia/Tokyo&forecast_hours=1`;

        const res = await fetch(url);
        const data = await res.json();

        const temp = Math.round(data.current.temperature_2m);
        const weatherCode = data.current.weather_code;
        const weatherEmoji = getWeatherEmoji(weatherCode);

        // 現在時刻の降水確率を取得
        const precipProb = data.hourly.precipitation_probability[0] || 0;

        document.getElementById('current-weather').textContent = `${weatherEmoji} ${temp}° / ${precipProb}%`;
    } catch (e) {
        console.error("Weather fetch failed", e);
        document.getElementById('current-weather').textContent = "--";
    }
}

function getWeatherEmoji(code) {
    // WMO Weather interpretation codes - ミニマルスタイル
    if (code === 0) return '晴'; // Clear
    if (code <= 3) return '曇'; // Partly cloudy
    if (code <= 49) return '霧'; // Fog
    if (code <= 69) return '雨'; // Rain/Drizzle
    if (code <= 79) return '雪'; // Snow
    if (code <= 99) return '雷'; // Thunderstorm
    return '晴';
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

        // 発車時刻までの分数を計算
        const now = new Date();
        const trainDate = new Date();
        trainDate.setHours(train.hour, train.minute, 0, 0);

        const diffMs = trainDate - now;
        const diffMins = Math.floor(diffMs / 60000);

        // 15分以内なら「X分後」表示、それ以外は種別表示
        let typeDisplay = displayType;
        let typeExtraClass = '';
        if (diffMins <= 15 && diffMins >= 0) {
            typeDisplay = `${diffMins}分`;
            typeExtraClass = ' countdown';
        } else if (diffMins < 0 && diffMins >= -1) {
            // 発車直後（1分以内）
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
            // ユーモアステータス（徒歩10分想定）
            if (diffMins >= 12) {
                statusText = "余裕";
            } else if (diffMins >= 10) {
                statusText = "出発";
            } else if (diffMins === 9) {
                statusText = "競歩";
            } else if (diffMins === 8) {
                statusText = "RUN!";
            } else if (diffMins === 7) {
                statusText = "ダッシュ!!";
            } else if (diffMins === 6) {
                statusText = "猛ダッシュ!!!";
            } else if (diffMins === 5) {
                statusText = "どうする？";
            } else if (diffMins === 4) {
                statusText = "ワンチャン";
            } else if (diffMins <= 3 && diffMins >= 0) {
                statusText = "challenger";
            }
        }

        row.innerHTML = `
            <span class="col-type ${typeClass}${typeExtraClass}">${typeDisplay}</span>
            <span class="${timeClass}">${timeStr}</span>
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
