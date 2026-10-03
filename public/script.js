
(function () {
    'use strict';

    /* ════════════════════════════════════════════════════════
       1. BACKGROUND PARTICLE FIELD
       Optimisations vs previous version:
         • Particle count: 60 → 30  (half the O(n²) cost)
         • Connection distance: 110 → 80  (fewer pairs checked)
         • Connections batched: one beginPath per frame, not per line
         • Resize throttled: only reacts after 200ms idle
    ════════════════════════════════════════════════════════ */
    (function initBgCanvas() {
        var cvs = document.getElementById('bg-canvas');
        if (!cvs) { return; }
        var ctx = cvs.getContext('2d');
        var W = 0, H = 0;
        var pts = [];
        var resizeTimer = 0;

        function resize() {
            W = cvs.width = window.innerWidth;
            H = cvs.height = window.innerHeight;
        }

        function Pt() {
            this.x = Math.random() * W;
            this.y = Math.random() * H;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = (Math.random() - 0.5) * 0.3;
            this.r = Math.random() * 1.2 + 0.4;
            this.a = Math.random() * 0.45 + 0.08;
        }

        function spawn(n) {
            for (var i = 0; i < n; i++) { pts.push(new Pt()); }
        }

        var CONN_DIST = 80;
        var CONN_DIST_SQ = CONN_DIST * CONN_DIST;

        function frame() {
            ctx.clearRect(0, 0, W, H);

            /* move + draw dots */
            for (var i = 0; i < pts.length; i++) {
                var p = pts[i];
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) { p.x = W; } else if (p.x > W) { p.x = 0; }
                if (p.y < 0) { p.y = H; } else if (p.y > H) { p.y = 0; }
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, 6.2832);
                ctx.fillStyle = 'rgba(0,200,255,' + p.a + ')';
                ctx.fill();
            }

            /* draw connections in one batch pass */
            ctx.beginPath();
            for (var i = 0; i < pts.length - 1; i++) {
                var p = pts[i];
                for (var j = i + 1; j < pts.length; j++) {
                    var q = pts[j];
                    var dx = p.x - q.x, dy = p.y - q.y;
                    if (dx * dx + dy * dy < CONN_DIST_SQ) {
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(q.x, q.y);
                    }
                }
            }
            ctx.strokeStyle = 'rgba(0,200,255,0.07)';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            requestAnimationFrame(frame);
        }

        resize();
        spawn(30);
        frame();

        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resize, 200);
        });
    }());

    /* ════════════════════════════════════════════════════════
       ──────────────────────────────────────────────────────
       OLD CURSOR — COMMENTED OUT
       To restore: uncomment this entire initOldCursor block,
       uncomment the two HTML elements (<div id="cur-dot"> and
       <div id="cur-ring">) in the HTML above, and uncomment
       the old cursor CSS block in the <style> section.
       ──────────────────────────────────────────────────────
  
       (function initOldCursor() {
         var dot  = document.getElementById('cur-dot');
         var ring = document.getElementById('cur-ring');
         if (!dot || !ring) { return; }
         var mx = 0, my = 0, rx = 0, ry = 0;
         document.addEventListener('mousemove', function (e) {
           mx = e.clientX; my = e.clientY;
           dot.style.left = mx + 'px';
           dot.style.top  = my + 'px';
         });
         (function animRing() {
           rx += (mx - rx) * 0.1;
           ry += (my - ry) * 0.1;
           ring.style.left = rx + 'px';
           ring.style.top  = ry + 'px';
           requestAnimationFrame(animRing);
         }());
         var targets = document.querySelectorAll(
           'a, button, .sk-card, .proj-card, .edu-card, .c-card, .attr-box'
         );
         targets.forEach(function (el) {
           el.addEventListener('mouseenter', function () {
             dot.classList.add('hovered');
             ring.classList.add('hovered');
           });
           el.addEventListener('mouseleave', function () {
             dot.classList.remove('hovered');
             ring.classList.remove('hovered');
           });
         });
       }());
  
       ──────────────────────────────────────────────────────
    ════════════════════════════════════════════════════════ */

    /* ════════════════════════════════════════════════════════
       2. NEW CURSOR — "ORBITAL NAVIGATOR"
       ──────────────────────────────────────────────────────
       Design: everything drawn on a dedicated full-viewport
       canvas overlaid on top. Zero DOM elements, zero CSS
       transitions. Pure canvas @60fps via RAF.
  
       Anatomy (5 layers, drawn back-to-front each frame):
         A) GHOST TRAIL  — 14 fading echo copies of the pointer
            position, each progressively smaller + more transparent.
            Creates a comet-tail drag effect.
  
         B) CORE CROSSHAIR — a precise ±  shape at the exact
            mouse tip. 4 short lines + a 2px centre dot. White.
            Does NOT lag behind.
  
         C) DUAL COUNTER-ARCS — two partial arcs (≈115° each)
            sharing the same radius (15px) but rotating in
            opposite directions at different speeds. Creates a
            hypnotic Yin-Yang / DNA-unzipping visual that has
            never been used as a cursor before.
  
         D) TWO ORBITAL DOTS — a cyan dot (radius 24, speed 0.045)
            and a red dot (radius 20, speed -0.032) orbiting the
            core like electrons. Their radii are slightly different
            so they never collide.
  
         E) HOVER RIPPLE — on entering an interactive element
            a single expanding ring bursts outward and fades.
            A "lock-on" effect: the arcs switch colour to red
            and the orbitals spiral outward to 34 / 28.
  
       Performance notes:
         • clearRect each frame (no cumulative compositing)
         • No shadow/blur (ctx.shadowBlur = 0 always)
         • Single RAF loop shared for all cursor layers
         • Mouse position read synchronously from mousemove
           into module-level vars (no lag, no interpolation
           for the core tip itself)
       ──────────────────────────────────────────────────────
    ════════════════════════════════════════════════════════ */
    (function initOrbitalCursor() {
        var cvs = document.getElementById('cur-cvs');
        if (!cvs) { return; }
        var ctx = cvs.getContext('2d');

        /* canvas covers full viewport */
        function resizeCursor() {
            cvs.width = window.innerWidth;
            cvs.height = window.innerHeight;
        }
        resizeCursor();
        window.addEventListener('resize', resizeCursor);

        /* ── mouse state ── */
        var mx = -200, my = -200;   /* start offscreen */
        var isHover = false;        /* over interactive el? */

        document.addEventListener('mousemove', function (e) {
            mx = e.clientX;
            my = e.clientY;
        });

        /* ── interactive targets for hover state ── */
        var iTargets = document.querySelectorAll(
            'a, button, .sk-card, .proj-card, .edu-card, .c-card, .attr-box, .spill, .tech-pill'
        );
        iTargets.forEach(function (el) {
            el.addEventListener('mouseenter', function () { isHover = true; });
            el.addEventListener('mouseleave', function () { isHover = false; });
        });

        /* ── ghost trail buffer ── */
        var TRAIL_LEN = 14;
        var trail = [];
        for (var t = 0; t < TRAIL_LEN; t++) {
            trail.push({ x: -200, y: -200 });
        }

        /* ── arc angle state ── */
        var arcA = 0;   /* arc 1 angle (CW) */
        var arcB = 0;   /* arc 2 angle (CCW) */

        /* ── orbital dot angles ── */
        var orbA = 0;   /* cyan orbital */
        var orbB = 2.1; /* red orbital (offset start) */

        /* ── ripple state ── */
        var ripples = [];   /* [{x,y,r,a}] — max 3 at once */
        var lastHover = false;

        /* ── smoothed hover scale ── */
        var hScale = 1.0;  /* lerp toward 1.4 on hover */

        /* ── colours ── */
        var C_CYAN = '#00c8ff';
        var C_RED = '#ff4d4d';
        var C_WHT = '#ffffff';

        /* ────────────────────────────────────────
           DRAW LOOP
        ──────────────────────────────────────── */
        function cursorFrame() {
            requestAnimationFrame(cursorFrame);

            var W = cvs.width, H = cvs.height;
            ctx.clearRect(0, 0, W, H);

            /* advance angles */
            arcA += 0.038;
            arcB -= 0.026;
            orbA += 0.045;
            orbB -= 0.032;

            /* smoothed hover scale */
            var targetScale = isHover ? 1.45 : 1.0;
            hScale += (targetScale - hScale) * 0.12;

            /* update trail — push new pos, pop oldest */
            trail.unshift({ x: mx, y: my });
            if (trail.length > TRAIL_LEN) { trail.pop(); }

            /* ── A) GHOST TRAIL ── */
            for (var i = trail.length - 1; i >= 1; i--) {
                var tr = trail[i];
                var progress = i / TRAIL_LEN;        /* 0 = fresh, 1 = oldest */
                var alpha = (1 - progress) * 0.35;
                var radius = (1 - progress) * 3.5 + 0.5;
                ctx.beginPath();
                ctx.arc(tr.x, tr.y, radius, 0, 6.2832);
                ctx.fillStyle = isHover
                    ? 'rgba(255,77,77,' + alpha + ')'
                    : 'rgba(0,200,255,' + alpha + ')';
                ctx.fill();
            }

            var s = hScale;  /* shorthand */

            /* ── B) CORE CROSSHAIR ── */
            var arm = 6 * s;
            var gap = 3 * s;
            ctx.strokeStyle = C_WHT;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            /* horizontal arms */
            ctx.moveTo(mx - arm - gap, my);
            ctx.lineTo(mx - gap, my);
            ctx.moveTo(mx + gap, my);
            ctx.lineTo(mx + arm + gap, my);
            /* vertical arms */
            ctx.moveTo(mx, my - arm - gap);
            ctx.lineTo(mx, my - gap);
            ctx.moveTo(mx, my + gap);
            ctx.lineTo(mx, my + arm + gap);
            ctx.stroke();
            /* centre dot */
            ctx.beginPath();
            ctx.arc(mx, my, 1.8, 0, 6.2832);
            ctx.fillStyle = C_WHT;
            ctx.fill();

            /* ── C) DUAL COUNTER-ARCS ── */
            var arcR = 15 * s;
            var arcSpan = 2.0;  /* ≈ 115° in radians */

            /* arc 1 — cyan (clockwise) */
            ctx.beginPath();
            ctx.arc(mx, my, arcR, arcA, arcA + arcSpan);
            ctx.strokeStyle = isHover ? C_RED : C_CYAN;
            ctx.lineWidth = 1.8 * s;
            ctx.lineCap = 'butt';
            ctx.stroke();

            /* arc 2 — white/red (counter-clockwise), offset by π */
            ctx.beginPath();
            ctx.arc(mx, my, arcR, arcB + Math.PI, arcB + Math.PI + arcSpan);
            ctx.strokeStyle = isHover ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1.2 * s;
            ctx.stroke();

            /* ── D) TWO ORBITAL DOTS ── */
            var rA = 24 * s;
            var rB = 19 * s;

            /* cyan orbital */
            var oAx = mx + Math.cos(orbA) * rA;
            var oAy = my + Math.sin(orbA) * rA;
            ctx.beginPath();
            ctx.arc(oAx, oAy, 2.4 * s, 0, 6.2832);
            ctx.fillStyle = isHover ? C_RED : C_CYAN;
            ctx.fill();
            /* tiny glow trail behind orbital A */
            ctx.beginPath();
            ctx.arc(
                mx + Math.cos(orbA - 0.25) * rA,
                my + Math.sin(orbA - 0.25) * rA,
                1.4 * s, 0, 6.2832
            );
            ctx.fillStyle = isHover ? 'rgba(255,77,77,0.35)' : 'rgba(0,200,255,0.35)';
            ctx.fill();

            /* red orbital */
            var oBx = mx + Math.cos(orbB) * rB;
            var oBy = my + Math.sin(orbB) * rB;
            ctx.beginPath();
            ctx.arc(oBx, oBy, 2.0 * s, 0, 6.2832);
            ctx.fillStyle = isHover ? 'rgba(255,255,255,0.8)' : C_RED;
            ctx.fill();

            /* ── E) HOVER RIPPLE ── */
            /* trigger new ripple on hover enter */
            if (isHover && !lastHover) {
                if (ripples.length < 3) {
                    ripples.push({ x: mx, y: my, r: 14, a: 0.7 });
                }
            }
            lastHover = isHover;

            /* update + draw active ripples */
            for (var ri = ripples.length - 1; ri >= 0; ri--) {
                var rp = ripples[ri];
                rp.r += 1.6;
                rp.a -= 0.028;
                if (rp.a <= 0) { ripples.splice(ri, 1); continue; }
                ctx.beginPath();
                ctx.arc(rp.x, rp.y, rp.r, 0, 6.2832);
                ctx.strokeStyle = 'rgba(232,56,56,' + rp.a + ')';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        cursorFrame();
    }());

    /* ════════════════════════════════════════════════════════
       3. LIVE CLOCK
    ════════════════════════════════════════════════════════ */
    (function initClock() {
        var el = document.getElementById('sys-time');
        if (!el) { return; }
        function tick() {
            var d = new Date();
            el.textContent =
                String(d.getHours()).padStart(2, '0') + ':' +
                String(d.getMinutes()).padStart(2, '0') + ':' +
                String(d.getSeconds()).padStart(2, '0');
        }
        tick();
        setInterval(tick, 1000);
    }());

    /* ════════════════════════════════════════════════════════
       4. PROJECT IMAGE REVEAL
       Shows <img> and hides placeholder only if src is non-empty
    ════════════════════════════════════════════════════════ */
    (function initImages() {
        var imgs = document.querySelectorAll('.proj-img-wrap img');
        imgs.forEach(function (img) {
            var src = img.getAttribute('src');
            if (src && src !== '') {
                img.classList.add('has-src');
                var ph = img.parentElement.querySelector('.img-placeholder');
                if (ph) { ph.style.display = 'none'; }
            }
        });
    }());

    /* ════════════════════════════════════════════════════════
       5. GSAP SCROLL ANIMATIONS
       Optimisations vs previous version:
         • Removed all filter:blur() from GSAP — most expensive
           animated CSS property (forces rasterisation every frame)
         • Use only transform + opacity (GPU-composited, zero repaint)
         • Reveal-r already set to initial state in CSS
         • Scroll event throttled via RAF flag
    ════════════════════════════════════════════════════════ */
    gsap.registerPlugin(ScrollTrigger);

    /* Hero entrance sequence */
    gsap.timeline({ delay: 0.2 })
        .from('#hero-sys', { duration: 0.5, opacity: 0, y: -14, ease: 'power2.out' })
        .from('#hero-name', { duration: 0.9, opacity: 0, y: 55, ease: 'power3.out' }, '-=0.15')
        .from('#hero-role', { duration: 0.7, opacity: 0, x: 40, ease: 'power3.out' }, '-=0.55')
        .from('#hero-bio', { duration: 0.7, opacity: 0, x: 40, ease: 'power3.out' }, '-=0.50')
        .from('#hero-btns', { duration: 0.6, opacity: 0, y: 20, ease: 'power3.out' }, '-=0.45')
        .from('#hero-hud', { duration: 0.9, opacity: 0, x: 80, ease: 'power3.out' }, '-=0.90');

    /* sec-rule width reveal */
    gsap.utils.toArray('.sec-rule').forEach(function (el) {
        gsap.to(el, {
            width: 60, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
        });
    });

    /* General scroll-reveal (from right, opacity only — no blur) */
    gsap.utils.toArray('.reveal-r').forEach(function (el, i) {
        gsap.to(el, {
            opacity: 1, x: 0,
            duration: 0.8,
            ease: 'power3.out',
            delay: (i % 3) * 0.09,
            scrollTrigger: { trigger: el, start: 'top 87%', toggleActions: 'play none none none' }
        });
    });

    /* Skill cards stagger */
    gsap.utils.toArray('.sk-card').forEach(function (card, i) {
        gsap.fromTo(card,
            { opacity: 0, x: 50 },
            {
                opacity: 1, x: 0,
                duration: 0.6, delay: i * 0.07, ease: 'power3.out',
                scrollTrigger: { trigger: card, start: 'top 90%', toggleActions: 'play none none none' }
            }
        );
    });

    /* Skill bars */
    gsap.utils.toArray('.sk-fill').forEach(function (bar) {
        var w = (parseFloat(bar.getAttribute('data-w')) || 80) / 100;
        gsap.to(bar, {
            scaleX: w, duration: 1.3, ease: 'power3.out',
            scrollTrigger: { trigger: bar, start: 'top 92%', toggleActions: 'play none none none' }
        });
    });

    /* Education cards */
    gsap.utils.toArray('.edu-card').forEach(function (card, i) {
        gsap.fromTo(card,
            { opacity: 0, y: 32, scale: 0.96 },
            {
                opacity: 1, y: 0, scale: 1,
                duration: 0.65, delay: i * 0.13, ease: 'power3.out',
                scrollTrigger: { trigger: card, start: 'top 90%', toggleActions: 'play none none none' }
            }
        );
    });

    /* ════════════════════════════════════════════════════════
       6. NAV ACTIVE STATE
       Throttled: only runs on next animation frame after scroll
    ════════════════════════════════════════════════════════ */
    (function initNavActive() {
        var sections = document.querySelectorAll('section[id]');
        var navLinks = document.querySelectorAll('.nav-links a');
        var ticking = false;

        function update() {
            var scrollY = window.pageYOffset;
            var current = '';
            for (var i = 0; i < sections.length; i++) {
                if (scrollY >= sections[i].offsetTop - 130) {
                    current = sections[i].id;
                }
            }
            for (var j = 0; j < navLinks.length; j++) {
                if (navLinks[j].getAttribute('href') === '#' + current) {
                    navLinks[j].classList.add('active');
                } else {
                    navLinks[j].classList.remove('active');
                }
            }
            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        }, { passive: true });
    }());

    /* ════════════════════════════════════════════════════════
       7. VISITOR TRACKING + LIVE VISIT COUNTER
       ─ Fires POST /api/visit on page load (non-blocking)
       ─ Fetches total visit count from /api/visit-count
         and animates it into the hero HUD stat cell
    ════════════════════════════════════════════════════════ */
    (function trackVisit() {
        var payload = {
            referrer: document.referrer || '',
            page: window.location.pathname || '/'
        };

        function sendVisit(data) {
            fetch('/api/visit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                keepalive: true
            })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (d) {
                    if (!d || !d.total) { return; }
                    var el = document.getElementById('live-visits');
                    if (!el) { return; }
                    var target = d.total;
                    var startTs = null;
                    function step(ts) {
                        if (!startTs) { startTs = ts; }
                        var pct = Math.min((ts - startTs) / 1200, 1);
                        var val = Math.floor(pct * pct * target);
                        el.textContent = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : String(val);
                        if (pct < 1) { requestAnimationFrame(step); }
                        else { el.textContent = target >= 1000 ? (target / 1000).toFixed(1) + 'k' : String(target); }
                    }
                    requestAnimationFrame(step);
                })
                .catch(function () { /* silent */ });
        }

        /* ── Try UA Client Hints first (Chrome 90+ — gives REAL model & OS version) ── */
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
            navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'platform'])
                .then(function (hints) {
                    if (hints.model) { payload.deviceModel = hints.model; }
                    if (hints.platformVersion) { payload.osVersion = hints.platformVersion; }
                    if (hints.platform) { payload.platform = hints.platform; }
                    sendVisit(payload);
                })
                .catch(function () {
                    sendVisit(payload); /* fallback — send without hints */
                });
        } else {
            sendVisit(payload); /* non-Chrome or older browser */
        }
    }());

    /* ════════════════════════════════════════════════════════
       8. CONTACT FORM HANDLER
    ════════════════════════════════════════════════════════ */
    (function initContactForm() {
        var btnSubmit = document.getElementById('cf-submit');
        var toast = document.getElementById('form-toast');
        if (!btnSubmit) { return; }

        function getVal(id) {
            var el = document.getElementById(id);
            return el ? el.value.trim() : '';
        }

        function setErr(id, on) {
            var el = document.getElementById(id);
            if (!el) { return; }
            if (on) { el.classList.add('err'); } else { el.classList.remove('err'); }
        }

        function showToast(type, msg) {
            toast.className = type;
            toast.textContent = msg;
            toast.style.display = 'block';
            if (type === 'success') {
                setTimeout(function () { toast.style.display = 'none'; }, 7000);
            }
        }

        function isValidEmail(v) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        }

        btnSubmit.addEventListener('click', function () {
            var name = getVal('cf-name');
            var email = getVal('cf-email');
            var subject = getVal('cf-subject');
            var message = getVal('cf-message');

            setErr('cf-name', false);
            setErr('cf-email', false);
            setErr('cf-message', false);
            toast.style.display = 'none';

            var valid = true;
            if (!name) { setErr('cf-name', true); valid = false; }
            if (!isValidEmail(email)) { setErr('cf-email', true); valid = false; }
            if (!message) { setErr('cf-message', true); valid = false; }
            if (!valid) {
                showToast('error', '⚠ Please fill in all required fields correctly.');
                return;
            }

            btnSubmit.disabled = true;
            btnSubmit.classList.add('loading');

            fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, email: email, subject: subject, message: message })
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    btnSubmit.disabled = false;
                    btnSubmit.classList.remove('loading');
                    if (data.ok) {
                        showToast('success', '✅ Message sent! I\'ll get back to you very soon.');
                        document.getElementById('cf-name').value = '';
                        document.getElementById('cf-email').value = '';
                        document.getElementById('cf-subject').value = '';
                        document.getElementById('cf-message').value = '';
                    } else {
                        showToast('error', '❌ ' + (data.error || 'Something went wrong. Please try again.'));
                    }
                })
                .catch(function () {
                    btnSubmit.disabled = false;
                    btnSubmit.classList.remove('loading');
                    showToast('error', '❌ Network error. Please check your connection and try again.');
                });
        });

        ['cf-name', 'cf-email', 'cf-message'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { el.addEventListener('input', function () { setErr(id, false); }); }
        });
    }());

}());
