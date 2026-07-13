import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, doc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ==========================================
// 1. 乃亜さんの設定（先生アドレス ＆ Firebaseの鍵）
// ==========================================
const ADMIN_EMAIL = "noa.wtnb.1201@icloud.com";

const firebaseConfig = {
    apiKey: "AIzaSyCij2zalqj7-0REbUqtwN_5L0H6AyF3R4Q",
    authDomain: "study-and-mental.firebaseapp.com",
    projectId: "study-and-mental",
    storageBucket: "study-and-mental.firebasestorage.app",
    messagingSenderId: "314890355741",
    appId: "1:314890355741:web:8430ed678947a202cb32f4",
    measurementId: "G-5FNEE9Q79K"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. 画面要素の取得
// ==========================================
const authScreen = document.getElementById('auth-screen');
const authUsername = document.getElementById('auth-username');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');

const topScreen = document.getElementById('top-screen');
const recordScreen = document.getElementById('record-screen');
const tableScreen = document.getElementById('table-screen');
const chartScreen = document.getElementById('chart-screen');
const teacherScreen = document.getElementById('teacher-screen'); 

const recordButton = document.getElementById('record-button');
const viewTableButton = document.getElementById('view-table-button');
const logoutBtn = document.getElementById('logout-btn');
const teacherLogoutBtn = document.getElementById('teacher-logout-btn'); 
const userDisplayName = document.getElementById('user-display-name');

const menuOverlay = document.getElementById('menu-overlay');
const viewMenuOverlay = document.getElementById('view-menu-overlay');
const cancelAction = document.getElementById('cancel-action');
const cancelViewAction = document.getElementById('cancel-view-action');

const goToManual = document.getElementById('go-to-manual');
const goToTable = document.getElementById('go-to-table');
const goToChart = document.getElementById('go-to-chart');

const backToTopFromRecord = document.getElementById('back-to-top-from-record');
const backToTopFromTable = document.getElementById('back-to-top-from-table');
const backToTopFromChart = document.getElementById('back-to-top-from-chart');

const emotionButtons = document.querySelectorAll('.emotion-btn');
const saveRecordBtn = document.getElementById('save-record-btn');
const subjectInput = document.getElementById('subject-input');
const addSubjectBtn = document.getElementById('add-subject-btn');
const subjectSelect = document.getElementById('subject-select');

const datePicker = document.getElementById('date-picker');
const timePicker = document.getElementById('time-picker');
const hoursInput = document.getElementById('hours-input');
const minutesInput = document.getElementById('minutes-input');
const memoInput = document.getElementById('memo-input'); // 👈 見やすいようにここに移動しました！
const historyList = document.getElementById('history-list');

let currentUser = null;
let currentRecords = []; 
let selectedEmotion = "";

let timeChartInstance = null;
let dateChartInstance = null;
let emotionChartInstance = null;

// ==========================================
// 3. ログイン認証 ＆ 先生・生徒の画面切り替え
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        if (user.email === ADMIN_EMAIL) {
            authScreen.classList.add('hidden');
            topScreen.classList.add('hidden');
            teacherScreen.classList.remove('hidden'); 
            loadTeacherDashboard(); 
        } else {
            const qUser = query(collection(db, "users"), where("userId", "==", user.uid));
            onSnapshot(qUser, (snapshot) => {
                let name = user.email.split('@')[0];
                snapshot.forEach((doc) => {
                    name = doc.data().username;
                });
                userDisplayName.textContent = `${name} さんの記録`;
                listenToTeacherComments(name);
            });

            authScreen.classList.add('hidden');
            teacherScreen.classList.add('hidden');
            topScreen.classList.remove('hidden'); 
            listenToRecords();
        }
    } else {
        currentUser = null;
        topScreen.classList.add('hidden');
        recordScreen.classList.add('hidden');
        tableScreen.classList.add('hidden');
        chartScreen.classList.add('hidden');
        teacherScreen.classList.add('hidden');
        authScreen.classList.remove('hidden'); 
    }
});

// 新規アカウント作成
signupBtn.addEventListener('click', async () => {
    const username = authUsername.value.trim();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    
    if(!email || !password || (email !== ADMIN_EMAIL && !username)) { 
        alert("正しく入力してください！"); 
        return; 
    }
    
    try {
        if (email !== ADMIN_EMAIL) {
            const nameCheckQuery = query(collection(db, "users"), where("username", "==", username));
            const querySnapshot = await getDocs(nameCheckQuery);
            
            if (!querySnapshot.empty) {
                alert(`「${username}」はすでに他の人が使用しています。別のニックネームにしてください！`);
                return; 
            }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        if (email !== ADMIN_EMAIL) {
            await addDoc(collection(db, "users"), {
                userId: user.uid,
                username: username
            });
        }
        
        alert("アカウントを作成しました！");
        authUsername.value = "";
    } catch (err) {
        alert("エラー: " + err.message);
    }
});

// ログイン
loginBtn.addEventListener('click', () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if(!email || !password) { alert("入力してください！"); return; }
    signInWithEmailAndPassword(auth, email, password)
        .catch(err => alert("ログイン失敗: " + err.message));
});

// ログアウト
logoutBtn.addEventListener('click', () => signOut(auth).then(() => alert("ログアウトしました")));
if(teacherLogoutBtn) {
    teacherLogoutBtn.addEventListener('click', () => signOut(auth).then(() => alert("ログアウトしました")));
}

// ==========================================
// 4. 生徒側の処理（リアルタイムデータ受信）
// ==========================================
function listenToRecords() {
    if (!currentUser) return;
    
    const q = query(
        collection(db, "studyRecords"),
        where("userId", "==", currentUser.uid)
    );

    onSnapshot(q, (snapshot) => {
        currentRecords = [];
        snapshot.forEach((doc) => {
            currentRecords.push({ id: doc.id, ...doc.data() });
        });
        
        currentRecords.sort((a, b) => b.createdAt - a.createdAt);
        if (!tableScreen.classList.contains('hidden')) renderHistoryTable();
    });
}

// フォームの初期設定
const now = new Date();
if(datePicker) datePicker.value = now.toISOString().split('T')[0];
if(timePicker) timePicker.value = now.toTimeString().slice(0, 5);

recordButton.addEventListener('click', () => menuOverlay.classList.add('active'));
viewTableButton.addEventListener('click', () => viewMenuOverlay.classList.add('active'));
cancelAction.addEventListener('click', () => menuOverlay.classList.remove('active'));
cancelViewAction.addEventListener('click', () => viewMenuOverlay.classList.remove('active'));

goToManual.addEventListener('click', () => { menuOverlay.classList.remove('active'); topScreen.classList.add('hidden'); recordScreen.classList.remove('hidden'); });
goToTable.addEventListener('click', () => { viewMenuOverlay.classList.remove('active'); topScreen.classList.add('hidden'); tableScreen.classList.remove('hidden'); renderHistoryTable(); });
goToChart.addEventListener('click', () => { viewMenuOverlay.classList.remove('active'); topScreen.classList.add('hidden'); chartScreen.classList.remove('hidden'); renderCharts(); });

function resetForm() {
    selectedEmotion = "";
    emotionButtons.forEach(btn => btn.classList.remove('selected'));
    saveRecordBtn.disabled = true;
    saveRecordBtn.className = 'disabled-btn';
    subjectSelect.selectedIndex = 0;
    if (memoInput) memoInput.value = ""; // 👈 フォームリセット時にメモ欄も空にする
}

backToTopFromRecord.addEventListener('click', () => { resetForm(); recordScreen.classList.add('hidden'); topScreen.classList.remove('hidden'); });
backToTopFromTable.addEventListener('click', () => { tableScreen.classList.add('hidden'); topScreen.classList.remove('hidden'); });
backToTopFromChart.addEventListener('click', () => { chartScreen.classList.add('hidden'); topScreen.classList.remove('hidden'); });

emotionButtons.forEach(button => {
    button.addEventListener('click', () => {
        emotionButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        selectedEmotion = button.getAttribute('data-emotion');
        saveRecordBtn.disabled = false;
        saveRecordBtn.className = 'blue-btn active-save-btn';
    });
});

addSubjectBtn.addEventListener('click', () => {
    const name = subjectInput.value.trim();
    if (!name) return;
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    subjectSelect.appendChild(opt); subjectSelect.value = name; subjectInput.value = "";
});

saveRecordBtn.addEventListener('click', async () => {
    const subject = subjectSelect.value;
    if (!subject) { alert("教科を選択してください！"); return; }
    const hours = parseInt(hoursInput.value) || 0;
    const minutes = parseInt(minutesInput.value) || 0;

    let currentName = currentUser.email.split('@')[0];
    const userHeaderStr = userDisplayName.textContent;
    if (userHeaderStr.includes(" さんの記録")) {
        currentName = userHeaderStr.replace(" さんの記録", "");
    }

    // ✨【バグ修正】データを完全に作成してから Firebase に送る流れに整えました！
    const newRecord = {
        userId: currentUser.uid,
        username: currentName, 
        subject: subject,
        date: datePicker.value,
        time: timePicker.value,
        duration: (hours * 60) + minutes, 
        emotion: selectedEmotion,
        memo: memoInput ? memoInput.value.trim() : "", 
        createdAt: new Date().getTime()
    };

    try {
        await addDoc(collection(db, "studyRecords"), newRecord);
        alert("ネット上に保存しました！");
        resetForm(); // 👈 保存が【成功したあと】にフォームをリセットして空にします！
        recordScreen.classList.add('hidden'); 
        topScreen.classList.remove('hidden');
    } catch (e) {
        alert("保存エラー: " + e.message);
    }
});

function renderHistoryTable() {
    historyList.innerHTML = "";
    if (currentRecords.length === 0) { historyList.innerHTML = '<div class="empty-message">記録がありません</div>'; return; }
    const emotionIcons = { angry: "😡", sad: "😟", good: "🙂", happy: "😊" };

    currentRecords.forEach((record) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const h = Math.floor(record.duration / 60); const m = record.duration % 60;
        const durationText = h > 0 ? `${h}時間 ${m}分` : `${m}分`;
        
        item.innerHTML = `
            <div class="history-info">
                <div class="item-subject">${record.subject}</div>
                <div class="item-time-date">${record.date} / ${durationText}</div>
                ${record.memo ? `<div class="item-memo" style="font-size: 13px; color: #666; margin-top: 6px; background: #f0f0f0; padding: 4px 8px; border-radius: 4px; word-break: break-all;">📝 ${record.memo}</div>` : ''}
            </div>
            <div class="history-right">
                <div class="item-emotion">${emotionIcons[record.emotion] || "🙂"}</div>
                <button class="delete-item-btn" data-id="${record.id}">削除</button>
            </div>
        `;
    
        historyList.appendChild(item);
    });

    document.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            if (confirm("この記録を削除しますか？")) {
                await deleteDoc(doc(db, "studyRecords", id));
            }
        });
    });
}

function renderCharts() {
    if (timeChartInstance) timeChartInstance.destroy();
    if (dateChartInstance) dateChartInstance.destroy();
    if (emotionChartInstance) emotionChartInstance.destroy();
    if (currentRecords.length === 0) { alert("データがありません！"); return; }

    const subjectData = {}; const dateData = {}; const emotionCounts = { happy: 0, good: 0, sad: 0, angry: 0 };
    const sortedForChart = [...currentRecords].reverse();

    sortedForChart.forEach(record => {
        subjectData[record.subject] = (subjectData[record.subject] || 0) + record.duration;
        dateData[record.date] = (dateData[record.date] || 0) + record.duration;
        if (emotionCounts[record.emotion] !== undefined) { emotionCounts[record.emotion]++; }
    });

    const timeCtx = document.getElementById('timeChart').getContext('2d');
    timeChartInstance = new Chart(timeCtx, { type: 'bar', data: { labels: Object.keys(subjectData), datasets: [{ label: '勉強時間 (分)', data: Object.values(subjectData), backgroundColor: '#007aff', borderRadius: 6 }] }, options: { responsive: true } });
    const dateCtx = document.getElementById('dateChart').getContext('2d');
    dateChartInstance = new Chart(dateCtx, { type: 'line', data: { labels: Object.keys(dateData), datasets: [{ label: 'その日の合計時間 (分)', data: Object.values(dateData), borderColor: '#34c759', backgroundColor: 'rgba(52, 199, 89, 0.1)', tension: 0.2, fill: true }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
    const emotionCtx = document.getElementById('emotionChart').getContext('2d');
    emotionChartInstance = new Chart(emotionCtx, { type: 'pie', data: { labels: ['😊 Happy', '🙂 Good', '😟 Sad', '😡 Angry'], datasets: [{ data: [emotionCounts.happy, emotionCounts.good, emotionCounts.sad, emotionCounts.angry], backgroundColor: ['#ffcc00', '#4cd964', '#5ac8fa', '#ff3b30'] }] }, options: { responsive: true } });
}

// ==========================================
// 5. 先生側の管理画面ロジック ＆ コメント機能
// ==========================================
const sendCommentBtn = document.getElementById('send-comment-btn');
if (sendCommentBtn) {
    sendCommentBtn.addEventListener('click', async (e) => {
        e.preventDefault(); 

        let targetName = document.getElementById('target-student-name')?.value.trim();
        const messageText = document.getElementById('teacher-comment-input')?.value.trim();
        
        if (!targetName || !messageText) {
            alert("生徒のニックネームとメッセージを両方入力してください！");
            return;
        }

        try {
            await addDoc(collection(db, "teacherComments"), {
                targetUsername: targetName,
                message: messageText,
                createdAt: new Date().getTime()
            });

            if(targetName === "Kさん" || targetName === "K") {
                await addDoc(collection(db, "teacherComments"), {
                    targetUsername: "test", 
                    message: messageText,
                    createdAt: new Date().getTime()
                });
            }

            alert(`${targetName} さんへコメントを送信しました！`);
            document.getElementById('teacher-comment-input').value = "";
        } catch (error) {
            alert("送信エラー: " + error.message);
        }
    });
}

function listenToTeacherComments(studentName) {
    const q = query(
        collection(db, "teacherComments"), 
        where("targetUsername", "in", [studentName, "Kさん", "test"])
    );
    
    onSnapshot(q, (snapshot) => {
        let latestMessage = "まだ先生からのメッセージはありません。";
        let latestTime = 0;

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.createdAt && data.createdAt > latestTime) {
                latestMessage = data.message;
                latestTime = data.createdAt;
            }
        });
        
        const displayEl = document.getElementById('teacher-comment-display');
        if (displayEl) {
            displayEl.innerHTML = `📬 <strong>先生からのメッセージ:</strong><br>${latestMessage}`;
        }
    });
}

async function loadTeacherDashboard() {
    try {
        const querySnapshot = await getDocs(collection(db, "studyRecords"));
        let logs = [];
        
        querySnapshot.forEach((doc) => {
            logs.push(doc.data());
        });

        logs.sort((a, b) => b.createdAt - a.createdAt);

        calculateMentalWeather(logs);
        detectSilentSOS(logs);

        const allLogsArea = document.getElementById("all-students-log");
        if(allLogsArea) {
            allLogsArea.innerHTML = "";
            if (logs.length === 0) {
                allLogsArea.innerHTML = "<p class='empty-message'>まだ生徒のデータがありません。</p>";
                return;
            }

            const emotionIcons = { angry: "😡", sad: "😟", good: "🙂", happy: "😊" };
            logs.forEach(data => {
                const logItem = document.createElement("div");
                logItem.className = "history-item";
                const h = Math.floor(data.duration / 60); const m = data.duration % 60;
                const durationText = h > 0 ? `${h}時間 ${m}分` : `${m}分`;
                logItem.innerHTML = `
                    <div class="history-info">
                        <div class="item-subject">👤 ${data.username || "不明"} - ${data.subject}</div>
                        <div class="item-time-date">${data.date} / ${durationText}</div>
                        ${data.memo ? `<div class="item-memo" style="font-size: 13px; color: #555; margin-top: 4px; background: #e8f0fe; padding: 4px 8px; border-radius: 4px; word-break: break-all;">📝 内容: ${data.memo}</div>` : ''}
                    </div>
                    <div class="history-right">
                        <div class="item-emotion">${emotionIcons[data.emotion] || "🙂"}</div>
                    </div>
                `;
                allLogsArea.appendChild(logItem);
            });
        }
    } catch (error) {
        console.error("先生画面データの取得エラー:", error);
    }
}

function calculateMentalWeather(logs) {
    const weatherDisplay = document.getElementById("mental-weather-status");
    if (!weatherDisplay) return;
    if (logs.length === 0) { weatherDisplay.textContent = "データが足りません"; return; }

    let happyCount = 0; let sadCount = 0;
    logs.forEach(log => {
        if (log.emotion === "happy" || log.emotion === "good") happyCount++;
        if (log.emotion === "sad" || log.emotion === "angry") sadCount++;
    });

    const total = happyCount + sadCount;
    if(total === 0) { weatherDisplay.textContent = "感情データがありません"; return; }
    const happyRatio = (happyCount / total) * 100;

    if (happyRatio >= 75) {
        weatherDisplay.innerHTML = `☀️ <br> <strong>快晴 (ハッピー度: ${Math.round(happyRatio)}%)</strong><br><p style="font-size:14px; margin-top:5px; color:#666;">クラス全体が前向きに勉強に取り組めています！</p>`;
    } else if (happyRatio >= 50) {
        weatherDisplay.innerHTML = `⛅ <br> <strong>晴れのち曇り (ハッピー度: ${Math.round(happyRatio)}%)</strong><br><p style="font-size:14px; margin-top:5px; color:#666;">概ね順調ですが、少し疲れが見え始めているかも。</p>`;
    } else {
        weatherDisplay.innerHTML = `🌧️ <br> <strong style="color: #ff3b30;">大雨警報 (ハッピー度: ${Math.round(happyRatio)}%)</strong><br><p style="font-size:14px; margin-top:5px; color:#666;">イライラや不安が溜まっている生徒が多いようです。声かけのチャンス！</p>`;
    }
}

function detectSilentSOS(logs) {
    const sosListArea = document.getElementById("silent-sos-list");
    if (!sosListArea) return;
    sosListArea.innerHTML = "";

    const userHistory = {};
    const sortedLogs = [...logs].sort((a, b) => a.createdAt - b.createdAt);

    sortedLogs.forEach(log => {
        if (!log.username) return;
        if (!userHistory[log.username]) { userHistory[log.username] = []; }
        userHistory[log.username].push(log.emotion);
    });

    let sosCount = 0;

    for (const username in userHistory) {
        const emotions = userHistory[username];
        let consecutiveBadDays = 0;
        let triggersSOS = false;

        for (let i = 0; i < emotions.length; i++) {
            if (emotions[i] === "sad" || emotions[i] === "angry") {
                consecutiveBadDays++;
                if (consecutiveBadDays >= 2) { triggersSOS = true; }
            } else {
                consecutiveBadDays = 0; 
            }
        }

        if (triggersSOS) {
            sosCount++;
            const alertTag = document.createElement("div");
            alertTag.className = "history-item";
            alertTag.style.borderLeft = "5px solid #ff3b30";
            alertTag.style.marginBottom = "8px";
            alertTag.innerHTML = `
                <div class="history-info">
                    <div class="item-subject" style="color:#ff3b30; font-weight:bold;">⚠️ 連続アラート</div>
                    <div class="item-time-date"><strong>${username}</strong> さんの心に「しんどいサイン」が続いています。</div>
                </div>
            `;
            sosListArea.appendChild(alertTag);
        }
    }

    if (sosCount === 0) {
        sosListArea.innerHTML = "<div class='empty-message'>✅ 現在、アラートが出ている生徒はいません。みんな順調そうです！</div>";
    }
}
