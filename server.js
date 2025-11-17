const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// 用來存顧客常用資料的檔案 和 用來存司機資料的檔案
const PROFILE_FILE = path.join(__dirname, 'customerProfiles.json');
const DRIVER_PROFILE_FILE = path.join(__dirname, 'driverProfiles.json');


// 讓 Express 看得懂 POST form 資料
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 暫時用記憶體放訂單（之後會換成資料庫）
let rides = [];

// 哪些司機想接哪個訂單，例如：{ 1: ['司機A', '司機B'] }
let driverWant = {};

// 記住每個客戶最近一次的資料，用 phone 當 key
let customerProfiles = {};
let driverProfiles = {};

// 啟動時嘗試從檔案讀回來（重啟後也記得）
try {
  if (fs.existsSync(PROFILE_FILE)) {
    const raw = fs.readFileSync(PROFILE_FILE, 'utf8');
    if (raw.trim()) {
      customerProfiles = JSON.parse(raw);
    }
  }
} catch (e) {
  console.error('載入顧客資料失敗：', e);
  customerProfiles = {};
}

// 啟動時讀取 driverProfiles.json
try {
  if (fs.existsSync(DRIVER_PROFILE_FILE)) {
    const raw = fs.readFileSync(DRIVER_PROFILE_FILE, 'utf8');
    if (raw.trim()) {
      driverProfiles = JSON.parse(raw);
    }
  }
} catch (e) {
  console.error('載入司機資料失敗：', e);
  driverProfiles = {};
}


// 乘客叫車表單頁面
app.get('/passenger/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'passenger-order.html'));
});

// 派車員後台頁面
app.get('/dispatcher', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dispatcher-orders.html'));
});

// 司機端頁面
app.get('/driver', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'driver-orders.html'));
});

// 派車員查訂單（包含想接單的司機）
app.get('/dispatcher/orders', (req, res) => {
  const list = rides.map(r => ({
    ...r,
    wants: driverWant[r.id] || []
  }));
  res.json(list);
});

// 司機按「我要接」
app.post('/driver/want', (req, res) => {
  const { id, driver } = req.body;

  if (!driverWant[id]) driverWant[id] = [];
  driverWant[id].push(driver);

  res.send('OK');
});

app.post("/driver/take", (req, res) => {
    const { id } = req.body;
    const ride = rides.find(r => r.id == id);

    if (ride) {
        ride.status = "taken";   // ⭐ 最重要：寫入後端狀態
    }

    res.json({ ok: true });
});


// 派車員指派司機
app.post('/dispatcher/assign', (req, res) => {
  const { id, driver } = req.body;

  const ride = rides.find(r => r.id === Number(id));
  if (!ride) return res.status(404).send('找不到訂單');

  ride.status = 'assigned';
  ride.driver = driver;

  res.send('指派成功');
});

// 【新】讓前端用電話查詢上一次叫車資料（跨裝置）
app.get('/api/last-info', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json(null);

  const info = customerProfiles[phone];
  if (!info) return res.json(null);

  res.json({
    phone: info.phone || '',
    passengerId: info.passengerId || '',
    pickup: info.pickup || '',
    dropoff: info.dropoff || ''
  });
});

// 取得司機資料（跨平台）
app.get('/api/driver-info', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json(null);

  const info = driverProfiles[phone];
  if (!info) return res.json(null);

  res.json(info);
});

// 儲存司機資料（跨平台 + JSON 持久化）
app.post('/api/driver-info', (req, res) => {
  const { driverPhone, driverName, carNo, carType } = req.body;

  if (!driverPhone) return res.status(400).send('缺少手機號碼');

  driverProfiles[driverPhone] = {
    driverPhone,
    driverName,
    carNo,
    carType
  };

  try {
    fs.writeFileSync(
      DRIVER_PROFILE_FILE,
      JSON.stringify(driverProfiles, null, 2),
      'utf8'
    );
  } catch (e) {
    console.error('儲存司機資料失敗：', e);
  }

  res.send('OK');
});


// 乘客送出訂單
app.post('/passenger/order', (req, res) => {
  const {
    passengerId,
    pickup,
    dropoff,
    pickupDate,
    pickupHour,
    pickupMinute,
    phone,
    flightNo,
    peopleCount,
    luggageCount
  } = req.body;

  const pad = n => n.toString().padStart(2, '0');
  const time24 = `${pickupDate} ${pad(pickupHour)}:${pad(pickupMinute)}`;

  const ride = {
    id: rides.length + 1,
    passengerId,
    pickup,
    dropoff,
    time: time24,
    phone,
    flightNo,
    peopleCount,
    luggageCount,
    status: "new"
  };
  rides.push(ride);

  // 【新】記住這個電話最近一次的基本資料（跨裝置 + 重啟也記得）
  if (phone) {
    customerProfiles[phone] = {
      phone,
      passengerId,
      pickup,
      dropoff
    };

    try {
      fs.writeFileSync(
        PROFILE_FILE,
        JSON.stringify(customerProfiles, null, 2),
        'utf8'
      );
    } catch (e) {
      console.error('儲存顧客資料失敗：', e);
    }
  }

  // ====== 顯示用的文字格式 ======

  const [y, m, d] = pickupDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
  const dateDisplay = `${m}月${d}日(週${weekNames[dateObj.getDay()]})`;

  const h = parseInt(pickupHour, 10);
  const min = parseInt(pickupMinute, 10);
  const isPM = h >= 12;
  let displayHour = h;
  if (h === 0) displayHour = 12;
  else if (h > 12) displayHour = h - 12;
  const ampm = isPM ? 'PM' : 'AM';
  const timeDisplay = `${ampm} ${displayHour}:${pad(min)}`;

  // ✨ 純叫車內容（複製與 LINE 分享用）
  const pureText = `
乘客姓名：${passengerId}
聯絡電話：${phone}
用車日期：${dateDisplay}
預約時間：${timeDisplay}

上車地點：
${pickup}

下車地點：
${dropoff}

班機號碼：${flightNo}
搭車人數：${peopleCount}
行李數：${luggageCount}
  `.trim();

  // LINE 分享連結
  const lineShareURL = `https://line.me/R/msg/text/?${encodeURIComponent(pureText)}`;

  // ====== 回傳前端頁面 ======
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>叫車內容確認</title>

<style>
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #f2f2f2;
    font-size: 16px;
  }
  .wrap {
    max-width: 420px;
    margin: 10px auto;
    padding: 10px;
  }
  h1 {
    font-size: 22px;
    text-align: center;
    margin-bottom: 10px;
  }
  .hint {
    font-size: 15px;
    margin-bottom: 10px;
    text-align: center;
  }
  pre {
    background: #fff;
    padding: 12px;
    border-radius: 8px;
    font-size: 15px;
    white-space: pre-wrap;
    line-height: 1.45;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .btn {
    width: 100%;
    padding: 10px;
    margin-top: 8px;
    border: none;
    font-size: 16px;
    border-radius: 8px;
  }
  .btn-copy { background: #007bff; color: white; }
  .btn-line { background: #00c300; color: white; }
  .btn-back { background: #e0e0e0; }
</style>

</head>

<body>
<div class="wrap">

  <h1>叫車內容確認</h1>

  <p class="hint">以下是您叫車內容，請稍待派車資訊！</p>

  <pre id="orderText">${pureText}</pre>

  <button class="btn btn-copy" id="copyBtn">複製文字</button>

  <a href="${lineShareURL}">
    <button class="btn btn-line">一鍵分享到 LINE</button>
  </a>

  <button class="btn btn-back" onclick="location.href='/passenger/order'">
    返回貴賓叫車頁面
  </button>

</div>

<script>
document.getElementById('copyBtn').onclick = () => {
  const textEl = document.getElementById('orderText');

  // 建立選取範圍
  const range = document.createRange();
  range.selectNode(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {}

  sel.removeAllRanges();

  if (ok) {
    alert("已複製叫車內容！");
  } else {
    alert("請長按文字自行複製");
  }
};
</script>

</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
