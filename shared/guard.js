// "Avval ish, keyin o'yin": Claude tugagach (yoki ruxsat so'raganda) o'yin qisqa muhlatdan keyin qulflanadi
// va foydalanuvchi o'sha sessiyaga javob yozganda (sessiya yana ishlay boshlaganda) o'zi ochiladi.
// VS Code webview ham, terminal versiya ham shu mantiqdan foydalanadi.
(function () {
  // Joriy raundni tugatish uchun muhlat
  const GRACE_MS = 10 * 1000;
  // Shundan tez javob yozilsa, "tez javob" seriyasi davom etadi
  const FAST_MS = 30 * 1000;
  // Favqulodda qo'shimcha vaqt va uni olish oralig'i
  const SNOOZE_MS = 2 * 60 * 1000;
  const SNOOZE_EVERY_MS = 60 * 60 * 1000;
  // Shuncha kutgandan keyin panel sariq rangga o'tib, ko'proq e'tibor tortadi
  const URGENT_MS = 60 * 1000;

  function createGuard({ strict = true, lastSnoozeAt = 0, now = () => Date.now() } = {}) {
    const pending = new Map(); // sessiya id -> { id, title, since }
    let graceUntil = 0;
    let snoozeUntil = 0;
    let fastStreak = 0;

    function oldest() {
      let first = null;
      for (const p of pending.values()) if (!first || p.since < first.since) first = p;
      return first;
    }

    const guard = {
      strict,
      get lastSnoozeAt() {
        return lastSnoozeAt;
      },
      get fastStreak() {
        return fastStreak;
      },

      // Sessiya ishini tugatdi yoki ruxsat so'rayapti: foydalanuvchi javobi kerak
      finished(session) {
        if (!guard.strict || pending.has(session.id)) return;
        const t = now();
        // Allaqachon qulflangan bo'lsa, yangi muhlat berilmaydi
        if (guard.phase() === 'free') graceUntil = t + GRACE_MS;
        pending.set(session.id, { id: session.id, title: session.title, since: t });
      },

      // Claude holati yangilandi. Kutilayotgan sessiya yana ishlayotgan bo'lsa, demak javob yozildi.
      // Javob berilgan sessiyalar ro'yxatini qaytaradi: [{ title, ms, fast }]
      update(sessions) {
        const answered = [];
        const t = now();
        for (const [id, p] of pending) {
          const s = sessions.find((x) => x.id === id);
          if (s && s.status !== 'busy') continue;
          pending.delete(id);
          // Sessiya yopilgan yoki eskirgan bo'lsa, javob deb hisoblanmaydi
          if (!s) continue;
          const ms = t - p.since;
          const fast = ms <= FAST_MS;
          fastStreak = fast ? fastStreak + 1 : 0;
          answered.push({ title: p.title, ms, fast, streak: fastStreak });
        }
        if (!pending.size) {
          graceUntil = 0;
          snoozeUntil = 0;
        }
        return answered;
      },

      // free: o'ynash mumkin; grace: raundni tugatish muhlati; locked: qulf; snoozed: favqulodda qo'shimcha vaqt
      phase() {
        if (!pending.size) return 'free';
        const t = now();
        if (t < snoozeUntil) return 'snoozed';
        if (t < graceUntil) return 'grace';
        return 'locked';
      },

      oldest,
      graceLeft: () => Math.max(0, Math.ceil((graceUntil - now()) / 1000)),
      snoozeLeftMs: () => Math.max(0, snoozeUntil - now()),
      waitingMs: () => (pending.size ? now() - oldest().since : 0),
      urgent: () => guard.waitingMs() >= URGENT_MS,

      canSnooze: () => now() - lastSnoozeAt >= SNOOZE_EVERY_MS,
      nextSnoozeMs: () => Math.max(0, lastSnoozeAt + SNOOZE_EVERY_MS - now()),
      snooze() {
        if (!guard.canSnooze() || !pending.size) return false;
        lastSnoozeAt = now();
        snoozeUntil = lastSnoozeAt + SNOOZE_MS;
        // Qo'shimcha vaqt tugagach ham raundni tugatish uchun muhlat beriladi
        graceUntil = snoozeUntil + GRACE_MS;
        return true;
      },
    };
    return guard;
  }

  // 83 soniya -> "1:23"
  const clock = (ms) => {
    const sec = Math.floor(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  const api = { createGuard, clock };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.ZerikmaGuard = api;
})();
