// Claude holati panelining matni: qaysi ko'rinish (idle / busy / waiting / done), sarlavha va izoh.
// VS Code webview ham, terminal versiya ham bir xil matn ko'rsatadi.
(function () {
  const quote = (s) => `«${s.title}»`;

  // sessions: [{ title, status, tool }], finishedNotice: foydalanuvchi hali ko'rmagan tugagan sessiya,
  // wasActive: shu ochilishda Claude hech bo'lmasa bir marta ishlaganmi
  function claudeBanner(T, sessions, finishedNotice, wasActive) {
    const busy = sessions.filter((s) => s.status === 'busy');
    const waiting = sessions.find((s) => s.status === 'waiting');
    const multi = sessions.length > 1;

    if (waiting) {
      return { view: 'waiting', title: T.waiting(multi ? quote(waiting) : T.claude), sub: T.waitingSub };
    }
    if (finishedNotice) {
      const note = busy.length ? T.othersBusy(busy.length) : T.noOthersBusy;
      return { view: 'done', title: T.finished(quote(finishedNotice)), sub: T.finishedSub(note) };
    }
    if (busy.length) {
      return busy.length > 1
        ? { view: 'busy', title: T.busyMulti(busy.length), sub: T.busyMultiSub }
        : { view: 'busy', title: T.busy(busy[0].tool), sub: T.busySub(quote(busy[0])) };
    }
    if (wasActive) return { view: 'done', title: T.allDone, sub: T.allDoneSub };
    return { view: 'idle', title: T.idle, sub: T.idleSub };
  }

  const api = { claudeBanner, quote };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.ZerikmaBanner = api;
})();
