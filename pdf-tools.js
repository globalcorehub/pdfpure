/* PDF operations run locally using the bundled pdf-lib 1.17.1 (MIT). */
(() => {
  'use strict';
  const messages = {
    en: ['Processing…', 'Download ready.', 'Select valid files and try again.', 'Enter valid page numbers or ranges within this PDF (for example: 1-3, 5).', 'Redaction is unavailable. This page does not remove or save sensitive content.'],
    zh: ['正在处理…', '文件已生成，可以下载。', '请选择有效文件后重试。', '请输入 PDF 范围内的有效页码，例如：1-3, 5。', '涂黑功能暂不可用。此页面不会删除或保存敏感内容。'],
    de: ['Verarbeitung…', 'Download bereit.', 'Gültige Dateien auswählen und erneut versuchen.', 'Gültige Seiten oder Bereiche dieser PDF eingeben (z. B. 1-3, 5).', 'Schwärzen ist nicht verfügbar. Diese Seite entfernt oder speichert keine vertraulichen Inhalte.'],
    es: ['Procesando…', 'Descarga lista.', 'Selecciona archivos válidos e inténtalo de nuevo.', 'Introduce páginas o rangos válidos de este PDF (p. ej.: 1-3, 5).', 'La censura no está disponible. Esta página no elimina ni guarda contenido confidencial.'],
    fr: ['Traitement…', 'Téléchargement prêt.', 'Sélectionnez des fichiers valides et réessayez.', 'Saisissez des pages ou plages valides de ce PDF (ex. : 1-3, 5).', 'Le masquage est indisponible. Cette page ne supprime ni ne sauvegarde les données sensibles.'],
    ja: ['処理中…', 'ダウンロードの準備ができました。', '有効なファイルを選択して再試行してください。', 'PDF 内の有効なページ番号または範囲を入力してください（例：1-3, 5）。', '墨消し機能は利用できません。このページは機密情報を削除・保存しません。'],
    pt: ['Processando…', 'Download pronto.', 'Selecione arquivos válidos e tente novamente.', 'Insira páginas ou intervalos válidos deste PDF (ex.: 1-3, 5).', 'A redação está indisponível. Esta página não remove nem salva conteúdo confidencial.']
  };
  const m = messages[document.documentElement.lang.split('-')[0]] || messages.en;
  const byId = id => document.getElementById(id);
  function statusFor(button) {
    const status = document.createElement('p');
    status.className = 'text-sm py-2';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    button.after(status);
    return status;
  }
  function download(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function action(button, operation, canRun = () => true) {
    const status = statusFor(button);
    let busy = false;
    button.addEventListener('click', async () => {
      if (busy || !canRun()) return;
      busy = true; button.disabled = true;
      button.setAttribute('aria-busy', 'true'); status.textContent = m[0];
      try {
        if (!window.PDFLib) throw new Error('library');
        await operation(); status.textContent = m[1];
      } catch (error) {
        status.textContent = error.message === 'range' ? m[3] : m[2];
      } finally {
        busy = false; button.disabled = !canRun(); button.removeAttribute('aria-busy');
      }
    });
  }
  function pageIndices(value, count) {
    const result = [], seen = new Set();
    for (const part of value.split(',')) {
      const match = /^\s*([1-9]\d*)(?:\s*-\s*([1-9]\d*))?\s*$/.exec(part);
      if (!match) throw new Error('range');
      const start = Number(match[1]), end = Number(match[2] || match[1]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end > count) throw new Error('range');
      for (let n = start; n <= end; n++) if (!seen.has(n)) { seen.add(n); result.push(n - 1); }
    }
    return result;
  }
  const split = byId('btn-split-action');
  if (split) {
    const input = byId('split-file-inp');
    const originalName = byId('split-file-name').textContent;
    input.addEventListener('change', () => {
      byId('split-file-name').textContent = input.files[0]?.name || originalName;
    });
    action(split, async () => {
      const file = input.files[0];
      if (!file) throw new Error('file');
      const source = await PDFLib.PDFDocument.load(await file.arrayBuffer());
      const indices = pageIndices(byId('split-range').value, source.getPageCount());
      const output = await PDFLib.PDFDocument.create();
      for (const page of await output.copyPages(source, indices)) output.addPage(page);
      download(await output.save(), 'extracted_pages.pdf');
    });
  }
  const merge = byId('btn-merge-action');
  if (merge) {
    let files = [];
    const input = byId('pdf-file-input'), zone = byId('pdf-dropzone'), list = byId('pdf-list');
    const countTemplate = byId('pdf-count-msg').textContent;
    function render() {
      list.replaceChildren();
      files.forEach((file, index) => {
        const row = document.createElement('div'), name = document.createElement('span'), remove = document.createElement('button');
        row.className = 'p-3 flex items-center justify-between gap-3';
        name.className = 'truncate text-sm'; name.textContent = `${index + 1}. ${file.name}`;
        remove.type = 'button'; remove.textContent = '✕'; remove.setAttribute('aria-label', `${file.name} ✕`);
        remove.addEventListener('click', () => { files.splice(index, 1); render(); });
        row.append(name, remove); list.append(row);
      });
      byId('pdf-count-msg').textContent = countTemplate.replace(/\{n\}|\d+/, files.length);
      merge.disabled = files.length < 2;
      merge.classList.toggle('opacity-50', merge.disabled);
      merge.classList.toggle('cursor-not-allowed', merge.disabled);
    }
    function add(items) { files.push(...Array.from(items).filter(f => /\.pdf$/i.test(f.name))); render(); }
    zone.addEventListener('click', event => { if (event.target !== input) input.click(); });
    zone.addEventListener('dragover', event => event.preventDefault());
    zone.addEventListener('drop', event => { event.preventDefault(); add(event.dataTransfer.files); });
    input.addEventListener('change', () => { add(input.files); input.value = ''; });
    byId('btn-clear-pdf').addEventListener('click', () => { files = []; input.value = ''; render(); });
    action(merge, async () => {
      const selected = [...files], output = await PDFLib.PDFDocument.create();
      for (const file of selected) {
        const source = await PDFLib.PDFDocument.load(await file.arrayBuffer());
        for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page);
      }
      download(await output.save(), 'merged_document.pdf');
    }, () => files.length >= 2);
    render();
  }
  const imagesButton = byId('btn-make-pdf');
  if (imagesButton) {
    let files = [], previewURLs = [];
    const input = byId('img2pdf-input'), zone = byId('img2pdf-dropzone'), grid = byId('img-preview-grid');
    function select(items) {
      previewURLs.forEach(URL.revokeObjectURL); previewURLs = [];
      files = Array.from(items).filter(file => /^image\/(png|jpeg|webp)$/.test(file.type));
      grid.replaceChildren();
      for (const file of files) {
        const item = document.createElement('div'), img = document.createElement('img'), label = document.createElement('span');
        const url = URL.createObjectURL(file); previewURLs.push(url);
        img.src = url; img.alt = file.name; img.className = 'w-full h-24 object-cover';
        label.textContent = file.name; item.append(img, label); grid.append(item);
      }
      imagesButton.disabled = !files.length;
      imagesButton.classList.toggle('opacity-50', !files.length);
      imagesButton.classList.toggle('cursor-not-allowed', !files.length);
    }
    input.addEventListener('change', () => select(input.files));
    zone?.addEventListener('dragover', event => event.preventDefault());
    zone?.addEventListener('drop', event => { event.preventDefault(); select(event.dataTransfer.files); });
    action(imagesButton, async () => {
      const selected = [...files], output = await PDFLib.PDFDocument.create();
      for (const file of selected) {
        let image;
        const bytes = await file.arrayBuffer();
        if (file.type === 'image/jpeg') image = await output.embedJpg(bytes);
        else if (file.type === 'image/png') image = await output.embedPng(bytes);
        else {
          const bitmap = await createImageBitmap(file);
          try {
            const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0);
            image = await output.embedPng(canvas.toDataURL('image/png'));
          } finally { bitmap.close(); }
        }
        const page = output.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      download(await output.save(), 'images_combined.pdf');
    }, () => files.length > 0);
  }
  const redact = byId('btn-burn-redact');
  if (redact) { redact.disabled = true; statusFor(redact).textContent = m[4]; }
  for (const id of ['btn-copy-pdf', 'btn-copy-img2pdf']) {
    const button = byId(id);
    button?.addEventListener('click', () => { navigator.clipboard?.writeText(location.href).catch(() => {}); });
  }
})();
