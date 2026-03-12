<!-- ═══════════════════════════════════════════════════════
     NOVA CHATBOT — SECRET KEY TRIGGER
     Add this INSIDE your sendAI() function in portfolio
     BEFORE the normal AI response logic
     ═══════════════════════════════════════════════════════ -->

<!-- 1. Replace your sendAI() function with this version -->

async function sendAI() {
  const inp = document.getElementById('ai-in');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';

  // ── SECRET ADMIN TRIGGER ──────────────────────────────
  if (text === 'toxibh-shubh@6969') {
    try {
      const r = await fetch('/api/check-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: text })
      });
      const d = await r.json();
      if (d.valid) {
        // Show a decoy message — don't reveal what triggered this
        addMsg('Checking system status...', 'ai');
        setTimeout(() => {
          window.open('/admin', '_blank');
        }, 400);
        return;
      }
    } catch (e) {
      // Server not running — fallback open
      window.open('/admin', '_blank');
      return;
    }
  }
  // ── END SECRET TRIGGER ────────────────────────────────

  // Normal AI response below (your existing code)
  addMsg(text, 'u');
  showTyping();
  document.getElementById('ai-st').textContent = 'PROCESSING...';
  setTimeout(() => {
    rmTyping();
    const reply = getReply(text);
    addMsg(reply, 'ai');
    speak(reply);
    document.getElementById('ai-st').textContent = 'ONLINE · READY';
  }, 900 + Math.random() * 500);
  playClick();
}


<!-- ═══════════════════════════════════════════════════════
     CONTACT FORM — Use this sendContact() to save messages
     to Flask backend so they appear in admin panel
     ═══════════════════════════════════════════════════════ -->

async function sendContact() {
  const name  = document.getElementById('f-name').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const msg   = document.getElementById('f-msg').value.trim();
  const fb    = document.getElementById('f-feedback');

  if (!name || !email || !msg) {
    fb.className = 'f-msg err';
    fb.textContent = 'Please fill in all fields.';
    playError();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fb.className = 'f-msg err';
    fb.textContent = 'Please enter a valid email address.';
    playError();
    return;
  }

  try {
    const r = await fetch('/api/contact', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message: msg })
    });
    const d = await r.json();
    if (d.success) {
      fb.className = 'f-msg ok';
      fb.textContent = '✓ Message sent! I\'ll reply within 24 hours.';
      document.getElementById('f-name').value  = '';
      document.getElementById('f-email').value = '';
      document.getElementById('f-msg').value   = '';
      playSuccess();
    } else {
      fb.className = 'f-msg err';
      fb.textContent = 'Failed to send. Please try again.';
      playError();
    }
  } catch (e) {
    fb.className = 'f-msg err';
    fb.textContent = 'Could not reach server. Try again later.';
    playError();
  }
}
