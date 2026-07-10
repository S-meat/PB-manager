/**
 * PB商品 受発注管理 GASバックエンド
 * スプレッドシート（商品マスタ / 入出庫ログ / 発注管理 / 設定）に対する
 * 読み取り・書き込みAPIを提供します。
 *
 * デプロイ方法：
 *  1. 投入用スプレッドシートを開く → 拡張機能 → Apps Script
 *  2. このコードを全文貼り付けて保存
 *  3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *     実行ユーザー：自分 ／ アクセスできるユーザー：全員
 *  4. 発行されたURLを pb-manager.html の GAS_URL に貼り付ける
 */

var SS = SpreadsheetApp.getActiveSpreadsheet();
var TZ = 'Asia/Tokyo';

function doGet(e) {
  return jsonOut(buildState());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var req = JSON.parse(e.postData.contents);
    handleAction(req);
  } finally {
    lock.releaseLock();
  }
  return jsonOut(buildState());
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================= アクション処理 =================
function handleAction(req) {
  var a = req.action;
  if (a === 'addLog')        return addLog(req);
  if (a === 'addOrder')      return addOrder(req);
  if (a === 'updateOrder')   return updateOrder(req);
  if (a === 'deleteOrder')   return deleteOrder(req);
  if (a === 'addProduct')    return addProduct(req);
  if (a === 'updateProduct') return updateProduct(req);
  if (a === 'deleteProduct') return deleteProduct(req);
  throw new Error('unknown action: ' + a);
}

function nowStr() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
}

// ---- 入出庫ログ ----
function addLog(req) {
  var ws = SS.getSheetByName('入出庫ログ');
  var id = 'L' + new Date().getTime().toString(36);
  ws.appendRow([id, req.date, req.pid, req.pname, req.type, Number(req.qty),
                req.lot || '', req.expiry || '', req.weight || '', req.memo || '',
                req.user || '', nowStr()]);
  notifySlack(buildLogMessage(req));
}

function buildLogMessage(req) {
  var icon = req.type === '入庫' ? ':inbox_tray:' : req.type === '出庫' ? ':outbox_tray:' : ':pencil:';
  var msg = icon + ' 【' + req.type + '】' + req.pname + '　' + req.qty +
            '（' + req.date + '）';
  if (req.user) msg += '　登録：' + req.user;
  var stock = currentStock()[req.pid];
  if (stock !== undefined) msg += '\n→ 現在庫：' + stock;
  return msg;
}

// ---- 発注管理 ----
function addOrder(req) {
  var ws = SS.getSheetByName('発注管理');
  var id = 'O' + new Date().getTime().toString(36);
  ws.appendRow([id, req.pid, req.pname, req.date, req.qty || '', req.mat || '',
                '発注済', req.memo || '', nowStr()]);
  notifySlack(':memo: 【発注登録】' + req.pname + '　数量:' + (req.qty || '未定') +
              '（発注日 ' + req.date + '）');
}

function findOrderRow(ws, oid) {
  var ids = ws.getRange(2, 1, Math.max(ws.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === oid) return i + 2;
  }
  return -1;
}

function updateOrder(req) {
  var ws = SS.getSheetByName('発注管理');
  var r = findOrderRow(ws, req.oid);
  if (r < 0) throw new Error('order not found');
  if (req.status !== undefined) ws.getRange(r, 7).setValue(req.status);
  if (req.mat !== undefined)    ws.getRange(r, 6).setValue(req.mat);
  if (req.qty !== undefined)    ws.getRange(r, 5).setValue(req.qty);
  if (req.memo !== undefined)   ws.getRange(r, 8).setValue(req.memo);
  ws.getRange(r, 9).setValue(nowStr());
}

function deleteOrder(req) {
  var ws = SS.getSheetByName('発注管理');
  var r = findOrderRow(ws, req.oid);
  if (r > 0) ws.deleteRow(r);
}

// ---- 商品マスタ ----
function addProduct(req) {
  var ws = SS.getSheetByName('商品マスタ');
  var vals = ws.getRange(2, 1, Math.max(ws.getLastRow() - 1, 1), 1).getValues();
  var maxN = 0;
  for (var i = 0; i < vals.length; i++) {
    var m = String(vals[i][0]).match(/^P(\d+)$/);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  }
  var pid = 'P' + ('0' + (maxN + 1)).slice(-2);
  var p = req.product;
  ws.appendRow([pid, p.name, p.cat || '', p.status || '販売中', p.trigger || '',
                p.vendor || '', p.maker || '', p.material || '', p.dest || '',
                Number(p.lt) || 0, p.report || '－', p.memo || '']);
}

function findProductRow(ws, pid) {
  var ids = ws.getRange(2, 1, Math.max(ws.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === pid) return i + 2;
  }
  return -1;
}

function updateProduct(req) {
  var ws = SS.getSheetByName('商品マスタ');
  var r = findProductRow(ws, req.pid);
  if (r < 0) throw new Error('product not found');
  var p = req.product;
  ws.getRange(r, 2, 1, 11).setValues([[p.name, p.cat || '', p.status || '販売中',
    p.trigger || '', p.vendor || '', p.maker || '', p.material || '', p.dest || '',
    Number(p.lt) || 0, p.report || '－', p.memo || '']]);
}

function deleteProduct(req) {
  var ws = SS.getSheetByName('商品マスタ');
  var r = findProductRow(ws, req.pid);
  if (r > 0) ws.deleteRow(r);
}

// ================= 状態の構築 =================
function buildState() {
  var master = readMaster();
  var settings = readSettings();
  var logData = readLogs();
  var orders = readOrders();
  return {
    ok: true,
    master: master,
    settings: settings,
    stock: logData.stock,
    monthly: logData.monthly,
    recentLogs: logData.recent,
    orders: orders,
    serverTime: nowStr()
  };
}

function readMaster() {
  var ws = SS.getSheetByName('商品マスタ');
  var n = ws.getLastRow() - 1;
  if (n < 1) return [];
  var rows = ws.getRange(2, 1, n, 12).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    out.push({ pid: r[0], name: r[1], cat: r[2], status: r[3], trigger: r[4],
               vendor: r[5], maker: r[6], material: r[7], dest: r[8],
               lt: Number(r[9]) || 0, report: r[10], memo: r[11] });
  }
  return out;
}

function readSettings() {
  var ws = SS.getSheetByName('設定');
  var n = ws.getLastRow() - 1;
  var s = { '安全在庫月数': '0.5' };
  if (n < 1) return s;
  var rows = ws.getRange(2, 1, n, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0]) s[rows[i][0]] = String(rows[i][1]);
  }
  return s;
}

function fmtYMD(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v || '');
}

function readLogs() {
  var ws = SS.getSheetByName('入出庫ログ');
  var n = ws.getLastRow() - 1;
  var stock = {}, monthly = {}, recent = [];
  if (n < 1) return { stock: stock, monthly: monthly, recent: recent };
  var rows = ws.getRange(2, 1, n, 12).getValues();
  // 直近14か月のキー
  var keys = {};
  var d = new Date(); d.setDate(1);
  for (var k = 0; k < 14; k++) {
    keys[Utilities.formatDate(d, TZ, 'yyyy-MM')] = true;
    d.setMonth(d.getMonth() - 1);
  }
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var pid = r[2], typ = r[4], qty = Number(r[5]) || 0;
    if (!pid) continue;
    if (typ === '入庫') stock[pid] = (stock[pid] || 0) + qty;
    else if (typ === '出庫') stock[pid] = (stock[pid] || 0) - qty;
    else if (typ === '調整') stock[pid] = (stock[pid] || 0) + qty;
    if (typ === '出庫') {
      var ymKey = fmtYMD(r[1]).slice(0, 7);
      if (keys[ymKey]) {
        if (!monthly[pid]) monthly[pid] = {};
        monthly[pid][ymKey] = (monthly[pid][ymKey] || 0) + qty;
      }
    }
  }
  // 直近25件（下から）
  var from = Math.max(0, rows.length - 25);
  for (var j = rows.length - 1; j >= from; j--) {
    var q = rows[j];
    recent.push({ id: q[0], date: fmtYMD(q[1]), pid: q[2], pname: q[3],
                  type: q[4], qty: q[5], lot: q[6], expiry: fmtYMD(q[7]),
                  memo: q[9], user: q[10] });
  }
  return { stock: stock, monthly: monthly, recent: recent };
}

function currentStock() {
  return readLogs().stock;
}

function readOrders() {
  var ws = SS.getSheetByName('発注管理');
  var n = ws.getLastRow() - 1;
  if (n < 1) return [];
  var rows = ws.getRange(2, 1, n, 9).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    out.push({ oid: r[0], pid: r[1], pname: r[2], date: fmtYMD(r[3]),
               qty: r[4], mat: fmtYMD(r[5]), status: r[6], memo: r[7],
               updated: String(r[8] || '') });
  }
  // 完了は直近30件まで
  var active = out.filter(function(o){ return o.status !== '納品完了'; });
  var done = out.filter(function(o){ return o.status === '納品完了'; }).slice(-30);
  return active.concat(done);
}

// ================= Slack通知（任意） =================
function notifySlack(text) {
  var url = readSettings()['SLACK_WEBHOOK_URL'];
  if (!url) return;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
  } catch (err) { /* 通知失敗は無視（本処理は成功済み） */ }
}

// ================= 動作テスト用 =================
function testBuildState() {
  Logger.log(JSON.stringify(buildState()).slice(0, 2000));
}
