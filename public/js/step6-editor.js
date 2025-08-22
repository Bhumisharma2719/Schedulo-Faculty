/* global document, confirm, alert */

// ---------- Helpers ----------
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const qs  = (sel, root = document) => root.querySelector(sel);

const isBreakCell = (td) => td && td.classList.contains('timetable-break');
const isTTCell = (td) => td && td.classList.contains('timetable-cell');

const norm = (s) => (s || '').toString().trim().toLowerCase();

// Returns true if this cell visually represents a lab (spans 2 slots)
const isLabCell = (td) => isTTCell(td) && Number(td.dataset.colspan) === 2;

// Read a cell's meta
function getMeta(td) {
  if (!isTTCell(td)) return null;
  return {
    course: td.dataset.course,
    day: td.dataset.day,
    slotIndex: Number(td.dataset.slotIndex),
    colspan: Number(td.dataset.colspan || 1),
    subject: td.dataset.subject || '',
    teacher: td.dataset.teacher || '',
    room: td.dataset.room || '',
    isLab: td.dataset.isLab === '1' || Number(td.getAttribute('colspan') || td.dataset.colspan || 1) === 2
  };
}

// Render cell inner HTML from meta
function renderCellContent(meta) {
  const room = meta.room || '';
  const subject = meta.subject || '';
  const teacher = meta.teacher || '';
  return `
    <div><strong>${room}</strong></div>
    <div>${subject}</div>
    <div>${teacher}</div>
  `;
}

// Make td reflect meta (inner + dataset + colspan)
function applyMetaToCell(td, meta) {
  if (!td) return;
  td.innerHTML = renderCellContent(meta);
  td.dataset.course = meta.course;
  td.dataset.day = meta.day;
  td.dataset.slotIndex = meta.slotIndex;
  td.dataset.colspan = String(meta.colspan || 1);
  td.dataset.subject = meta.subject || '';
  td.dataset.teacher = meta.teacher || '';
  td.dataset.room = meta.room || '';
  td.dataset.isLab = meta.isLab ? '1' : '0';
  td.setAttribute('colspan', meta.colspan || 1);
  td.classList.add('timetable-cell');
  td.setAttribute('draggable', 'true');

  // --- Add lab styling ---
  td.classList.toggle('lab-cell', !!meta.isLab); // Add/remove lab-cell class

  // Center align content for lab
  if (meta.isLab) {
    td.style.background = '#4A90E2'; // Blue
    td.style.color = '#fff';
    td.style.textAlign = 'center';
    td.style.verticalAlign = 'middle';
  } else {
    td.style.background = '';
    td.style.color = '';
    td.style.textAlign = '';
    td.style.verticalAlign = '';
  }
}

// Create a brand new single slot cell with "Library"
function createLibraryCellFrom(refTd, slotIndex) {
  const td = document.createElement('td');
  td.className = 'timetable-cell';
  td.setAttribute('draggable', 'true');
  td.dataset.course = refTd.dataset.course;
  td.dataset.day = refTd.dataset.day;
  td.dataset.slotIndex = String(slotIndex);
  td.dataset.colspan = '1';
  td.dataset.subject = 'Library';
  td.dataset.teacher = '';
  td.dataset.room = '';
  td.dataset.isLab = '0';
  td.innerHTML = renderCellContent({
    room: 'Library',
    subject: 'Library',
    teacher: '',
  });
  return td;
}


// After any structure change, reattach DnD + click handlers
function rebindAll() {
  qsa('.timetable-cell').forEach(bindCell);
}

// ---------- Drag & Drop core ----------
let dragSrc = null;

function onDragStart(e) {
  const td = e.currentTarget;
  if (!isTTCell(td)) return;
            // clear when starting a new drag
  dragSrc = td;
  td.classList.add('ghost-cell');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e) {
  const td = e.currentTarget;
  if (!isTTCell(td)) return;
  e.preventDefault();
  td.classList.add('drag-over');
}

function onDragLeave(e) {
  const td = e.currentTarget;
  if (!isTTCell(td)) return;
  td.classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  qsa('.drag-over').forEach(el => el.classList.remove('drag-over'));

  if (!dragSrc || dragSrc === target) {
    clearHighlights();
    return;
  }

  // Prevent drop onto break cells (they're not draggable)
  if (!isTTCell(target)) {
    clearHighlights();
    return;
  }

  // --- NEW: Check for orange highlight (clash) ---
  if (target.classList.contains('highlight-orange')) {
    // Find clash reason and location
    const srcMeta = getMeta(dragSrc);
    const tgtMeta = getMeta(target);
    let clashWithCourse = '';
    let clashMsg = `Clash detected for Course: ${srcMeta.course || 'Unknown'}${clashWithCourse ? ' with ' + clashWithCourse : ''}\n`;

    // Find which clash
    const allTables = qsa('table.timetable-table');
    const otherTables = allTables.filter(t => t !== target.closest('table.timetable-table'));
    let reasons = [];
    otherTables.forEach(ot => {
      const row = findRowForDay(ot, tgtMeta.day);
      if (!row) return;
      for (let i = 1; i < row.cells.length; i++) {
        const oc = row.cells[i];
        if (isBreakCell(oc) || !isTTCell(oc)) continue;
        if (!cellCoversSlot(oc, tgtMeta.slotIndex)) continue;
        const om = getMeta(oc);
        if (srcMeta.teacher && norm(om.teacher) === norm(srcMeta.teacher)) {
            reasons.push(`Teacher (${srcMeta.teacher})`);
            if (om.course && !clashWithCourse) clashWithCourse = om.course;
        }
        if (srcMeta.room && norm(om.room) === norm(srcMeta.room)) {
            reasons.push(`Room (${srcMeta.room})`);
            if (om.course && !clashWithCourse) clashWithCourse = om.course;
        }
        if (srcMeta.isLab && om.isLab) {
            reasons.push('Lab');
            if (om.course && !clashWithCourse) clashWithCourse = om.course;
        }
      }
    });

    if (reasons.length === 0) reasons.push('Unknown');

    clashMsg = `Clash detected for Course: ${srcMeta.course || 'Unknown'}${clashWithCourse ? ' with ' + clashWithCourse : ''}\n`;
    clashMsg += reasons.join(', ') + '\n';
    clashMsg += `Day: ${tgtMeta.day}, Slot: ${tgtMeta.slotIndex + 1}\n\nContinue anyway?`;

    if (!confirm(clashMsg)) {
      clearHighlights();
      return;
    }
    // If continue, proceed as normal
  }

  // ...existing onDrop code below...
  const srcMeta = getMeta(dragSrc);
  const tgtMeta = getMeta(target);

  // Disallow crossing the Break (we'll detect by slot adjacency on merge/split)
  const row = target.parentElement;
  const rowCells = Array.from(row.children);
  const breakIdx = rowCells.findIndex(td => isBreakCell(td));

  const getRightNeighbor = (td) => td.nextElementSibling;

  // ---------- CASES ----------

  // 1) LAB -> LAB
  if (srcMeta.isLab && tgtMeta.isLab) {
    const choice = confirm('Drop option:\nOK = Merge labs into one cell here and free source as 2 Library slots.\nCancel = Exchange the labs.');
    if (choice) {
      // MERGE: merge both in target; source becomes 2 Library singles
      const mergedMeta = {
        ...tgtMeta,
        subject: `${tgtMeta.subject} / ${srcMeta.subject}`,
        room: `${tgtMeta.room} / ${srcMeta.room}`.replace(/^ \/ /, '').replace(/ \/ $/, ''),
        teacher: `${tgtMeta.teacher} / ${srcMeta.teacher}`.replace(/^ \/ /, '').replace(/ \/ $/, ''),
        isLab: true,
        colspan: 2
      };
      applyMetaToCell(target, mergedMeta);

      // Source lab -> split into 2 Library single cells
      splitLabIntoTwoLibraries(dragSrc);
      rebindAll();
      clearHighlights(); // <-- ADD THIS
      return;
    } else {
      // EXCHANGE labs (swap meta only)
      swapCells(dragSrc, target);
      rebindAll();
      clearHighlights(); // <-- ADD THIS
      return;
    }
  }

  // 2) LAB -> SINGLE (target is single)
  if (srcMeta.isLab && !tgtMeta.isLab) {
    // Ensure we can occupy two adjacent singles at target position (target + right)
    const right = getRightNeighbor(target);
    if (!right || !isTTCell(right)) {
      alert('Cannot place a 2-slot Lab here (needs two adjacent slots).');
      clearHighlights(); // <-- ADD THIS
      return;
    }

    // Do not allow over break
    if (!isTTCell(right) || isBreakCell(target) || isBreakCell(right)) {
      alert('Cannot place a 2-slot Lab here (needs two adjacent non-break slots).');
      clearHighlights(); // <-- ADD THIS
      return;
    }

    // Place lab at target by merging target + right into a single cell colspan=2
    mergeSinglesIntoLab(target, right, srcMeta);

    // Replace source lab with two Library singles
    splitLabIntoTwoLibraries(dragSrc);
    rebindAll();
    clearHighlights(); // <-- ADD THIS
    return;
  }

  // 3) SINGLE -> LAB (target is lab)
  if (!srcMeta.isLab && tgtMeta.isLab) {
    // Split target lab into two singles: left keeps target meta, right becomes Library
    const split = splitLabIntoTwoSingles(target);

    // Move single into left (target position), and source becomes Library
    const newLeft = split.left;

    // Put src single into left cell; left’s old data goes back to source
    const leftOld = getMeta(newLeft);
    applyMetaToCell(newLeft, {
      ...leftOld,
      subject: srcMeta.subject, teacher: srcMeta.teacher, room: srcMeta.room,
      colspan: 1, isLab: false
    });
    applyMetaToCell(dragSrc, {
      ...srcMeta,
      subject: leftOld.subject, teacher: leftOld.teacher, room: leftOld.room,
      colspan: 1, isLab: false
    });
    rebindAll();
    clearHighlights(); // <-- ADD THIS
    return;
  }

  // 4) SINGLE -> SINGLE (simple swap)
  if (!srcMeta.isLab && !tgtMeta.isLab) {
    swapCells(dragSrc, target);
    rebindAll();
    clearHighlights(); // <-- ADD THIS
    return;
  }
}

function onDragEnd(e) {
  const td = e.currentTarget;
  td.classList.remove('ghost-cell');
  clearHighlights();
}

// ---------- Structural operations ----------
function swapCells(a, b) {
  const am = getMeta(a);
  const bm = getMeta(b);

  // Swap inner & dataset & colspan (do not move nodes, to preserve table structure)
  applyMetaToCell(a, { ...bm, day: am.day, slotIndex: am.slotIndex, course: am.course });
  applyMetaToCell(b, { ...am, day: bm.day, slotIndex: bm.slotIndex, course: bm.course });
}

// Merge two single cells into one lab cell (colspan=2) at "left" position, remove "right"
function mergeSinglesIntoLab(left, right, labMeta) {
  // Save left and right cell's meta for swap
  const leftMeta = getMeta(left);
  const rightMeta = getMeta(right);

  // Make left a lab cell
  applyMetaToCell(left, {
    ...labMeta,
    day: left.dataset.day,
    slotIndex: Number(left.dataset.slotIndex),
    course: left.dataset.course,
    colspan: 2,
    isLab: true
  });

  // Remove right TD from DOM
  right.parentElement.removeChild(right);

  // --- Swap: Put left & right cell's data into source lab cell as singles ---
  if (dragSrc) {
    splitLabIntoTwoSinglesWithMeta(dragSrc, leftMeta, rightMeta);
  }
}

// Split a lab cell into two single cells side-by-side and return refs
function splitLabIntoTwoSingles(labTd) {
  const meta = getMeta(labTd);
  const tr = labTd.parentElement;

  // Create two new single cells
  const left = createLibraryCellFrom(labTd, meta.slotIndex);
  const right = createLibraryCellFrom(labTd, meta.slotIndex + 1);

  // Put lab’s original content into left, right stays Library
  applyMetaToCell(left, {
    ...meta,
    colspan: 1,
    isLab: false
  });

  // Replace labTd with left, and insert right after
  tr.insertBefore(left, labTd);
  tr.insertBefore(right, labTd.nextSibling);
  tr.removeChild(labTd);

  return { left, right };
}


function splitLabIntoTwoSinglesWithMeta(labTd, metaLeft, metaRight) {
  const tr = labTd.parentElement;
  const labMeta = getMeta(labTd);

  // Create two new single cells with target slots' meta
  const left = document.createElement('td');
  applyMetaToCell(left, {
    ...metaLeft,
    colspan: 1,
    isLab: false
  });

  const right = document.createElement('td');
  applyMetaToCell(right, {
    ...metaRight,
    colspan: 1,
    isLab: false
  });

  tr.insertBefore(left, labTd);
  tr.insertBefore(right, labTd.nextSibling);
  tr.removeChild(labTd);

  // --- Add this line to rebind events on new cells ---
  rebindAll();
}

// Split a lab cell into two Library singles and discard content
function splitLabIntoTwoLibraries(labTd) {
  const meta = getMeta(labTd);
  const tr = labTd.parentElement;

  const leftLib = createLibraryCellFrom(labTd, meta.slotIndex);
  const rightLib = createLibraryCellFrom(labTd, meta.slotIndex + 1);

  tr.insertBefore(leftLib, labTd);
  tr.insertBefore(rightLib, labTd.nextSibling);
  tr.removeChild(labTd);
}

// ---------- Conflict highlighting (Universal) ----------
function clearHighlights() {
  qsa('.highlight-red, .highlight-orange').forEach(el => {
    el.classList.remove('highlight-red', 'highlight-orange');
  });
}

// Utility: get <tr> for a given day
function findRowForDay(table, dayName) {
  const tbody = table.tBodies[0];
  if (!tbody) return null;
  return Array.from(tbody.rows).find(r => {
    const first = r.cells[0];
    return first && norm(first.textContent) === norm(dayName);
  }) || null;
}

// Utility: does a cell cover this slot?
function cellCoversSlot(td, slot) {
  if (!isTTCell(td)) return false;
  const m = getMeta(td);
  const start = m.slotIndex;
  const end = start + (m.colspan || 1) - 1;
  return slot >= start && slot <= end;
}

// Highlight logic
function onCellClick(e) {
  const td = e.currentTarget;
  const table = td.closest('table.timetable-table');
  if (!table) return;

  clearHighlights();

  const meta = getMeta(td);
  const teacher = norm(meta.teacher);
  const room = norm(meta.room);
  const isLab = meta.isLab;

  // All slots this cell covers
  const slotsCovered = [];
  const span = meta.colspan || 1;
  for (let s = 0; s < span; s++) slotsCovered.push(meta.slotIndex + s);

  const allTables = qsa('table.timetable-table');
  const otherTables = allTables.filter(t => t !== table);

  // --- RED highlight: matching teacher/room/lab in other tables ---
  // ...existing code...
        otherTables.forEach(ot => {
        const tbody = ot.tBodies[0];
        if (!tbody) return;
        Array.from(tbody.rows).forEach(row => {
            for (let i = 1; i < row.cells.length; i++) {
            const c = row.cells[i];
            if (isBreakCell(c) || !isTTCell(c)) continue;

            const cm = getMeta(c);
            const sameTeacher = teacher && norm(cm.teacher) === teacher;
            const sameRoom = room && norm(cm.room) === room;

            // Only highlight if teacher or room matches
            if (sameTeacher || sameRoom) {
                c.classList.add('highlight-red');
            }
            }
        });
        });

  // --- ORANGE highlight: in selected table, mark slots busy in other tables ---
  if (teacher || room || isLab) {
  table.querySelectorAll('.timetable-cell').forEach(c => {
    const cm = getMeta(c);
    const cSlots = [];
    const cSpan = cm.colspan || 1;
    for (let s = 0; s < cSpan; s++) cSlots.push(cm.slotIndex + s);

    const overlapsBusy = cSlots.some(slot => {
      // Check if this slot is occupied elsewhere with same teacher/room/lab
      return otherTables.some(ot => {
        const row = findRowForDay(ot, cm.day);
        if (!row) return false;
        for (let i = 1; i < row.cells.length; i++) {
          const oc = row.cells[i];
          if (isBreakCell(oc) || !isTTCell(oc)) continue;
          if (!cellCoversSlot(oc, slot)) continue;

          const om = getMeta(oc);
          return (teacher && norm(om.teacher) === teacher) ||
                 (room && norm(om.room) === room) ||
                 (isLab && om.isLab);
        }
        return false;
      });
    });

    if (overlapsBusy) c.classList.add('highlight-orange');
  });
}}

// ---------- Bind ----------
function bindCell(td) {
  td.addEventListener('dragstart', onDragStart);
  td.addEventListener('dragover', onDragOver);
  td.addEventListener('dragleave', onDragLeave);
  td.addEventListener('drop', onDrop);
  td.addEventListener('dragend', onDragEnd);
  td.addEventListener('click', onCellClick);
}

function init() {
  qsa('.timetable-cell').forEach(bindCell);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.timetable-cell')) clearHighlights();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  const updateForm = document.querySelector('form[action="/step6/update"]');
  if (updateForm) {
    updateForm.addEventListener('submit', () => {
      updateTimetableInputs();
    });
  }
});

function serializeTimetableFromDOM() {
    const timetable = {};
    let days = window.timetableDays || [];
    let slots = window.timetableSlots || [];
    const subjectTeachers = {};

    const tables = document.querySelectorAll('table.timetable-table');

    if (!days.length && tables.length) {
        const firstTable = tables[0];
        days = Array.from(firstTable.tBodies[0].rows).map(r => r.cells[0].textContent.trim());
    }
    if (!slots.length && tables.length) {
        const firstTable = tables[0];
        slots = Array.from(firstTable.tHead.rows[2].cells).slice(1).map(c => c.textContent.trim());
    }

    tables.forEach(table => {
        const course = table.dataset.course;
        timetable[course] = {};
        const tbody = table.tBodies[0];

        Array.from(tbody.rows).forEach(row => {
            const day = row.cells[0].textContent.trim();
            timetable[course][day] = [];
            for (let i = 1; i < row.cells.length; i++) {
                  const td = row.cells[i];

                    if (td.classList.contains('timetable-break')) {
                        timetable[course][day].push({ subject: 'Break' });
                        continue;
                    }

                    const slotData = {
                        subject: td.dataset.subject || td.textContent.trim() || '',
                        teacher: td.dataset.teacher || '',
                        room: td.dataset.room || '',
                        isLab: td.dataset.isLab === '1'
                    };

                    // yahan colspan handle karo (default 1)
                    const span = parseInt(td.getAttribute("colspan") || "1", 10);

                    for (let k = 0; k < span; k++) {
                        timetable[course][day].push(slotData);
                    }
                }

        });

        // Subject-Teacher summary extract
        const summaryTable = table.parentElement.querySelector('table + table');
        if (summaryTable) {
            const rows = summaryTable.tBodies[0].rows;
            subjectTeachers[course] = [];
            Array.from(rows).forEach(r => {
                const cells = r.cells;
                if (cells.length === 4) {
                    subjectTeachers[course].push({
                        subjectShort: cells[0].textContent.trim(),
                        subjectLong: cells[1].textContent.trim(),
                        teacherShort: cells[2].textContent.trim(),
                        teacherLong: cells[3].textContent.trim()
                    });
                }
            });
        }
    });

    return { timetable, days, slots, subjectTeachers };
}



function updateTimetableInputs() {
  const timetableObj = serializeTimetableFromDOM();
  const updateInput = document.getElementById('updateTimetableData');
  const saveInput = document.querySelector('form[action="/step6/save"] input[name="timetableData"]');
  if (updateInput) updateInput.value = JSON.stringify(timetableObj);
  if (saveInput) saveInput.value = JSON.stringify(timetableObj);
}

