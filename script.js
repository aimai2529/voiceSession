let currentAudio = null;
let selectionMode = false;
const buttonList = document.getElementById("buttonList");
const localKey = "audioDataList"; // ローカルストレージ用のキー

// ファイルをbase64形式に変換する関数
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ローカルストレージにデータを保存する関数
function saveToLocal(data) {
    localStorage.setItem(localKey, JSON.stringify(data));
}

// 音声ボタンとUIを生成する関数
async function createAudioButton(title, base64, volume = 1.0, index = null, active = true) {
    const container = document.createElement("div");
    container.className = "audio-item";
    if (!active) container.classList.add("disabled");

    // タイトル文字を制限（最大10文字）
    let displayTitle = title.length > 10 ? title.slice(0, 10) + "…" : title;

    // 選択用チェックボックス
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "select-checkbox";
    if (!selectionMode) checkbox.classList.add("hidden");

    // Audio要素
    const audio = new Audio();
    audio.src = base64;
    audio.volume = volume;
    audio.preload = "metadata";

    // タイトル部分
    const button = document.createElement("button");
    button.textContent = displayTitle;
    button.className = "audio-title";
    button.disabled = !active;

    // グラデーション色を計算して背景に反映
    const totalItems = JSON.parse(localStorage.getItem(localKey) || "[]").length || 1;
    const hue = (index / totalItems) * 360; // 上から下に色相をずらす
    container.style.background = `hsl(${hue}, 80%, 65%)`;

    // 音量スライダー
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 0;
    slider.max = 1;
    slider.step = 0.01;
    slider.value = volume;

    // 再生時間表示用ラベル
    const durationLabel = document.createElement("span");
    durationLabel.className = "duration-label";
    durationLabel.textContent = "--:--";

    // メタデータ読み込み時に再生時間を取得して表示
    audio.addEventListener("loadedmetadata", async () => {
        let dur = audio.duration;

        if (!isFinite(dur) || isNaN(dur)) {
            try {
                // base64 をデコードして AudioBuffer として解析
                const response = await fetch(base64);
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();

                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const decoded = await audioCtx.decodeAudioData(arrayBuffer);
                dur = decoded.duration;
            } catch (err) {
                console.warn("duration取得失敗:", err);
                dur = NaN;
            }
        }

        if (isFinite(dur) && !isNaN(dur)) {
            const minutes = Math.floor(dur / 60);
            const seconds = Math.floor(dur % 60).toString().padStart(2, '0');
            durationLabel.textContent = `${minutes}:${seconds}`;
        } else {
            durationLabel.textContent = "--:--";
        }
    });

    // 音量変更時の処理
    slider.addEventListener("input", () => {
        audio.volume = parseFloat(slider.value);
        if (index !== null) {
            const data = JSON.parse(localStorage.getItem(localKey) || "[]");
            data[index].volume = parseFloat(slider.value);
            saveToLocal(data);
        }
    });

    // 再生・停止切り替え（container全体クリックで）
    container.addEventListener("click", (e) => {
        // チェックボックスやスライダーをクリックした場合は無視
        if (e.target.tagName === "INPUT") return;
        if (!active) return; // 無効状態なら何もしない

        if (currentAudio === audio && !audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            currentAudio = null;
        } else {
            if (currentAudio && !currentAudio.paused) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
            audio.play();
            currentAudio = audio;
        }
    });

    // DOMに追加
    container.appendChild(checkbox);
    container.appendChild(button);
    container.appendChild(durationLabel);
    container.appendChild(slider);
    buttonList.appendChild(container);
}

// 音声データをすべて表示する関数
async function renderAll() {
    buttonList.innerHTML = "";
    const data = JSON.parse(localStorage.getItem(localKey) || "[]");
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        await createAudioButton(item.title, item.base64, item.volume, i, item.active ?? true);
    }
}

// 音声追加ボタンの処理
document.getElementById("addBtn").addEventListener("click", async () => {
    const title = document.getElementById("title").value;
    const fileInput = document.getElementById("audio");
    const file = fileInput.files[0];

    if (!title || !file) {
        alert("タイトルと音声ファイルを選んでね！");
        return;
    }

    const base64 = await fileToBase64(file);
    const data = JSON.parse(localStorage.getItem(localKey) || "[]");
    // 音声追加処理時に active: true をセット
    data.push({ title, base64, volume: 1.0, active: true });
    saveToLocal(data);

    renderAll();
    document.getElementById("title").value = "";
    fileInput.value = "";
});

// 音声抽出関数
async function extractAudioFromVideo(file) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";

        video.onloadeddata = () => {
            const stream = video.captureStream();
            const audioTracks = stream.getAudioTracks();
            if (!audioTracks.length) {
                reject("音声トラックが見つかりません");
                return;
            }

            const audioStream = new MediaStream(audioTracks);
            const recorder = new MediaRecorder(audioStream);
            const chunks = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: "audio/webm" });
                resolve(blob);
            };

            recorder.start();
            video.play();

            video.onended = () => {
                recorder.stop();
            };
        };
    });
}

// 録音機能の変数とUIボタン
let mediaRecorder;
let recordedChunks = [];
const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");

// 録音開始処理
recordBtn.addEventListener("click", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: "audio/webm" });
        const base64 = await fileToBase64(blob);

        const title = prompt("録音にタイトルをつけてね！");
        if (title) {
            const data = JSON.parse(localStorage.getItem(localKey) || "[]");
            data.push({ title, base64, volume: 1.0 });
            saveToLocal(data);
            renderAll();
        }

        // 停止後は表示を消す
        document.getElementById("recordingStatus").style.display = "none";
    };

    mediaRecorder.start();
    recordBtn.disabled = true;
    stopBtn.disabled = false;

    // 録音中表示ON
    document.getElementById("recordingStatus").style.display = "inline";
});

// 録音停止処理
stopBtn.addEventListener("click", () => {
    mediaRecorder.stop();
    recordBtn.disabled = false;
    stopBtn.disabled = true;

    // 停止時に確実に非表示
    document.getElementById("recordingStatus").style.display = "none";
});

// 選択モードの切り替え処理
const selectionBtn = document.getElementById("selectModeBtn");
selectionBtn.addEventListener("click", () => {
    selectionMode = !selectionMode;
    document.getElementById("deleteSelectedBtn").classList.toggle("hidden", !selectionMode);
    document.getElementById("toggleActiveBtn").classList.toggle("hidden", !selectionMode);
    if (selectionMode) {
        selectionBtn.textContent = '選択モードを終了';
    } else if (!selectionMode) {
        selectionBtn.textContent = '選択モードを開始';
    }
    renderAll();
});

// チェックされた音声を一括削除する処理
document.getElementById("deleteSelectedBtn").addEventListener("click", () => {
    const checkboxes = document.querySelectorAll(".select-checkbox");
    const data = JSON.parse(localStorage.getItem(localKey) || "[]");
    const indexesToDelete = [];

    checkboxes.forEach((cb, index) => {
        if (cb.checked) {
            indexesToDelete.push(index);
        }
    });

    const newData = data.filter((_, index) => !indexesToDelete.includes(index));
    saveToLocal(newData);
    renderAll();
});

// アクティブ切り替え処理
document.getElementById("toggleActiveBtn").addEventListener("click", () => {
    const checkboxes = document.querySelectorAll(".select-checkbox");
    const data = JSON.parse(localStorage.getItem(localKey) || "[]");

    checkboxes.forEach((cb, index) => {
        if (cb.checked) {
            data[index].active = !data[index].active; // トグル切り替え
        }
    });

    saveToLocal(data);
    renderAll();
});

let embeddedAudios = {}; // 空でスタート

async function loadUpdateData() {
    try {
        const res = await fetch("./update.json");
        if (!res.ok) throw new Error("update.json not found");
        const newData = await res.json();
        Object.assign(embeddedAudios, newData); // マージ
        console.log("音源リストを読み込みました:", embeddedAudios);
    } catch (e) {
        console.warn("音源リストの読み込み失敗:", e);
    }
}

// パス解放
document.getElementById("unlockBtn").addEventListener("click", () => {
    const pass = document.getElementById("unlockInput").value;
    if (embeddedAudios[pass]) {
        const data = JSON.parse(localStorage.getItem(localKey) || "[]");
        embeddedAudios[pass].forEach(item => data.push(item));
        saveToLocal(data);
        renderAll();
        alert("音源を解放しました！");
    } else {
        alert("パスワードが違います");
    }
});

// AudioBuffer → Blob 変換関数（WAV形式）
function bufferToBlob(buffer, sampleRate) {
    return new Promise((resolve) => {
        const numOfChan = buffer.numberOfChannels;
        const length = buffer.length * numOfChan * 2 + 44;
        const bufferView = new DataView(new ArrayBuffer(length));

        function writeString(view, offset, str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        }

        let offset = 0;

        writeString(bufferView, offset, "RIFF"); offset += 4;
        bufferView.setUint32(offset, length - 8, true); offset += 4;
        writeString(bufferView, offset, "WAVE"); offset += 4;
        writeString(bufferView, offset, "fmt "); offset += 4;
        bufferView.setUint32(offset, 16, true); offset += 4;
        bufferView.setUint16(offset, 1, true); offset += 2;
        bufferView.setUint16(offset, numOfChan, true); offset += 2;
        bufferView.setUint32(offset, sampleRate, true); offset += 4;
        bufferView.setUint32(offset, sampleRate * numOfChan * 2, true); offset += 4;
        bufferView.setUint16(offset, numOfChan * 2, true); offset += 2;
        bufferView.setUint16(offset, 16, true); offset += 2;
        writeString(bufferView, offset, "data"); offset += 4;
        bufferView.setUint32(offset, buffer.length * numOfChan * 2, true); offset += 4;

        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numOfChan; channel++) {
                let sample = buffer.getChannelData(channel)[i];
                sample = Math.max(-1, Math.min(1, sample));
                bufferView.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        const wavBlob = new Blob([bufferView], { type: "audio/wav" });
        resolve(wavBlob);
    });
}

// ページ初期化時にデータを読み込む
window.addEventListener("DOMContentLoaded", async () => {
    await loadUpdateData(); // update.json を読み込む
    renderAll();            // ローカル保存済みデータを描画
});

// 抽出ボタン処理
document.getElementById("extractBtn").addEventListener("click", async () => {
    const title = document.getElementById("title").value;
    const file = document.getElementById("video").files[0];

    if (!title || !file) {
        alert("タイトルと動画ファイルを選んでね！");
        return;
    }

    try {
        const blob = await extractAudioFromVideo(file);
        const base64 = await fileToBase64(blob);

        const data = JSON.parse(localStorage.getItem(localKey) || "[]");
        data.push({ title, base64, volume: 1.0, active: true });
        saveToLocal(data);

        renderAll();
        document.getElementById("title").value = "";
        document.getElementById("video").value = "";
    } catch (e) {
        alert("抽出に失敗しました: " + e);
    }
});