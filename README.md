# [DP].DEV — Dhyey Patel Portfolio

A full-stack portfolio website with:
- ✅ Contact form → saves to PostgreSQL + emails you
- ✅ Visitor tracking → logs every visit with browser, OS, device, IP, referrer
- ✅ Email notifications → you get emailed on new visitors (rate-limited) and every contact submission
- ✅ Analytics dashboard → live dashboard at `/analytics?password=yourpassword`
- ✅ Auto-reply → visitors who fill the form get an auto-reply from you

---

## 📁 Project Structure

```
portfolio-app/
├── server.js          ← Express backend (API + static serving)
├── package.json
├── .env.example       ← Copy to .env and fill in your values
└── public/
    └── index.html     ← Your full portfolio (served statically)
```

---

## 🚀 DEPLOYMENT (Step by Step)

### Option A — Railway.app (Recommended — easiest)

1. **Push to GitHub**
   ```bash
   cd portfolio-app
   git init
   git add .
   git commit -m "Initial portfolio"
   # Create a new repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/portfolio-app.git
   git push -u origin main
   ```

2. **Create Railway project**
   - Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub Repo
   - Select your repo

3. **Add PostgreSQL**
   - In Railway dashboard → New → Database → PostgreSQL
   - The `DATABASE_URL` env variable is **automatically injected** ✅

4. **Add Environment Variables**
   - Railway → your service → Variables → Add:
   ```
   NODE_ENV=production
   EMAIL_USER=your-gmail@gmail.com
   EMAIL_PASS=your-16-char-app-password
   NOTIFY_EMAIL=ucxolives@gmail.com
   ANALYTICS_PASSWORD=dhyey@analytics2025
   ```

5. **Done!** Railway auto-detects `package.json` and deploys.

---

### Option B — Render.com

1. **Push to GitHub** (same as above)

2. **Create Web Service**
   - render.com → New → Web Service → Connect your GitHub repo
   - Build Command: `npm install`
   - Start Command: `node server.js`

3. **Create PostgreSQL Database**
   - render.com → New → PostgreSQL (free tier)
   - Copy the **External Database URL**

4. **Add Environment Variables**
   - Your Web Service → Environment → Add:
   ```
   DATABASE_URL=<paste the External Database URL from step 3>
   NODE_ENV=production
   EMAIL_USER=your-gmail@gmail.com
   EMAIL_PASS=your-16-char-app-password
   NOTIFY_EMAIL=ucxolives@gmail.com
   ANALYTICS_PASSWORD=dhyey@analytics2025
   PORT=10000
   ```

5. **Deploy!**

---

## 📧 Setting Up Gmail App Password

You need a Gmail **App Password** (not your real password):

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**
3. Search for **"App Passwords"** in the search bar
4. Create one → select **Mail** → **Other** → name it "Portfolio"
5. Copy the 16-character code (e.g., `abcd efgh ijkl mnop`)
6. Use it as `EMAIL_PASS` (paste without spaces: `abcdefghijklmnop`)

---

## 🔒 Analytics Dashboard

Once deployed, visit:
```
https://yoursite.com/analytics?password=dhyey@analytics2025
```

Shows:
- Total visits & today's visits
- Top browsers & referrers (bar charts)
- Recent 50 visitors with IP, browser, OS, device, time
- All contact form submissions

Dashboard auto-refreshes every 30 seconds.

---

## 🛠 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env
# Edit .env with your values

# 3. You need a local PostgreSQL, OR use a free cloud DB
# Free cloud options: neon.tech, supabase.com, elephantsql.com
# Paste the connection string as DATABASE_URL in .env

# 4. Start server
npm start
# → http://localhost:3000
```

---

## 🔗 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/visit` | None | Log a page visit (called automatically) |
| POST | `/api/contact` | None | Submit contact form |
| GET | `/api/stats?password=X` | Query param | Get analytics JSON |
| GET | `/analytics?password=X` | Query param | Analytics dashboard UI |

---

## 📌 Customising the Portfolio

### Add project images:
In `public/index.html`, find `<img src="" alt="..."/>` inside each `.proj-img-wrap` and set the `src`:
```html
<img src="./ekaiq-screenshot.png" alt="एकाAiQ Screenshot"/>
```
Place image files in the `public/` folder.

### Add GitHub links:
Find `class="proj-gh-link"` and replace `href="#"` with your repo URL.

### Update phone number:
Search for `+91` and add your full number.

---

## ⚡ Email Notification Behaviour

| Event | Email sent? |
|-------|-------------|
| Contact form submitted | Always — instantly |
| Auto-reply to sender | Always — instantly |
| New visitor (new IP) | Yes — first visit per IP per 8 hours |
| Returning visitor (same IP, <8hr) | No — suppressed to avoid spam |

---

## 🗄 Database Schema

```sql
-- Visitor tracking
CREATE TABLE visitors (
  id          SERIAL PRIMARY KEY,
  ip          VARCHAR(60),
  user_agent  TEXT,
  browser     VARCHAR(120),
  os          VARCHAR(120),
  device      VARCHAR(60),
  referrer    TEXT,
  page        VARCHAR(500),
  visited_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Contact form submissions
CREATE TABLE contacts (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255)  NOT NULL,
  email        VARCHAR(255)  NOT NULL,
  subject      VARCHAR(500),
  message      TEXT          NOT NULL,
  ip           VARCHAR(60),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  is_read      BOOLEAN DEFAULT FALSE
);
```

Tables are created automatically on first server start.
