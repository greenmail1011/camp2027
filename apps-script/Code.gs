/**
 * 2027 AI創客無人機冬令營｜報名網頁後端（Google Apps Script）
 *
 * 功能：接收 register.html 送來的報名資料
 *   1. 交大教職員子女上傳的教職員證 → 存到雲端硬碟資料夾「2027冬令營_交大教職員證」
 *   2. 其他資料 → 直接寫成原本 Google 表單的一筆回覆（同一份回覆試算表）
 *
 * 部署：部署 → 新增部署作業 → 網頁應用程式｜執行身分：我｜存取權：所有人
 * 第一次使用前請先執行 setup()（會要求授權）。
 */

const FORM_ID = '1Pl-W0dfejheaaLPiwcE7hB2VjO5CaDCwFGPHgg-Usoc';
const FOLDER_NAME = '2027冬令營_交大教職員證';
const TZ = 'Asia/Taipei';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// 表單題目 ID（改表單題目後若 ID 改變，要同步更新這裡）
const ITEM = {
  name: 586149166,        // 學員姓名
  birth: 684401097,       // 學員出生年月日
  idno: 1732338026,       // 學員身份證字號
  gender: 1698192908,     // 性別
  school: 2117267010,     // 學員就讀學校
  grade: 556643245,       // 學生年級
  parent: 839831099,      // 家長姓名
  phone: 1621376266,      // 聯絡電話
  lunch: 879254404,       // 午餐方式
  idSelf: 1643602957,     // 報名身份（自備午餐）
  last5Self: 151126581,   // 匯款帳號後5碼（自備午餐區段）
  idOrder: 910366266,     // 報名身份（含代訂午餐）
  last5Order: 1168124086, // 匯款帳號後5碼（代訂午餐區段）
  group: 1106994454,      // 團報請寫哪幾位學員是一起報名
  line: 1342882277        // 加入 LINE 群組（核取方塊）
};

// 網頁新增的兩題（setup() 會自動加在表單最後）
const EXTRA = {
  fileLink: '交大教職員證（報名網頁上傳）',
  amount: '應繳金額（報名網頁計算）'
};
const EXTRA_HELP = '由報名網頁自動填入，直接填寫此表單者免填。';

const LUNCH = {
  self:  { text: '自備午餐', add: 0 },
  order: { text: '請老師代訂午餐（$150/天 × 5天，加收$750）', add: 750 }
};

// 報名身份：選項文字必須和表單完全相同；from/until 為台灣時間日期（含當天）
const IDENT = {
  super:   { price: 8800, until: '2026-11-30',
             self: '超早鳥：11/30 前報名繳費（$8,800元/位）',
             order: '超早鳥：11/30 前報名繳費（$9,550元/位，含午餐$750）' },
  early:   { price: 9300, from: '2026-12-01', until: '2026-12-31',
             self: '早鳥：12/31 前報名繳費（$9,300元/位）',
             order: '早鳥：12/31 前報名繳費（$10,050元/位，含午餐$750）' },
  regular: { price: 9800, from: '2027-01-01',
             self: '原價：1/1 起報名（$9,800元/位）',
             order: '原價：1/1 起報名（$10,550元/位，含午餐$750）' },
  group:   { price: 8800, needGroup: true,
             self: '團報優惠：2人(含)以上（$8,800元/位）',
             order: '團報優惠：2人(含)以上（$9,550元/位，含午餐$750）' },
  nycu:    { price: 8800, needFile: true,
             self: '陽明交大教職員子女優惠（$8,800元/位）',
             order: '陽明交大教職員子女優惠（$9,550元/位，含午餐$750）' },
  fzt:     { price: 8800,
             self: '未來斑馬程式設計學苑學員優惠（$8,800元/位）',
             order: '未來斑馬程式設計學苑學員優惠（$9,550元/位，含午餐$750）' }
};

/** 第一次使用前執行一次：建立雲端資料夾、在表單最後加上網頁專用的兩題 */
function setup() {
  const form = FormApp.openById(FORM_ID);
  getExtraItem_(form, EXTRA.fileLink);
  getExtraItem_(form, EXTRA.amount);
  const folder = getFolder_();
  Logger.log('完成。教職員證資料夾：' + folder.getUrl());
}

function doGet() {
  return json_({ ok: true, service: '2027冬令營報名後端' });
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    if (d.website) return json_({ ok: true }); // 防機器人欄位

    const errs = [];
    const s = k => String(d[k] == null ? '' : d[k]).trim();
    const need = (k, label) => { if (!s(k)) errs.push(label); };
    need('name', '學員姓名'); need('birth', '學員出生年月日'); need('idno', '學員身份證字號');
    need('gender', '性別'); need('school', '學員就讀學校'); need('grade', '學生年級');
    need('parent', '家長姓名'); need('phone', '聯絡電話');

    const ident = IDENT[s('ident')];
    const lunch = LUNCH[s('lunch')];
    if (!ident) errs.push('報名身份');
    if (!lunch) errs.push('午餐方式');
    if (!/^\d{5}$/.test(s('last5'))) errs.push('匯款帳號後5碼（需 5 位數字）');
    if (d.lineJoined !== true) errs.push('加入 LINE 群組');

    const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    if (ident && ((ident.from && today < ident.from) || (ident.until && today > ident.until))) {
      errs.push('所選優惠目前不在適用期間');
    }
    if (ident && ident.needGroup && !s('group')) errs.push('團報同行學員姓名');
    if (ident && ident.needFile && !(d.file && d.file.data)) errs.push('交大教職員證');
    if (d.file && d.file.data && d.file.data.length * 0.75 > MAX_FILE_BYTES) errs.push('檔案超過 10MB');
    if (errs.length) return json_({ ok: false, error: '請確認：' + errs.join('、') });

    const amount = ident.price + lunch.add;
    const form = FormApp.openById(FORM_ID);
    const resp = form.createResponse();
    const text = (id, v) => { if (v) resp.withItemResponse(form.getItemById(id).asTextItem().createResponse(v)); };
    const choice = (id, v) => resp.withItemResponse(form.getItemById(id).asMultipleChoiceItem().createResponse(v));

    text(ITEM.name, s('name'));
    text(ITEM.birth, s('birth'));
    text(ITEM.idno, s('idno').toUpperCase());
    choice(ITEM.gender, s('gender'));
    text(ITEM.school, s('school'));
    choice(ITEM.grade, s('grade'));
    text(ITEM.parent, s('parent'));
    text(ITEM.phone, s('phone'));
    choice(ITEM.lunch, lunch.text);
    if (s('lunch') === 'order') {
      choice(ITEM.idOrder, ident.order);
      text(ITEM.last5Order, s('last5'));
    } else {
      choice(ITEM.idSelf, ident.self);
      text(ITEM.last5Self, s('last5'));
    }
    text(ITEM.group, s('group'));
    resp.withItemResponse(form.getItemById(ITEM.line).asCheckboxItem().createResponse(['我已加入']));

    if (d.dryRun) return json_({ ok: true, dryRun: true, amount: amount });

    let fileUrl = '';
    if (d.file && d.file.data) {
      const ext = (String(d.file.name || '').match(/\.[A-Za-z0-9]{1,5}$/) || [''])[0];
      const fname = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmm') + '_' + s('name') + '_教職員證' + ext;
      const blob = Utilities.newBlob(Utilities.base64Decode(d.file.data), d.file.type || 'application/octet-stream', fname);
      fileUrl = getFolder_().createFile(blob).getUrl();
    }

    resp.withItemResponse(getExtraItem_(form, EXTRA.amount).createResponse('$' + amount.toLocaleString('en-US')));
    if (fileUrl) resp.withItemResponse(getExtraItem_(form, EXTRA.fileLink).createResponse(fileUrl));

    resp.submit();
    return json_({ ok: true, amount: amount });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: '系統錯誤，請稍後再試或來電 (03)540-3463', detail: String(err) });
  }
}

function getExtraItem_(form, title) {
  const found = form.getItems(FormApp.ItemType.TEXT).filter(it => it.getTitle() === title)[0];
  if (found) return found.asTextItem();
  return form.addTextItem().setTitle(title).setHelpText(EXTRA_HELP).setRequired(false);
}

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
