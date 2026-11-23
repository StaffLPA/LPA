(() => {
  // site menu on tablet and phone
  const menu = document.querySelector('.top__menu');
  const nav = document.getElementById('nav');
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    });
  }

  const frame = document.getElementById('frame');
  const rows = [...document.querySelectorAll('.row[data-target]')];
  if (!frame || !rows.length) return;
  const wide = window.matchMedia('(min-width: 861px)');
  const inner = document.createElement('div');
  inner.className = 'frame__inner';
  frame.appendChild(inner);
  const nameOf = row => row.querySelector('.row__name').textContent;

  function show(row, animate) {
    rows.forEach(r => r.setAttribute('aria-pressed', r === row ? 'true' : 'false'));
    const copy = document.getElementById(row.dataset.target).cloneNode(true);
    copy.removeAttribute('id');
    const next = rows[rows.indexOf(row) + 1];
    if (next) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'detail__next';
      btn.textContent = 'Next in the lineup: ' + nameOf(next) + ' →';
      btn.addEventListener('click', () => { show(next, true); next.focus({ preventScroll: true }); });
      copy.appendChild(btn);
    }
    inner.replaceChildren(copy);
    if (animate) {
      inner.classList.remove('is-in');
      void inner.offsetWidth;
      inner.classList.add('is-in');
    }
  }

  function setOpen(row, open) {
    row.setAttribute('aria-expanded', String(open));
    row.closest('.entry').classList.toggle('is-open', open);
  }

  rows.forEach(row => row.addEventListener('click', () => {
    if (wide.matches) { show(row, true); return; }
    // phone: each row is a disclosure for its own career
    const open = row.getAttribute('aria-expanded') !== 'true';
    rows.forEach(r => setOpen(r, false));
    setOpen(row, open);
  }));

  rows.forEach((row, i) => row.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) { next.focus(); if (wide.matches) show(next, true); }
  }));

  function sync() {
    if (wide.matches) {
      rows.forEach(r => {
        r.closest('.entry').classList.remove('is-open');
        r.removeAttribute('aria-expanded');
        r.setAttribute('aria-controls', 'frame');
      });
      show(rows.find(r => r.getAttribute('aria-pressed') === 'true') || rows[0], false);
    } else {
      rows.forEach(r => {
        r.removeAttribute('aria-pressed');
        r.setAttribute('aria-controls', r.dataset.target);
        setOpen(r, false);
      });
    }
  }
  wide.addEventListener('change', sync);
  sync();
})();
