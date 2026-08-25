// app.js — ReportAI Cover
// Frontend logic: form -> call backend -> render A4 cover on Canvas -> edit -> export PNG/PDF

(function () {
  'use strict';

  // -----------------------------------------------------------
  // Constants
  // -----------------------------------------------------------
  const STYLES = [
    { key: 'minimal', name: 'Minimal', desc: 'เรียบง่าย สะอาดตา', primary: '#111827', secondary: '#F3F4F6' },
    { key: 'academic', name: 'Academic', desc: 'ทางการ น่าเชื่อถือ', primary: '#1E3A8A', secondary: '#EFF6FF' },
    { key: 'science', name: 'Science', desc: 'วิทยาศาสตร์ โมเลกุล', primary: '#2563EB', secondary: '#E0F2FE' },
    { key: 'technology', name: 'Technology', desc: 'เทคโนโลยี กริดไลน์', primary: '#0EA5E9', secondary: '#0F172A' },
    { key: 'history', name: 'History', desc: 'คลาสสิก กรอบโบราณ', primary: '#78350F', secondary: '#FEF3C7' },
    { key: 'creative', name: 'Creative', desc: 'สร้างสรรค์ สีสันสด', primary: '#DB2777', secondary: '#FCE7F3' },
  ];

  const LOADING_MESSAGES = [
    'AI กำลังวิเคราะห์รายงาน...',
    'กำลังวิเคราะห์หัวข้อรายงาน...',
    'กำลังเลือกโทนสี...',
    'กำลังจัด Layout...',
  ];

  const FONT_MAP = {
    modern: "'Kanit', sans-serif",
    serif: "'Noto Serif Thai', serif",
    rounded: "'Prompt', sans-serif",
  };

  const CANVAS_W = 1240;
  const CANVAS_H = 1754;

  const TEXT_FIELD_LABELS = {
    title: 'ชื่อรายงาน',
    subject: 'วิชา',
    author: 'ชื่อผู้จัดทำ',
    grade: 'ชั้น',
    room: 'ห้อง',
    number: 'เลขที่',
    school: 'โรงเรียน',
    teacher: 'ครูผู้สอน',
    description: 'คำอธิบายรายงาน',
  };

  // -----------------------------------------------------------
  // State
  // -----------------------------------------------------------
  const state = {
    selectedStyle: null,
    reportData: null,   // { title, subject, author, classRoom, number, school, teacher }
    design: null,       // { theme, primaryColor, secondaryColor, accentColor, layout, titleSize, fontStyle, decoration, description }
    source: null,       // 'gemini' | 'fallback'
  };

  // -----------------------------------------------------------
  // DOM refs
  // -----------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);

  const el = {
    demoBanner: $('#demo-banner'),
    styleSelector: $('#style-selector'),
    form: $('#report-form'),
    submitBtn: $('#submit-btn'),
    loadingOverlay: $('#loading-overlay'),
    loadingMessage: $('#loading-message'),
    viewForm: $('#view-form'),
    viewEditor: $('#view-editor'),
    canvas: $('#cover-canvas'),
    successMessage: $('#success-message'),
    toastContainer: $('#toast-container'),

    eTitle: $('#e-title'),
    eSubject: $('#e-subject'),
    eAuthor: $('#e-author'),
    eClassroom: $('#e-classroom'),
    eSchool: $('#e-school'),
    eTeacher: $('#e-teacher'),
    ePrimary: $('#e-primary'),
    eSecondary: $('#e-secondary'),
    eAccent: $('#e-accent'),
    eLayout: $('#e-layout'),

    regenerateBtn: $('#regenerate-btn'),
    downloadPngBtn: $('#download-png-btn'),
    downloadPdfBtn: $('#download-pdf-btn'),
    backBtn: $('#back-btn'),
  };

  const ctx = el.canvas.getContext('2d');

  // -----------------------------------------------------------
  // Toast
  // -----------------------------------------------------------
  function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' toast-' + type : '');
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  }

  // -----------------------------------------------------------
  // Style selector rendering
  // -----------------------------------------------------------
  function renderStyleSelector() {
    el.styleSelector.innerHTML = '';
    STYLES.forEach((s, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'style-card';
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', 'false');
      card.dataset.style = s.key;
      card.innerHTML = `
        <div class="swatch" style="background: linear-gradient(135deg, ${s.primary}, ${s.secondary});"></div>
        <span class="style-name">${s.name}</span>
        <span class="style-desc">${s.desc}</span>
        <span class="check">✓</span>
      `;
      card.addEventListener('click', () => selectStyle(s.key));
      el.styleSelector.appendChild(card);
    });
  }

  function selectStyle(key) {
    state.selectedStyle = key;
    const cards = el.styleSelector.querySelectorAll('.style-card');
    cards.forEach((c) => {
      const isSelected = c.dataset.style === key;
      c.classList.toggle('selected', isSelected);
      c.setAttribute('aria-checked', String(isSelected));
    });
    clearFieldError('style');
  }

  // -----------------------------------------------------------
  // Validation
  // -----------------------------------------------------------
  function setFieldError(name, message) {
    const errorEl = document.querySelector(`[data-error-for="${name}"]`);
    if (errorEl) errorEl.textContent = message || '';
    const fieldWrap = errorEl ? errorEl.closest('.field') : null;
    if (fieldWrap) fieldWrap.classList.toggle('invalid', Boolean(message));
  }

  function clearFieldError(name) {
    setFieldError(name, '');
  }

  function validateForm(formValues) {
    let firstInvalid = null;
    let valid = true;

    Object.keys(TEXT_FIELD_LABELS).forEach((key) => {
      const value = (formValues[key] || '').trim();
      if (!value) {
        setFieldError(key, `กรุณากรอก${TEXT_FIELD_LABELS[key]}`);
        valid = false;
        if (!firstInvalid) firstInvalid = key;
      } else {
        clearFieldError(key);
      }
    });

    if (!state.selectedStyle) {
      setFieldError('style', 'กรุณาเลือกสไตล์ปกอย่างน้อย 1 แบบ');
      valid = false;
      if (!firstInvalid) firstInvalid = 'style';
    } else {
      clearFieldError('style');
    }

    return { valid, firstInvalid };
  }

  function readFormValues() {
    const fd = new FormData(el.form);
    return {
      title: fd.get('title') || '',
      subject: fd.get('subject') || '',
      author: fd.get('author') || '',
      grade: fd.get('grade') || '',
      room: fd.get('room') || '',
      number: fd.get('number') || '',
      school: fd.get('school') || '',
      teacher: fd.get('teacher') || '',
      description: fd.get('description') || '',
    };
  }

  // -----------------------------------------------------------
  // Loading overlay
  // -----------------------------------------------------------
  let loadingInterval = null;

  function showLoading() {
    let i = 0;
    el.loadingMessage.textContent = LOADING_MESSAGES[0];
    el.loadingOverlay.classList.remove('hidden');
    loadingInterval = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      el.loadingMessage.textContent = LOADING_MESSAGES[i];
    }, 1100);
  }

  function hideLoading() {
    if (loadingInterval) clearInterval(loadingInterval);
    loadingInterval = null;
    el.loadingOverlay.classList.add('hidden');
  }

  // -----------------------------------------------------------
  // API calls
  // -----------------------------------------------------------
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.geminiConfigured === false) {
        el.demoBanner.classList.remove('hidden');
      }
    } catch (err) {
      // เงียบไว้ — ไม่ใช่ error ร้ายแรง แค่ตรวจสถานะเบื้องต้น
    }
  }

  async function requestDesign(payload) {
    if (!navigator.onLine) {
      throw new Error('ไม่พบการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบเครือข่ายของคุณ');
    }

    const res = await fetch('/api/design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error('เซิร์ฟเวอร์ตอบกลับข้อมูลผิดรูปแบบ กรุณาลองใหม่อีกครั้ง');
    }

    if (!res.ok || !data.success) {
      throw new Error((data && data.error) || 'ไม่สามารถสร้างดีไซน์ได้ กรุณาลองใหม่อีกครั้ง');
    }

    return data;
  }

  // -----------------------------------------------------------
  // Form submit
  // -----------------------------------------------------------
  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = readFormValues();
    const { valid, firstInvalid } = validateForm(values);

    if (!valid) {
      const target = firstInvalid === 'style'
        ? el.styleSelector
        : document.getElementById('f-' + firstInvalid);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
      return;
    }

    const classRoom = `${values.grade.trim()}/${values.room.trim()}`;
    const reportData = {
      title: values.title.trim(),
      subject: values.subject.trim(),
      author: values.author.trim(),
      classRoom,
      number: values.number.trim(),
      school: values.school.trim(),
      teacher: values.teacher.trim(),
      description: values.description.trim(),
    };

    const payload = { ...reportData, style: state.selectedStyle };

    el.submitBtn.disabled = true;
    showLoading();

    try {
      const result = await requestDesign(payload);
      state.reportData = reportData;
      state.design = normalizeDesign(result.design, state.selectedStyle);
      state.source = result.source;

      if (result.source === 'fallback' && result.message) {
        showToast(result.message, 'error');
      }

      openEditor();
    } catch (err) {
      showToast(err.message || 'ไม่สามารถเชื่อมต่อ AI ได้ กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      hideLoading();
      el.submitBtn.disabled = false;
    }
  });

  function normalizeDesign(design, styleKey) {
    const fallbackStyle = STYLES.find((s) => s.key === styleKey) || STYLES[0];
    return {
      theme: design.theme || styleKey,
      primaryColor: design.primaryColor || fallbackStyle.primary,
      secondaryColor: design.secondaryColor || fallbackStyle.secondary,
      accentColor: design.accentColor || '#0F172A',
      layout: ['top', 'center', 'bottom'].includes(design.layout) ? design.layout : 'center',
      titleSize: Number(design.titleSize) || 40,
      fontStyle: FONT_MAP[design.fontStyle] ? design.fontStyle : 'modern',
      decoration: design.decoration || styleKey,
      description: design.description || '',
    };
  }

  // -----------------------------------------------------------
  // Editor view open/close
  // -----------------------------------------------------------
  async function openEditor() {
    el.viewForm.classList.add('hidden');
    el.viewEditor.classList.remove('hidden');
    el.successMessage.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    syncEditorFieldsFromState();
    await redrawCanvas();

    el.successMessage.classList.remove('hidden');
  }

  el.backBtn.addEventListener('click', () => {
    el.viewEditor.classList.add('hidden');
    el.viewForm.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function syncEditorFieldsFromState() {
    el.eTitle.value = state.reportData.title;
    el.eSubject.value = state.reportData.subject;
    el.eAuthor.value = state.reportData.author;
    el.eClassroom.value = state.reportData.classRoom;
    el.eSchool.value = state.reportData.school;
    el.eTeacher.value = state.reportData.teacher;

    el.ePrimary.value = toHex(state.design.primaryColor);
    el.eSecondary.value = toHex(state.design.secondaryColor);
    el.eAccent.value = toHex(state.design.accentColor);
    el.eLayout.value = state.design.layout;
  }

  function toHex(color) {
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
    return '#2563eb';
  }

  // Live update: text fields
  [
    ['eTitle', 'title'], ['eSubject', 'subject'], ['eAuthor', 'author'],
    ['eClassroom', 'classRoom'], ['eSchool', 'school'], ['eTeacher', 'teacher'],
  ].forEach(([refKey, dataKey]) => {
    el[refKey].addEventListener('input', () => {
      state.reportData[dataKey] = el[refKey].value;
      redrawCanvas();
    });
  });

  // Live update: colors & layout
  el.ePrimary.addEventListener('input', () => { state.design.primaryColor = el.ePrimary.value; redrawCanvas(); });
  el.eSecondary.addEventListener('input', () => { state.design.secondaryColor = el.eSecondary.value; redrawCanvas(); });
  el.eAccent.addEventListener('input', () => { state.design.accentColor = el.eAccent.value; redrawCanvas(); });
  el.eLayout.addEventListener('change', () => { state.design.layout = el.eLayout.value; redrawCanvas(); });

  // -----------------------------------------------------------
  // Regenerate (client-side, no API call — saves quota)
  // -----------------------------------------------------------
  const DECORATIONS_BY_STYLE = {
    minimal: ['minimal', 'minimal-line'],
    academic: ['academic', 'classic-frame'],
    science: ['molecule', 'orbit'],
    technology: ['grid', 'circuit'],
    history: ['classic-frame', 'ornament'],
    creative: ['abstract', 'blob'],
  };
  const LAYOUTS = ['top', 'center', 'bottom'];

  el.regenerateBtn.addEventListener('click', () => {
    const pool = DECORATIONS_BY_STYLE[state.selectedStyle] || ['minimal'];
    const currentIdx = pool.indexOf(state.design.decoration);
    let nextDecoration = pool[(currentIdx + 1) % pool.length];
    if (pool.length > 1 && nextDecoration === state.design.decoration) {
      nextDecoration = pool[(currentIdx + 1) % pool.length];
    }
    let nextLayout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
    if (nextLayout === state.design.layout && LAYOUTS.length > 1) {
      nextLayout = LAYOUTS[(LAYOUTS.indexOf(nextLayout) + 1) % LAYOUTS.length];
    }
    state.design.decoration = nextDecoration;
    state.design.layout = nextLayout;
    el.eLayout.value = nextLayout;
    redrawCanvas();
    showToast('สร้างดีไซน์ใหม่แล้ว', 'success');
  });

  // -----------------------------------------------------------
  // Canvas rendering engine
  // -----------------------------------------------------------
  async function redrawCanvas() {
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      drawCover(ctx, state.reportData, state.design);
    } catch (err) {
      console.error('Canvas draw error:', err);
      showToast('เกิดข้อผิดพลาดในการวาดปก กรุณาลองใหม่อีกครั้ง', 'error');
    }
  }

  function drawCover(c, data, design) {
    const W = CANVAS_W, H = CANVAS_H;
    c.clearRect(0, 0, W, H);

    // พื้นหลัง
    c.fillStyle = design.secondaryColor;
    c.fillRect(0, 0, W, H);

    // ลวดลายตกแต่งตามธีม
    drawDecoration(c, design, W, H);

    // กรอบขอบบาง ๆ
    c.strokeStyle = hexWithAlpha(design.accentColor, 0.25);
    c.lineWidth = 3;
    c.strokeRect(24, 24, W - 48, H - 48);

    // ข้อความ
    const fontFamily = FONT_MAP[design.fontStyle] || FONT_MAP.modern;
    drawTextBlock(c, data, design, fontFamily, W, H);
  }

  function hexWithAlpha(hex, alpha) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return `rgba(15,23,42,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawDecoration(c, design, W, H) {
    const type = design.decoration || '';
    c.save();
    if (type.includes('molecule') || type.includes('orbit')) {
      drawMolecule(c, design, W, H);
    } else if (type.includes('grid') || type.includes('circuit')) {
      drawGrid(c, design, W, H);
    } else if (type.includes('classic-frame') || type.includes('ornament') || type.includes('academic')) {
      drawClassicFrame(c, design, W, H);
    } else if (type.includes('abstract') || type.includes('blob')) {
      drawAbstract(c, design, W, H);
    } else {
      drawMinimalShapes(c, design, W, H);
    }
    c.restore();
  }

  function drawMolecule(c, design, W, H) {
    const dots = [
      [W * 0.18, H * 0.12], [W * 0.32, H * 0.18], [W * 0.15, H * 0.28],
      [W * 0.85, H * 0.82], [W * 0.72, H * 0.9], [W * 0.9, H * 0.7],
    ];
    c.strokeStyle = hexWithAlpha(design.primaryColor, 0.35);
    c.lineWidth = 3;
    for (let i = 0; i < dots.length - 1; i++) {
      if (i === 2) continue;
      c.beginPath();
      c.moveTo(dots[i][0], dots[i][1]);
      c.lineTo(dots[i + 1][0], dots[i + 1][1]);
      c.stroke();
    }
    dots.forEach(([x, y], i) => {
      c.beginPath();
      c.arc(x, y, i % 2 === 0 ? 16 : 10, 0, Math.PI * 2);
      c.fillStyle = hexWithAlpha(design.primaryColor, 0.55);
      c.fill();
    });
  }

  function drawGrid(c, design, W, H) {
    c.strokeStyle = hexWithAlpha(design.primaryColor, 0.18);
    c.lineWidth = 1.5;
    const step = 62;
    for (let x = 0; x <= W; x += step) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H * 0.4); c.stroke();
    }
    for (let y = 0; y <= H * 0.4; y += step) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    c.fillStyle = hexWithAlpha(design.accentColor, 0.5);
    c.beginPath();
    c.moveTo(W, H); c.lineTo(W - 220, H); c.lineTo(W, H - 220); c.closePath();
    c.fill();
  }

  function drawClassicFrame(c, design, W, H) {
    c.strokeStyle = hexWithAlpha(design.primaryColor, 0.6);
    c.lineWidth = 6;
    c.strokeRect(60, 60, W - 120, H - 120);
    c.lineWidth = 2;
    c.strokeRect(78, 78, W - 156, H - 156);
    const corners = [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]];
    corners.forEach(([x, y]) => {
      c.beginPath();
      c.arc(x, y, 10, 0, Math.PI * 2);
      c.fillStyle = hexWithAlpha(design.primaryColor, 0.6);
      c.fill();
    });
  }

  function drawAbstract(c, design, W, H) {
    const grad = c.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, hexWithAlpha(design.primaryColor, 0.28));
    grad.addColorStop(1, hexWithAlpha(design.accentColor, 0.22));
    c.fillStyle = grad;
    c.beginPath();
    c.ellipse(W * 0.85, H * 0.12, 260, 200, Math.PI / 5, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(W * 0.1, H * 0.9, 220, 260, -Math.PI / 6, 0, Math.PI * 2);
    c.fill();
  }

  function drawMinimalShapes(c, design, W, H) {
    c.strokeStyle = hexWithAlpha(design.primaryColor, 0.4);
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(W * 0.5 - 90, H * 0.85);
    c.lineTo(W * 0.5 + 90, H * 0.85);
    c.stroke();
    c.beginPath();
    c.arc(W * 0.5, H * 0.08, 8, 0, Math.PI * 2);
    c.fillStyle = hexWithAlpha(design.primaryColor, 0.5);
    c.fill();
  }

  function wrapText(c, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [text];
    const lines = [];
    let line = '';
    if (words.length === 1 && c.measureText(text).width > maxWidth) {
      let current = '';
      for (const ch of text) {
        const test = current + ch;
        if (c.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = ch;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines;
    }
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (c.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawTextBlock(c, data, design, fontFamily, W, H) {
    const marginX = 130;
    const maxTextWidth = W - marginX * 2;
    const layout = design.layout;

    let cursorY;
    if (layout === 'top') cursorY = H * 0.16;
    else if (layout === 'bottom') cursorY = H * 0.58;
    else cursorY = H * 0.36; // center

    c.textAlign = 'center';
    const centerX = W / 2;

    c.fillStyle = hexWithAlpha(design.accentColor, 0.9);
    c.font = `500 28px ${fontFamily}`;
    c.fillText(truncate(data.subject, 40), centerX, cursorY);
    cursorY += 56;

    const titleSize = Math.max(28, Math.min(64, design.titleSize));
    c.fillStyle = design.primaryColor;
    c.font = `700 ${titleSize}px ${fontFamily}`;
    const titleLines = wrapText(c, data.title, maxTextWidth).slice(0, 4);
    titleLines.forEach((line) => {
      c.fillText(line, centerX, cursorY);
      cursorY += titleSize * 1.28;
    });

    cursorY += 30;

    if (data.description) {
      c.fillStyle = hexWithAlpha('#334155', 0.9);
      c.font = `400 24px ${fontFamily}`;
      const descLines = wrapText(c, truncate(data.description, 140), maxTextWidth).slice(0, 3);
      descLines.forEach((line) => {
        c.fillText(line, centerX, cursorY);
        cursorY += 34;
      });
    }

    const infoY = H - 300;
    c.fillStyle = hexWithAlpha('#ffffff', 0.55);
    roundRect(c, marginX - 20, infoY - 40, maxTextWidth + 40, 250, 18);
    c.fill();

    c.fillStyle = design.accentColor;
    c.font = `600 30px ${fontFamily}`;
    c.fillText(truncate(data.author, 60), centerX, infoY + 10);

    c.font = `400 24px ${fontFamily}`;
    c.fillStyle = hexWithAlpha('#1e293b', 0.85);
    c.fillText(`ชั้น ${data.classRoom}  เลขที่ ${data.number}`, centerX, infoY + 54);
    c.fillText(truncate(data.school, 70), centerX, infoY + 96);
    c.fillText(`ครูผู้สอน: ${truncate(data.teacher, 50)}`, centerX, infoY + 138);
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // -----------------------------------------------------------
  // Download: PNG
  // -----------------------------------------------------------
  el.downloadPngBtn.addEventListener('click', () => {
    try {
      const dataUrl = el.canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sanitizeFilename(state.reportData.title)}-cover.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('ดาวน์โหลด PNG สำเร็จ', 'success');
    } catch (err) {
      console.error('PNG export error:', err);
      showToast('ไม่สามารถดาวน์โหลด PNG ได้ กรุณาลองใหม่อีกครั้ง', 'error');
    }
  });

  // -----------------------------------------------------------
  // Download: PDF (A4, 210mm x 297mm)
  // -----------------------------------------------------------
  el.downloadPdfBtn.addEventListener('click', () => {
    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('ไม่พบไลบรารี PDF กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'error');
        return;
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgData = el.canvas.toDataURL('image/jpeg', 0.95);
      doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      doc.save(`${sanitizeFilename(state.reportData.title)}-cover.pdf`);
      showToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง', 'error');
    }
  });

  function sanitizeFilename(name) {
    return (name || 'report').replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim().slice(0, 60) || 'report';
  }

  // -----------------------------------------------------------
  // Init
  // -----------------------------------------------------------
  renderStyleSelector();
  checkHealth();

  window.addEventListener('offline', () => {
    showToast('การเชื่อมต่ออินเทอร์เน็ตขาดหาย', 'error');
  });
})();
