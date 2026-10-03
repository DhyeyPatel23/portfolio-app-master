'use strict';

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ═══════════════════════════════════════════════════════════
   MIDDLEWARE
═══════════════════════════════════════════════════════════ */
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ═══════════════════════════════════════════════════════════
   POSTGRESQL CONNECTION
═══════════════════════════════════════════════════════════ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

/* ═══════════════════════════════════════════════════════════
   DATABASE INITIALISATION
   Creates tables if they don't already exist.
═══════════════════════════════════════════════════════════ */
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS visitors (
        id           SERIAL PRIMARY KEY,
        ip           VARCHAR(60),
        user_agent   TEXT,
        browser      VARCHAR(120),
        os           VARCHAR(120),
        os_version   VARCHAR(80),
        device       VARCHAR(60),
        device_model VARCHAR(200),
        referrer     TEXT,
        page         VARCHAR(500),
        visited_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(255)  NOT NULL,
        email        VARCHAR(255)  NOT NULL,
        subject      VARCHAR(500),
        message      TEXT          NOT NULL,
        ip           VARCHAR(60),
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        is_read      BOOLEAN DEFAULT FALSE
      );
    `);

    /* Safe for existing databases — adds columns if missing */
    await client.query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS device_model VARCHAR(200)`);
    await client.query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS os_version   VARCHAR(80)`);

    console.log('✅  Database tables ready');
  } finally {
    client.release();
  }
}

/* ═══════════════════════════════════════════════════════════
   EMAIL TRANSPORTER
═══════════════════════════════════════════════════════════ */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS   /* Use a Gmail App Password, not your real password */
  }
});

async function sendMail(to, subject, html) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) { return; }
  try {
    await transporter.sendMail({
      from: `"Dhyey Portfolio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error('Mail error:', err.message);
  }
}

/* ─── Helper: parse User-Agent into readable parts ─── */
function parseUA(ua) {
  if (!ua) {
    return { browser: 'Unknown', os: 'Unknown', osVersion: '', device: 'Desktop', deviceModel: 'Unknown' };
  }

  /* Browser */
  let browser = 'Other';
  if (ua.includes('Edg/') || ua.includes('EdgA/')) { browser = 'Edge'; }
  else if (ua.includes('OPR/') || ua.includes('Opera')) { browser = 'Opera'; }
  else if (ua.includes('SamsungBrowser')) { browser = 'Samsung Browser'; }
  else if (ua.includes('Chrome') && !ua.includes('Chromium')) { browser = 'Chrome'; }
  else if (ua.includes('Chromium')) { browser = 'Chromium'; }
  else if (ua.includes('Firefox')) { browser = 'Firefox'; }
  else if (ua.includes('Safari') && !ua.includes('Chrome')) { browser = 'Safari'; }
  else if (ua.includes('MSIE') || ua.includes('Trident')) { browser = 'Internet Explorer'; }

  /* OS + version */
  let os = 'Other', osVersion = '';

  if (ua.includes('Windows NT')) {
    os = 'Windows';
    const m = ua.match(/Windows NT ([\d.]+)/);
    if (m) {
      const map = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };
      osVersion = map[m[1]] || m[1];
    }
  } else if (ua.includes('Android')) {
    os = 'Android';
    const m = ua.match(/Android ([\d.]+)/);
    if (m) { osVersion = m[1]; }
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
    const m = ua.match(/OS ([\d_]+)/);
    if (m) { osVersion = m[1].replace(/_/g, '.'); }
  } else if (ua.includes('Mac OS X')) {
    os = 'macOS';
    const m = ua.match(/Mac OS X ([\d_]+)/);
    if (m) { osVersion = m[1].replace(/_/g, '.'); }
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  /* Device type */
  let device = 'Desktop';
  if (ua.includes('iPhone')) { device = 'Mobile'; }
  else if (ua.includes('iPad')) { device = 'Tablet'; }
  else if (ua.includes('Android') && ua.includes('Mobile')) { device = 'Mobile'; }
  else if (ua.includes('Android') && !ua.includes('Mobile')) { device = 'Tablet'; }
  else if (ua.includes('Mobile')) { device = 'Mobile'; }

  /* Device model */
  let deviceModel = '';

  if (ua.includes('iPhone')) {
    deviceModel = 'iPhone'; /* Apple removed model from UA since iOS 13 */
  } else if (ua.includes('iPad')) {
    deviceModel = 'iPad';
  } else if (ua.includes('Android')) {
    const m = ua.match(/Android\s[\d.]+;\s([^);]+?)(?:\s+Build\/|\))/);
    if (m) {
      deviceModel = m[1].trim();
      if (/^SM-[A-Z0-9]+$/i.test(deviceModel)) {
        deviceModel = 'Samsung ' + deviceModel; /* beautify Samsung codes */
      }
    } else {
      deviceModel = 'Android Device';
    }
  } else if (os === 'Windows') {
    deviceModel = 'Windows PC';
  } else if (os === 'macOS') {
    deviceModel = ua.includes('Macintosh') ? 'MacBook / iMac' : 'Mac';
  } else if (os === 'Linux') {
    deviceModel = 'Linux PC';
  } else {
    deviceModel = 'Unknown';
  }

  deviceModel = (deviceModel || 'Unknown').slice(0, 120).trim();
  return { browser, os, osVersion, device, deviceModel };
}

function getIST(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function realIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* ═══════════════════════════════════════════════════════════
   RATE-LIMIT HELPER
   Simple in-memory store — prevents email spam.
   Key = IP, value = last-notified timestamp.
   Resets when server restarts (that's fine).
═══════════════════════════════════════════════════════════ */
const visitEmailLog = new Map();   /* ip → Date */
const VISIT_EMAIL_COOLDOWN_MS = 8 * 60 * 60 * 1000;  /* 8 hours */

/* ═══════════════════════════════════════════════════════════
   API — POST /api/visit
   Called by the portfolio page on every load.
═══════════════════════════════════════════════════════════ */
app.post('/api/visit', async (req, res) => {
  try {
    const ip = realIP(req);
    const ua = req.headers['user-agent'] || '';
    const referrer = (req.body && req.body.referrer) || req.headers['referer'] || '';
    const page = (req.body && req.body.page) || '/';
    const parsed = parseUA(ua);

    /* ── Override UA-parsed values with Client Hints if browser sent them ──
       Chrome 110+ sends "K" as model and "10" as Android version in the UA
       string (privacy reduction). Client Hints give us the real values.    */
    const hintModel = (req.body && req.body.deviceModel) ? String(req.body.deviceModel).trim() : '';
    const hintOSVer = (req.body && req.body.osVersion) ? String(req.body.osVersion).trim() : '';
    const hintPlatform = (req.body && req.body.platform) ? String(req.body.platform).trim() : '';

    if (hintModel) { parsed.deviceModel = hintModel.slice(0, 120); }
    if (hintOSVer) { parsed.osVersion = hintOSVer.slice(0, 40); }
    if (hintPlatform && parsed.os === 'Other') { parsed.os = hintPlatform; }

    /* Beautify Samsung model codes received via Client Hints */
    if (/^SM-[A-Z0-9]+$/i.test(parsed.deviceModel)) {
      parsed.deviceModel = 'Samsung ' + parsed.deviceModel;
    }

    await pool.query(
      `INSERT INTO visitors
     (ip, user_agent, browser, os, os_version, device, device_model, referrer, page)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ip, ua, parsed.browser, parsed.os, parsed.osVersion,
        parsed.device, parsed.deviceModel, referrer, page]
    );

    /* Get updated total count to send back to the frontend */
    const countRes = await pool.query('SELECT COUNT(*) AS c FROM visitors');
    const total = parseInt(countRes.rows[0].c);

    /* Respond with the total — frontend animates it into the HUD */
    res.json({ ok: true, total });

    /* Email notification — once per IP per 8 hrs (after response sent) */
    const lastNotified = visitEmailLog.get(ip);
    const shouldEmail = !lastNotified || (Date.now() - lastNotified > VISIT_EMAIL_COOLDOWN_MS);

    if (shouldEmail) {
      visitEmailLog.set(ip, Date.now());
      const notifyTo = process.env.NOTIFY_EMAIL || process.env.EMAIL_USER;
      sendMail(
        notifyTo,
        `🌐 Visit #${total} — ${parsed.deviceModel} (${parsed.os} ${parsed.osVersion})`,
        `
        <div style="font-family:sans-serif;max-width:520px;background:#0d1117;color:#c9d4e8;padding:28px;border-radius:10px;border:1px solid rgba(0,200,255,0.2)">
          <h2 style="color:#00c8ff;margin-top:0">👁 Visit #${total} on Your Portfolio</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#5a6a84;width:110px">Total Visits</td><td style="color:#00c8ff;font-weight:bold">${total}</td></tr>
            <tr><td style="padding:8px 0;color:#5a6a84;width:120px">Device Model</td><td style="color:#00ffe7;font-weight:bold">${parsed.deviceModel}</td></tr>
            <tr><td style="padding:8px 0;color:#5a6a84">OS</td><td style="color:#fff">${parsed.os} ${parsed.osVersion}</td></tr>
            <tr><td style="padding:8px 0;color:#5a6a84">IP Address</td>  <td style="color:#fff">${ip}</td></tr>
            <tr><td style="padding:8px 0;color:#5a6a84">Browser</td>     <td style="color:#fff">${parsed.browser}</td></tr>
            

            <tr><td style="padding:8px 0;color:#5a6a84">Device</td>      <td style="color:#fff">${parsed.device}</td></tr>
            <tr><td style="padding:8px 0;color:#5a6a84">Referrer</td>    <td style="color:#fff">${referrer || 'Direct'}</td></tr>
            <tr><td style="padding:8px 0;color:#5a6a84">Page</td>        <td style="color:#fff">${page}</td></tr>
            <tr><td style="padding:8px 0;color:#5a6a84">Time (IST)</td>  <td style="color:#e2b96a">${getIST(new Date())}</td></tr>
          </table>
        </div>
        `
      );
    }
  } catch (err) {
    console.error('/api/visit error:', err.message);
    res.json({ ok: false, total: 0 });
  }
});

/* ═══════════════════════════════════════════════════════════
   API — POST /api/contact
   Saves contact form submission and emails you.
═══════════════════════════════════════════════════════════ */
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: 'Name, email and message are required.' });
    }
    if (name.length > 255 || email.length > 255 || message.length > 5000) {
      return res.status(400).json({ ok: false, error: 'Input too long.' });
    }

    const ip = realIP(req);

    await pool.query(
      `INSERT INTO contacts (name, email, subject, message, ip)
       VALUES ($1,$2,$3,$4,$5)`,
      [name, email, subject || '(no subject)', message, ip]
    );

    /* Email to you */
    const notifyTo = process.env.NOTIFY_EMAIL || process.env.EMAIL_USER;
    await sendMail(
      notifyTo,
      `📬 Portfolio Contact — ${name}`,
      `
      <div style="font-family:sans-serif;max-width:560px;background:#0d1117;color:#c9d4e8;padding:28px;border-radius:10px;border:1px solid rgba(232,56,56,0.3)">
        <h2 style="color:#ff4d4d;margin-top:0">New Message from Your Portfolio</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#5a6a84;width:100px">Name</td>    <td style="color:#fff">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#5a6a84">Email</td>   <td style="color:#00c8ff"><a href="mailto:${email}" style="color:#00c8ff">${email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#5a6a84">Subject</td> <td style="color:#fff">${subject || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#5a6a84">Time</td>    <td style="color:#e2b96a">${getIST(new Date())}</td></tr>
        </table>
        <div style="margin-top:20px;padding:18px;background:rgba(255,255,255,0.04);border-left:3px solid #ff4d4d;border-radius:4px">
          <p style="margin:0;white-space:pre-wrap;color:#c9d4e8">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
        <p style="margin-top:20px;color:#5a6a84;font-size:12px">Sent from IP: ${ip}</p>
      </div>
      `
    );

    /* Auto-reply to sender */
    await sendMail(
      email,
      `Thanks for reaching out, ${name}!`,
      `
      <div style="font-family:sans-serif;max-width:520px;background:#0d1117;color:#c9d4e8;padding:28px;border-radius:10px;border:1px solid rgba(0,200,255,0.2)">
        <h2 style="color:#00c8ff;margin-top:0">Hi ${name}, message received! 👋</h2>
        <p style="color:#8892a4">Thank you for reaching out through my portfolio. I've received your message and will get back to you as soon as possible — usually within 24–48 hours.</p>
        <div style="margin:20px 0;padding:16px;background:rgba(255,255,255,0.04);border-radius:6px;border:1px solid rgba(255,255,255,0.08)">
          <p style="margin:0;font-size:12px;color:#5a6a84">Your message:</p>
          <p style="margin:8px 0 0;white-space:pre-wrap;color:#c9d4e8;font-size:14px">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
        <p style="color:#8892a4">— Dhyey Patel</p>
        <p style="color:#5a6a84;font-size:11px;margin-top:20px">This is an automated reply. Do not reply to this email.</p>
      </div>
      `
    );

    res.json({ ok: true, message: 'Message sent successfully!' });
  } catch (err) {
    console.error('/api/contact error:', err.message);
    res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   API — GET /api/stats  (used by analytics dashboard)
   Protected by ANALYTICS_PASSWORD env variable.
═══════════════════════════════════════════════════════════ */
app.get('/api/stats', async (req, res) => {
  const pwd = process.env.ANALYTICS_PASSWORD || 'dhyey2025';
  if (req.query.password !== pwd) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const [total, today, browsers, devices, models, referrers, recent, contacts] = await Promise.all([
      pool.query('SELECT COUNT(*) AS c FROM visitors'),
      pool.query("SELECT COUNT(*) AS c FROM visitors WHERE visited_at >= NOW() - INTERVAL '24 hours'"),
      pool.query('SELECT browser, COUNT(*) AS cnt FROM visitors GROUP BY browser ORDER BY cnt DESC LIMIT 8'),
      pool.query('SELECT device, COUNT(*) AS cnt FROM visitors GROUP BY device ORDER BY cnt DESC'),
      pool.query("SELECT COALESCE(device_model,'Unknown') AS model, COUNT(*) AS cnt FROM visitors GROUP BY device_model ORDER BY cnt DESC LIMIT 12"),
      pool.query("SELECT COALESCE(NULLIF(referrer,''),'Direct') AS ref, COUNT(*) AS cnt FROM visitors GROUP BY ref ORDER BY cnt DESC LIMIT 10"),
      pool.query('SELECT ip, browser, os, os_version, device, device_model, referrer, page, visited_at FROM visitors ORDER BY visited_at DESC LIMIT 50'),
      pool.query('SELECT id, name, email, subject, message, submitted_at, is_read FROM contacts ORDER BY submitted_at DESC LIMIT 50')
    ]);
    res.json({
      totalVisits: parseInt(total.rows[0].c),
      todayVisits: parseInt(today.rows[0].c),
      browsers: browsers.rows,
      devices: devices.rows,
      models: models.rows,          /* ← new */
      referrers: referrers.rows,
      recentVisitors: recent.rows,
      contacts: contacts.rows
    });
  } catch (err) {
    console.error('/api/stats error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

/* ═══════════════════════════════════════════════════════════
   ANALYTICS DASHBOARD — GET /analytics
   A clean real-time dashboard served as HTML.
   Access: yoursite.com/analytics?password=yourpassword
═══════════════════════════════════════════════════════════ */
app.get('/analytics', (req, res) => {
  const pwd = process.env.ANALYTICS_PASSWORD || 'dhyey2025';
  if (req.query.password !== pwd) {
    return res.status(401).send(`
      <!DOCTYPE html><html><head><title>Analytics — Login</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#02040a;color:#c9d4e8;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh}
      form{background:rgba(255,255,255,0.03);border:1px solid rgba(0,200,255,0.2);padding:40px;border-radius:12px;text-align:center;width:320px}
      h2{color:#00c8ff;margin-bottom:24px;font-family:sans-serif}
      input{width:100%;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(0,200,255,0.2);border-radius:6px;color:#fff;font-size:14px;margin-bottom:16px}
      button{width:100%;padding:12px;background:#e83838;border:none;border-radius:6px;color:#fff;font-weight:bold;cursor:pointer;font-size:14px}
      button:hover{background:#ff4d4d}</style></head>
      <body><form method="get" action="/analytics">
        <h2>[DP] ANALYTICS</h2>
        <input type="password" name="password" placeholder="Enter password" autofocus/>
        <button type="submit">ACCESS DASHBOARD</button>
      </form></body></html>
    `);
  }

  res.send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>[DP] Analytics Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#02040a;color:#c9d4e8;font-family:'Segoe UI',sans-serif;font-size:14px}
#nav{background:rgba(2,4,10,.9);border-bottom:1px solid rgba(0,200,255,.15);padding:16px 32px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.logo{font-family:monospace;font-size:1rem;font-weight:bold;color:#00c8ff;letter-spacing:.1em}
#last-updated{font-size:.7rem;color:#5a6a84;font-family:monospace}
.page{padding:28px 32px;max-width:1400px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:32px}
.card{background:rgba(255,255,255,.03);border:1px solid rgba(0,200,255,.12);border-radius:10px;padding:20px}
.card-n{font-size:2.2rem;font-weight:700;color:#fff;line-height:1;font-family:monospace}
.card-n.red{color:#ff4d4d}.card-n.cyan{color:#00c8ff}.card-n.gold{color:#e2b96a}
.card-l{font-size:.65rem;color:#5a6a84;letter-spacing:.12em;text-transform:uppercase;margin-top:6px}
.section{margin-bottom:36px}
.section h3{font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;color:#00c8ff;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.section h3::before{content:'';width:24px;height:1px;background:#00c8ff}
table{width:100%;border-collapse:collapse}
th{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:#5a6a84;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-size:.82rem;vertical-align:top}
tr:hover td{background:rgba(0,200,255,.03)}
.badge{display:inline-block;padding:2px 10px;border-radius:3px;font-size:.62rem;font-family:monospace;letter-spacing:.05em}
.badge.mobile{background:rgba(0,200,255,.1);color:#00c8ff;border:1px solid rgba(0,200,255,.2)}
.badge.desktop{background:rgba(232,56,56,.1);color:#ff4d4d;border:1px solid rgba(232,56,56,.2)}
.badge.tablet{background:rgba(226,185,106,.1);color:#e2b96a;border:1px solid rgba(226,185,106,.2)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.bar-label{width:100px;font-size:.75rem;color:#8892a4;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}
.bar-track{flex:1;height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,#e83838,#00c8ff);border-radius:3px;transition:width .8s}
.bar-val{font-size:.7rem;color:#5a6a84;width:30px;text-align:right;font-family:monospace}
.unread{color:#ff4d4d;font-weight:600}
.msg-preview{color:#5a6a84;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.refresh-btn{background:rgba(0,200,255,.1);border:1px solid rgba(0,200,255,.25);color:#00c8ff;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:.7rem;font-family:monospace;letter-spacing:.08em}
.refresh-btn:hover{background:rgba(0,200,255,.2)}
@media(max-width:700px){.grid2{grid-template-columns:1fr}.page{padding:16px}}
</style></head>
<body>
<div id="nav">
  <div class="logo">[DP].DEV — ANALYTICS</div>
  <div style="display:flex;align-items:center;gap:12px">
    <span id="last-updated">Loading…</span>
    <button class="refresh-btn" onclick="loadStats()">↻ REFRESH</button>
  </div>
</div>
<div class="page" id="root"><p style="color:#5a6a84;padding:40px 0;text-align:center">Loading dashboard…</p></div>

<script>
var PWD = new URLSearchParams(window.location.search).get('password');

function fmt(ts){
  return new Date(ts).toLocaleString('en-IN',{
    timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'2-digit',
    hour:'2-digit',minute:'2-digit'
  });
}

function deviceBadge(d){
  var cls = (d||'desktop').toLowerCase();
  return '<span class="badge '+cls+'">'+(d||'Desktop')+'</span>';
}

function barChart(rows, key, valKey, max){
  return rows.map(function(r){
    var pct = max ? Math.round((r[valKey]/max)*100) : 0;
    return '<div class="bar-row"><div class="bar-label" title="'+r[key]+'">'+r[key]+'</div>'+
           '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div>'+
           '<div class="bar-val">'+r[valKey]+'</div></div>';
  }).join('');
}

function loadStats(){
  fetch('/api/stats?password='+encodeURIComponent(PWD))
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ document.getElementById('root').innerHTML='<p style="color:#ff4d4d;padding:40px">'+d.error+'</p>'; return; }
      render(d);
      document.getElementById('last-updated').textContent = 'Updated: '+new Date().toLocaleTimeString('en-IN');
    })
    .catch(function(e){ console.error(e); });
}

function render(d){
  var maxBr  = d.browsers[0]  ? d.browsers[0].cnt  : 1;
  var maxRef = d.referrers[0] ? d.referrers[0].cnt : 1;
  var unread = d.contacts.filter(function(c){ return !c.is_read; }).length;

  document.getElementById('root').innerHTML =
    /* KPI CARDS */
    '<div class="cards">'+
      '<div class="card"><div class="card-n cyan">'+d.totalVisits+'</div><div class="card-l">Total Visits</div></div>'+
      '<div class="card"><div class="card-n">'+d.todayVisits+'</div><div class="card-l">Last 24 Hours</div></div>'+
      '<div class="card"><div class="card-n gold">'+d.contacts.length+'</div><div class="card-l">Contact Messages</div></div>'+
      '<div class="card"><div class="card-n red">'+unread+'</div><div class="card-l">Unread Messages</div></div>'+
    '</div>'+

    /* CHARTS ROW */
    '<div class="grid2" style="margin-bottom:36px">'+
      '<div class="section"><h3>Top Browsers</h3>'+barChart(d.browsers,'browser','cnt',maxBr)+'</div>'+
      '<div class="section"><h3>Top Referrers</h3>'+barChart(d.referrers,'ref','cnt',maxRef)+'</div>'+
    '</div>'+

    /* RECENT VISITORS TABLE */
    '<div class="section"><h3>Recent Visitors (last 50)</h3>'+
    '<div style="overflow-x:auto"><table>'+
    '<thead><tr><th>#</th><th>Time (IST)</th><th>IP</th><th>Device Model</th><th>Browser</th><th>OS & Version</th><th>Type</th><th>Referrer</th><th>Page</th></tr></thead><tbody>'+
    d.recentVisitors.map(function(v,i){
      var osStr = v.os + (v.os_version ? ' ' + v.os_version : '');
      return '<tr>'+
        '<td style="color:#5a6a84">'+(i+1)+'</td>'+
        '<td style="white-space:nowrap;font-family:monospace;font-size:.72rem">'+fmt(v.visited_at)+'</td>'+
        '<td style="font-family:monospace;font-size:.72rem;color:#00c8ff">'+v.ip+'</td>'+
        '<td style="color:#00ffe7;font-weight:600">'+(v.device_model||'—')+'</td>'+
        '<td>'+v.browser+'</td>'+
        '<td style="color:#8892a4">'+osStr+'</td>'+
        '<td>'+deviceBadge(v.device)+'</td>'+
        '<td style="color:#5a6a84;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(v.referrer||'Direct')+'</td>'+
        '<td style="font-family:monospace;font-size:.72rem">'+v.page+'</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table></div></div>'+

    /* CONTACT MESSAGES */
    '<div class="section"><h3>Contact Messages</h3>'+
    (d.contacts.length === 0
      ? '<p style="color:#5a6a84;padding:20px 0">No messages yet.</p>'
      : '<div style="overflow-x:auto"><table>'+
        '<thead><tr><th>#</th><th>Time (IST)</th><th>Name</th><th>Email</th><th>Subject</th><th>Message</th></tr></thead><tbody>'+
        d.contacts.map(function(c,i){
          return '<tr>'+
            '<td style="color:#5a6a84">'+(i+1)+'</td>'+
            '<td style="white-space:nowrap;font-family:monospace;font-size:.72rem">'+fmt(c.submitted_at)+'</td>'+
            '<td class="'+(c.is_read?'':'unread')+'">'+c.name+'</td>'+
            '<td style="color:#00c8ff"><a href="mailto:'+c.email+'" style="color:#00c8ff">'+c.email+'</a></td>'+
            '<td>'+c.subject+'</td>'+
            '<td class="msg-preview">'+c.subject+'</td>'+
          '</tr>';
        }).join('')+
        '</tbody></table></div>')+
    '</div>';
}

loadStats();
setInterval(loadStats, 30000); /* auto-refresh every 30s */
</script>
</body></html>`);
});

/* ═══════════════════════════════════════════════════════════
   CATCH-ALL — serve index.html for SPA routing
═══════════════════════════════════════════════════════════ */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ═══════════════════════════════════════════════════════════
   START SERVER
═══════════════════════════════════════════════════════════ */
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀  Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌  DB init failed:', err.message);
    process.exit(1);
  });
