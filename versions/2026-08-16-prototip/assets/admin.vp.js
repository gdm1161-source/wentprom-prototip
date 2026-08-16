/* ═══════════════════════════════════════════════════════════════════════════
   ВЕНТПРОМ · хранилище цен административной панели (admin.html).
   Ванильный JS, без библиотек, без зависимости от assets/vp.js — панель
   служебная и живёт отдельно от состояния клиента (vp.anon.v2).

   ───────────────────────────────────────────────────────────────────────────
   ФОРМАТ ХРАНЕНИЯ. Ключ localStorage: 'vp.admin.prices.v1'.

   {
     "v": 1,                        // версия формата — для будущих миграций
     "updatedAt": 1755300000000,    // Date.now() последнего сохранения панелью
     "prices": {
       "vp1": {"price": 214300, "status": "manual", "updatedAt": 1755300000000},
       "vp7": {"price": null,   "status": "1c",      "updatedAt": null}
     }
   }

   Ключи объекта prices — идентификатор позиции VPCAT.SKU[i].id (напр. "vp1").
   Позиция БЕЗ записи в prices — это статус 'none' (цена не задана): запись
   создаётся, только когда цену реально ввели, а не заранее для всех 336.

   status:
     'none'   — записи нет, или price === null. Цена не задана.
     'manual' — введено вручную в этой панели.
     '1c'     — получено выгрузкой из 1С ERP. Формат обмена заводом не
                определён (файл, API или вебхук — решение за заводом), поэтому
                в этом прототипе статус 'manual' 1c НИКОГДА не устанавливается
                кодом — он только предусмотрен в формате на будущее.
   price: число в рублях (округлено до копеек) или null.

   ───────────────────────────────────────────────────────────────────────────
   ЕДИНЫЙ ИСТОЧНИК ЦЕНЫ ДЛЯ ОСТАЛЬНОГО САЙТА.
   Когда product.html, series.html или razdel.html захотят показать цену,
   им НЕ нужно ничего импортировать из этого файла — достаточно прочитать
   ключ напрямую (см. get() ниже для той же логики без записи):

     const raw = localStorage.getItem('vp.admin.prices.v1');
     const rec = raw ? (JSON.parse(raw).prices || {})[skuId] : null;
     const price = (rec && rec.status !== 'none' && rec.price != null) ? rec.price : null;

   Изменение цены в этой панели немедленно долетает до открытой в другой
   вкладке страницы каталога через событие storage (стандартное поведение
   localStorage между вкладками) — специального кода для этого не нужно.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

const KEY = 'vp.admin.prices.v1';

function blank() { return {v: 1, updatedAt: null, prices: {}}; }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object' && o.prices && typeof o.prices === 'object') return o;
    }
  } catch (e) { /* приватный режим или битый JSON — работаем с чистого листа */ }
  return blank();
}

let STATE = load();

function save() {
  STATE.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(STATE)); }
  catch (e) { /* квота хранилища или приватный режим — правка останется в памяти вкладки */ }
  root.dispatchEvent(new CustomEvent('vpadmin:store'));
}

/** Запись по позиции — всегда объект, даже когда цены нет */
function get(id) {
  return STATE.prices[id] || {price: null, status: 'none', updatedAt: null};
}

function round2(v) { return Math.round(Number(v) * 100) / 100; }

/** Ручной ввод цены — статус всегда становится 'manual' */
function setPrice(id, price) {
  STATE.prices[id] = {price: round2(price), status: 'manual', updatedAt: Date.now()};
  save();
}

/** Цена снята — позиция возвращается к статусу 'none' */
function clear(id) {
  delete STATE.prices[id];
  save();
}

/** Пакетный ввод одной цены на несколько позиций (массовое действие) */
function setMany(ids, price) {
  const ts = Date.now(), p = round2(price);
  ids.forEach(id => { STATE.prices[id] = {price: p, status: 'manual', updatedAt: ts}; });
  save();
}

/** Пакетный сброс цены (массовое действие) */
function clearMany(ids) {
  ids.forEach(id => { delete STATE.prices[id]; });
  save();
}

/** Запись без изменения статуса — нужна только для «Вернуть» после сброса */
function setRaw(id, rec) {
  if (rec) STATE.prices[id] = rec; else delete STATE.prices[id];
}
function commitRaw() { save(); }

function all() { return STATE.prices; }
function reload() { STATE = load(); return STATE; }

root.VPADMIN = {KEY, get, setPrice, clear, setMany, clearMany, setRaw, commitRaw, all, reload, save};
})(window);
