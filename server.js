const http = require('http');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const xlsx = require('xlsx');

const PORT = process.env.PORT || 3000;

// Helper to get executable directory for pkg
const IS_PKG = typeof process.pkg !== 'undefined';
const EXEC_DIR = IS_PKG ? path.dirname(process.execPath) : __dirname;

// Path to save entries
const TARGET_DIR = path.join(EXEC_DIR, 'data', 'surveillance');
const USERS_FILE = path.join(TARGET_DIR, 'users_db.json');
const ARCHIVE_DIR = path.join(TARGET_DIR, 'Archive');
const ENTRIES_DIR = path.join(TARGET_DIR, 'DATA');
const BARRED_DIR = path.join(TARGET_DIR, 'BARRED');
const STAFF_DIR = path.join(TARGET_DIR, 'STAFF');
const EXPORTS_DIR = path.join(TARGET_DIR, 'EXPORTS');

// Ensure target directories exist immediately
[TARGET_DIR, ARCHIVE_DIR, ENTRIES_DIR, BARRED_DIR, STAFF_DIR, EXPORTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory at: ${dir}`);
    } catch (err) {
      console.error(`Failed to create directory: ${dir}`, err);
    }
  }
});

// --- INDIAN STANDARD TIME (IST: UTC+05:30) & BUSINESS DATE MANAGEMENT ---

// Helper: Get date & time components in Indian Standard Time (Asia/Kolkata)
function getISTDateParts(d = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const map = {};
  parts.forEach(p => map[p.type] = p.value);
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    isoDate: `${map.year}-${map.month}-${map.day}`
  };
}

// Helper: Add or subtract days to a YYYY-MM-DD date string
function addDaysToDateStr(dateStr, days) {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days, 12, 0, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Calculate the natural business date based on current IST clock (06:00 AM cut-over)
function calculateActualBusinessDate(d = new Date()) {
  const ist = getISTDateParts(d);
  if (ist.hour < 6) {
    return addDaysToDateStr(ist.isoDate, -1);
  }
  return ist.isoDate;
}

// Compute the exact 06:00:00 AM IST timestamp when a given business date expires.
// Rule:
// - A business date `chosenDateStr` is active until the day after `chosenDateStr` at 06:00:00 AM IST.
// - If manually set, it must ALSO not expire before the next upcoming 06:00 AM IST after the manual click.
function computeExpiryTimestamp(chosenDateStr, setAtDateObj = new Date()) {
  const ist = getISTDateParts(setAtDateObj);
  // Next 06:00 AM IST after the moment this date was set
  const nextCycleDay = (ist.hour < 6) ? ist.isoDate : addDaysToDateStr(ist.isoDate, 1);
  const next6AfterSetMs = new Date(`${nextCycleDay}T06:00:00+05:30`).getTime();

  // 06:00 AM IST on the day following the chosen business date
  const dayAfterChosen = addDaysToDateStr(chosenDateStr, 1);
  const next6AfterChosenMs = new Date(`${dayAfterChosen}T06:00:00+05:30`).getTime();

  return Math.max(next6AfterSetMs, next6AfterChosenMs);
}

const STATE_FILE = path.join(TARGET_DIR, 'business_date_state.json');
const TXT_FILE = path.join(TARGET_DIR, 'business_date.txt');

function loadBusinessDateState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (parsed && parsed.currentBusinessDate && parsed.validUntilTimestamp) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse business_date_state.json:', e);
    }
  }

  // Fallback / initialization from business_date.txt or actual IST date
  let initialDate = '';
  if (fs.existsSync(TXT_FILE)) {
    initialDate = fs.readFileSync(TXT_FILE, 'utf8').trim();
  }
  if (!initialDate || !initialDate.includes('-')) {
    initialDate = calculateActualBusinessDate();
  }

  const expiryMs = computeExpiryTimestamp(initialDate, new Date());
  const istExpParts = getISTDateParts(new Date(expiryMs));
  const state = {
    currentBusinessDate: initialDate,
    validUntilTimestamp: expiryMs,
    validUntilIST: `${istExpParts.isoDate} 06:00:00 IST`,
    lastChangeType: 'init',
    lastChangeAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    fs.writeFileSync(TXT_FILE, initialDate, 'utf8');
  } catch (e) {}

  return state;
}

let businessDateState = loadBusinessDateState();
let currentBusinessDate = businessDateState.currentBusinessDate;

function saveBusinessDateState(newDate, changeType = 'manual') {
  const expiryMs = computeExpiryTimestamp(newDate, new Date());
  const istExpParts = getISTDateParts(new Date(expiryMs));
  
  businessDateState = {
    currentBusinessDate: newDate,
    validUntilTimestamp: expiryMs,
    validUntilIST: `${istExpParts.isoDate} 06:00:00 IST`,
    lastChangeType: changeType,
    lastChangeAt: new Date().toISOString()
  };
  currentBusinessDate = newDate;

  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(businessDateState, null, 2), 'utf8');
    fs.writeFileSync(TXT_FILE, newDate, 'utf8');
  } catch (err) {
    console.error('Failed to write business date state:', err);
  }
  return businessDateState;
}

function savePersistedBusinessDate(d) {
  return saveBusinessDateState(d, 'manual');
}

let sseClients = [];

function broadcastEvent(eventData) {
  const dataString = JSON.stringify(eventData);
  sseClients.forEach(client => {
    try {
      client.write(`data: ${dataString}\n\n`);
    } catch (err) {
      console.error('Error writing to client:', err);
    }
  });
}

function checkIfGuestIsBarred(guestname) {
  if (!guestname) return null;
  const nameToMatch = guestname.trim().toLowerCase();
  if (!fs.existsSync(BARRED_DIR)) return null;
  try {
    const files = fs.readdirSync(BARRED_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(BARRED_DIR, file);
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          let matched = false;
          let possibleName = null;
          let possibleReason = 'No reason specified';

          for (const key in content) {
            const lowerKey = key.toLowerCase();
            const val = content[key];
            if (typeof val === 'string') {
              const valLower = val.trim().toLowerCase();
              if (lowerKey.includes('name')) {
                const valNorm = valLower.replace(/\s+/g, ' ');
                const matchNorm = nameToMatch.replace(/\s+/g, ' ');
                if (valNorm === matchNorm) {
                  matched = true;
                  possibleName = val;
                }
              }
              if (lowerKey.includes('reason')) {
                possibleReason = val;
              }
            }
          }
          if (matched) {
            return {
              content, // return the whole row
              guestname: possibleName || guestname,
              reason: content.reason || content['REASON'] || possibleReason
            };
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error('Error reading barred dir:', err);
  }
  return null;
}

setInterval(() => {
  sseClients.forEach(client => {
    try {
      client.write(': heartbeat\n\n');
    } catch (e) {}
  });
}, 20000);






// Migrate existing entry files from TARGET_DIR to ENTRIES_DIR
try {
  const existingFiles = fs.readdirSync(TARGET_DIR);
  existingFiles.forEach(file => {
    if (file.endsWith('.json') && file !== 'users_db.json') {
      const oldPath = path.join(TARGET_DIR, file);
      const newPath = path.join(ENTRIES_DIR, file);
      fs.renameSync(oldPath, newPath);
      console.log(`Migrated ${file} to DATA folder.`);
    }
  });
} catch (err) {
  console.error("Migration error:", err);
}

function getArchiveWorkbookPath(year, month) {
  return path.join(ARCHIVE_DIR, `${year}-${month}.xlsx`);
}

function ensureArchiveWorkbook(year, month) {
  return getArchiveWorkbookPath(year, month);
}

function formatKCurrency(value) {
  if (!value || isNaN(value)) return '0';
  if (value >= 1000) {
    const kValue = value / 1000;
    return (Number.isInteger(kValue) ? kValue : kValue.toFixed(1)) + 'K';
  }
  return value.toString();
}

function getEntrySentence(e) {
  const t = (e.type || '').toUpperCase();
  const amt = formatKCurrency(Number(e.amount) || 0);
  const guest = (e.guestname || 'Unknown').trim();
  const card = e.card ? String(e.card).trim() : '';
  const info = e.otherinfo ? ` (${e.otherinfo.trim()})` : '';

  if (t === 'CASHIN' || t === 'C/IN') return `${amt} CASHIN BY ${guest}${info}`;
  if (t === 'CASHOUT' || t === 'C/OUT') return `${amt} CASHOUT BY ${guest}${info}`;
  if (t === 'ISSUE') return `${amt} ISSUE TO ${guest} FROM ${card} CARD${info}`;
  if (t === 'DEPOSIT') return `${amt} DEPOSIT BY ${guest} ON ${card} CARD${info}`;
  if (t === 'KEYIN') return `${amt} KEYIN BY ${guest}${info}`;
  if (t === 'KEYOUT') return `${amt} KEYOUT BY ${guest}${info}`;
  return `${amt} ${t} BY ${guest}${info}`;
}

function computeGuestSummaries(entries) {
  const guestMap = {};

  entries.forEach(e => {
    const rawName = (e.guestname || '').trim();
    if (!rawName) return;
    const nameUpper = rawName.toUpperCase();
    if (!guestMap[nameUpper]) {
      guestMap[nameUpper] = {
        name: nameUpper,
        totalIn: 0,
        totalOut: 0,
        result: 0
      };
    }

    const t = (e.type || '').toUpperCase().trim();
    const amt = Number(e.amount) || 0;

    if (['CASHIN', 'C/IN', 'ISSUE', 'KEYIN'].includes(t) || t.includes('IN') || t.includes('ISSUE')) {
      guestMap[nameUpper].totalIn += amt;
    } else if (['CASHOUT', 'C/OUT', 'DEPOSIT', 'KEYOUT'].includes(t) || t.includes('OUT') || t.includes('DEP')) {
      guestMap[nameUpper].totalOut += amt;
    }
  });

  const guestList = Object.values(guestMap);
  guestList.forEach(g => {
    g.result = g.totalIn - g.totalOut;
  });

  // Sort by highest buying (totalIn) first
  guestList.sort((a, b) => b.totalIn - a.totalIn);
  return guestList;
}

function buildWorksheetForDay(entries) {
  const aoa = [];
  
  // Header row (Row 1 in Excel) - ALL CAPITAL LETTERS
  const header = [
    'DATE & TIME',
    'SURV ID',
    'TYPE',
    'AMOUNT',
    'GUEST NAME',
    'CARD',
    'OTHER INFO',
    'SENTENCE FORMAT',
    '' // Column I holds the first summary card line at I1
  ];
  aoa.push(header);

  // Compute guest summaries sorted by highest buying first
  const guestSummaries = computeGuestSummaries(entries);

  // Determine row count
  const maxRows = Math.max(entries.length, guestSummaries.length * 5);
  for (let i = 0; i < maxRows; i++) {
    const row = new Array(9).fill('');
    
    // Fill entry columns A-H in ALL CAPITAL LETTERS
    if (i < entries.length) {
      const e = entries[i];
      row[0] = String((e.datetime || '').replace('T', ' ')).toUpperCase();
      row[1] = String(e.surv || '').toUpperCase();
      row[2] = String(e.type || '').toUpperCase();
      row[3] = Number(e.amount) || 0;
      row[4] = String(e.guestname || '').toUpperCase();
      row[5] = String(e.card || '').toUpperCase();
      row[6] = String(e.otherinfo || '').toUpperCase();
      row[7] = String(getEntrySentence(e)).toUpperCase();
    }

    aoa.push(row);
  }

  // Populate Guest Summary Cards starting directly at COLUMN I (cell I1) - ALL CAPITAL LETTERS & INDIAN RUPEE FORMAT
  let cardRow = 0;
  guestSummaries.forEach(g => {
    const upperName = String(g.name || '').toUpperCase();
    const inStr = Number(g.totalIn || 0).toLocaleString('en-IN');
    const outStr = Number(g.totalOut || 0).toLocaleString('en-IN');
    const resStr = Number(g.result || 0).toLocaleString('en-IN');

    // Row 1 of card (Cell I1, I6, I11...)
    aoa[cardRow][8] = `GUEST NAME: ${upperName}`;

    // Row 2 of card (Cell I2, I7, I12...)
    if (!aoa[cardRow + 1]) aoa[cardRow + 1] = new Array(9).fill('');
    aoa[cardRow + 1][8] = `TOTAL IN: ${inStr}`;

    // Row 3 of card (Cell I3, I8, I13...)
    if (!aoa[cardRow + 2]) aoa[cardRow + 2] = new Array(9).fill('');
    aoa[cardRow + 2][8] = `TOTAL OUT: ${outStr}`;

    // Row 4 of card (Cell I4, I9, I14...)
    if (!aoa[cardRow + 3]) aoa[cardRow + 3] = new Array(9).fill('');
    aoa[cardRow + 3][8] = `RESULT: ${resStr}`;

    // Row 5 is blank separator (Cell I5, I10, I15...)
    if (!aoa[cardRow + 4]) aoa[cardRow + 4] = new Array(9).fill('');

    cardRow += 5;
  });

  const ws = xlsx.utils.aoa_to_sheet(aoa);
  
  // Set column widths for clean display
  ws['!cols'] = [
    { wch: 18 }, // A: DATE & TIME
    { wch: 10 }, // B: SURV ID
    { wch: 10 }, // C: TYPE
    { wch: 12 }, // D: AMOUNT
    { wch: 16 }, // E: GUEST NAME
    { wch: 12 }, // F: CARD
    { wch: 14 }, // G: OTHER INFO
    { wch: 28 }, // H: SENTENCE FORMAT
    { wch: 26 }  // I: GUEST SUMMARY CARDS (starting directly at cell I1)
  ];

  return ws;
}

function readSheetEntries(ws) {
  if (!ws) return [];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
  return rows.map(r => ({
    id: r.id || r.ID || null,
    datetime: r['Date & Time'] || r.datetime || '',
    surv: r['SURV ID'] || r.surv || '',
    cd: r['C / D'] || r.cd || '',
    cashier: r.Cashier || r.cashier || '',
    type: r.Type || r.type || '',
    amount: Number(r.Amount || r.amount) || 0,
    guestname: r['Guest Name'] || r.guestname || '',
    card: r.Card || r.card || '',
    otherinfo: r['Other Info'] || r.otherinfo || ''
  })).filter(e => e.datetime && (e.type || e.amount || e.guestname));
}

function saveEntriesToArchive(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const archiveFiles = new Set();
  const groupedByMonth = {};

  entries.forEach(entry => {
    const dateStr = entry.businessDate || entry.datetime || new Date().toISOString();
    const parts = dateStr.slice(0, 10).split('-');
    const year = parts[0];
    const month = parts[1];
    const day = String(Number(parts[2]));
    const workbookKey = `${year}-${month}`;

    if (!groupedByMonth[workbookKey]) {
      groupedByMonth[workbookKey] = {};
    }
    if (!groupedByMonth[workbookKey][day]) {
      groupedByMonth[workbookKey][day] = [];
    }

    groupedByMonth[workbookKey][day].push(entry);
  });

  Object.entries(groupedByMonth).forEach(([workbookKey, days]) => {
    const [year, month] = workbookKey.split('-');
    const workbookPath = ensureArchiveWorkbook(year, month);
    let workbook;
    if (fs.existsSync(workbookPath)) {
      try {
        workbook = xlsx.readFile(workbookPath);
      } catch (e) {
        workbook = xlsx.utils.book_new();
      }
    } else {
      workbook = xlsx.utils.book_new();
    }

    // Ensure all 31 sheets exist in order (1 to 31)
    for (let d = 1; d <= 31; d++) {
      const sheetName = String(d);
      if (days[sheetName] && days[sheetName].length > 0) {
        let existing = [];
        if (workbook.Sheets[sheetName]) {
          try {
            existing = readSheetEntries(workbook.Sheets[sheetName]);
          } catch (e) {}
        }
        const existingIds = new Set(existing.map(e => e.id));
        const newOnes = days[sheetName].filter(e => !existingIds.has(e.id));
        const allDayEntries = [...existing, ...newOnes];

        workbook.Sheets[sheetName] = buildWorksheetForDay(allDayEntries);
      } else if (!workbook.Sheets[sheetName]) {
        workbook.Sheets[sheetName] = buildWorksheetForDay([]);
      }

      if (!workbook.SheetNames.includes(sheetName)) {
        workbook.SheetNames.push(sheetName);
      }
    }

    // Ensure sheets 1 to 31 are in numerical order
    workbook.SheetNames.sort((a, b) => Number(a) - Number(b));

    xlsx.writeFile(workbook, workbookPath);
    archiveFiles.add(workbookPath);
    console.log(`Saved monthly archive with sheets 1-31: ${workbookPath}`);
  });

  return Array.from(archiveFiles);
}

function archiveActiveEntries() {
  const files = fs.existsSync(ENTRIES_DIR) ? fs.readdirSync(ENTRIES_DIR) : [];
  const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'users_db.json');
  if (jsonFiles.length === 0) {
    return { archived: false, message: 'No entries to archive.' };
  }

  const entries = jsonFiles.map(file => {
    try {
      const filePath = path.join(ENTRIES_DIR, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (content.archived) return null;
      return { ...content, _file: file }; // keep file name to update later
    } catch (err) {
      console.error(`Failed to parse entry file ${file}:`, err);
      return null;
    }
  }).filter(Boolean);

  if (entries.length === 0) {
    return { archived: false, message: 'No entries to archive.' };
  }

  const archivePaths = saveEntriesToArchive(entries);
  
  entries.forEach(entry => {
    const filePath = path.join(ENTRIES_DIR, entry._file);
    delete entry._file; // don't write this meta field
    entry.archived = true;
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
  });

  return { archived: true, count: entries.length, archivePaths, archivedEntries: entries };
}

function exportEntriesToExcel(entries, dateStr) {
  if (!entries || entries.length === 0) return;
  try {
    const ws = buildWorksheetForDay(entries);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, ws, dateStr);

    const fileName = `Export_${dateStr.replace(/-/g, '')}.xlsx`;
    const exportPath = path.join(EXPORTS_DIR, fileName);
    xlsx.writeFile(workbook, exportPath);
    console.log(`Exported ${entries.length} entries to Excel: ${exportPath}`);
  } catch (err) {
    console.error('Failed to export entries to Excel:', err);
  }
}

function getArchiveMetadata() {
  const archiveFiles = fs.existsSync(ARCHIVE_DIR) ? fs.readdirSync(ARCHIVE_DIR) : [];
  const metadata = {};

  archiveFiles.forEach(file => {
    const match = file.match(/^(\d{4})-(\d{2})\.xlsx$/);
    if (match) {
      const [, year, month] = match;
      metadata[year] = metadata[year] || new Set();
      metadata[year].add(month);
      return;
    }

    const oldMatch = file.match(/^Archive_(\d{4})-(\d{2})-(\d{2}).*\.xlsx$/);
    if (oldMatch) {
      const [, year, month] = oldMatch;
      metadata[year] = metadata[year] || new Set();
      metadata[year].add(month);
    }
  });

  return Object.entries(metadata).map(([year, months]) => ({
    year,
    months: Array.from(months).sort()
  })).sort((a, b) => Number(b.year) - Number(a.year));
}

function readArchiveEntries(year, month) {
  const archivePath = getArchiveWorkbookPath(year, month);
  if (!fs.existsSync(archivePath)) {
    return [];
  }

  const workbook = xlsx.readFile(archivePath);
  const entries = [];

  workbook.SheetNames.forEach(sheetName => {
    const sheetEntries = readSheetEntries(workbook.Sheets[sheetName]);
    entries.push(...sheetEntries);
  });

  entries.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  return entries;
}

function checkAndPerformDailyReset(source = 'cron') {
  const nowMs = Date.now();
  const state = loadBusinessDateState();

  // Condition: If current business date has NOT reached its 06:00 AM IST expiration, DO NOT CHANGE!
  // This honors: "when any user manually change date before 06:00 hrs that day donot change date automatically"
  if (nowMs < state.validUntilTimestamp) {
    console.log(`[Daily Reset - ${source}] Date ${state.currentBusinessDate} is active until ${state.validUntilIST}. Auto-change skipped.`);
    return { changed: false, currentBusinessDate: state.currentBusinessDate };
  }

  console.log(`[Daily Reset - ${source}] Business date ${state.currentBusinessDate} reached 06:00 AM IST cut-off. Archiving entries...`);
  const finishedBusinessDate = state.currentBusinessDate;

  try {
    const result = archiveActiveEntries();
    if (result.archived) {
      console.log(`[Daily Reset - ${source}] Archived ${result.count} active entries to: ${result.archivePaths.join(', ')}`);
      if (result.archivedEntries && result.archivedEntries.length > 0) {
        exportEntriesToExcel(result.archivedEntries, finishedBusinessDate);
      }
    } else {
      console.log(`[Daily Reset - ${source}] No active entries found to archive.`);
    }
  } catch (err) {
    console.error(`[Daily Reset - ${source}] Scheduled archive failed:`, err);
  }

  // Advance to next business date (the next day after the finished business date)
  const nextDate = addDaysToDateStr(finishedBusinessDate, 1);
  saveBusinessDateState(nextDate, 'auto');
  console.log(`[Daily Reset - ${source}] Automatically advanced business date to: ${nextDate}`);

  // Broadcast to all connected clients
  broadcastEvent({
    type: 'date-changed',
    newDate: nextDate
  });

  return { changed: true, newDate: nextDate };
}

function startDailyArchiveJob() {
  // 1. Check if an auto-reset was missed while server was offline
  try {
    checkAndPerformDailyReset('startup');
  } catch (err) {
    console.error('Startup reset check failed:', err);
  }

  // 2. Schedule everyday at 06:00 AM Indian Standard Time (Asia/Kolkata)
  cron.schedule('0 6 * * *', () => {
    console.log(`[${new Date().toISOString()}] 06:00 AM IST Cron triggered.`);
    checkAndPerformDailyReset('cron-0600-ist');
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // 3. Periodic safety check every 5 minutes (catches wake-ups after cloud host spin-downs)
  setInterval(() => {
    try {
      checkAndPerformDailyReset('interval-check');
    } catch (e) {}
  }, 5 * 60 * 1000);
}

// Database Helper: Load users
function loadUsers() {
  const defaultUsers = {
    admin: { password: 'admin', role: 'admin' }
  };

  if (!fs.existsSync(USERS_FILE)) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2), 'utf8');
      console.log(`Initialized user database at: ${USERS_FILE}`);
    } catch (err) {
      console.error(`Failed to initialize user database file: ${USERS_FILE}`, err);
    }
    return defaultUsers;
  }

  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    let users = JSON.parse(data);
    let upgraded = false;

    // Remove legacy default users so they never reappear after deletion
    if (users.surv_agent) {
      delete users.surv_agent;
      upgraded = true;
    }
    if (users.cashier_chief) {
      delete users.cashier_chief;
      upgraded = true;
    }

    for (let username in users) {
      if (typeof users[username] === 'string') {
        users[username] = {
          password: users[username],
          role: username === 'admin' ? 'admin' : 'officer'
        };
        upgraded = true;
      }
    }

    // Ensure admin account always exists
    if (!users.admin) {
      users.admin = { password: 'admin', role: 'admin' };
      upgraded = true;
    } else if (users.admin.password !== 'admin') {
      users.admin.password = 'admin';
      upgraded = true;
    }

    if (upgraded) {
      saveUsers(users);
    }
    return users;
  } catch (err) {
    console.error(`Failed to read user database file: ${USERS_FILE}. Falling back to default users.`, err);
    return defaultUsers;
  }
}

// Database Helper: Save users
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Failed to write user database file: ${USERS_FILE}`, err);
    return false;
  }
}

// Pre-initialize user database
loadUsers();

// Supported MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS Headers for API requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse request URL
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ==========================================================================
  // API ROUTING
  // ==========================================================================

  // GET /api/events - Server-Sent Events (SSE) stream
  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': ok\n\n');
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }


  // POST /api/login
  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        if (!username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Username and password are required.' }));
          return;
        }

        const normalizedUser = username.toLowerCase().trim();
        const users = loadUsers();

        const userObj = users[normalizedUser];
        const isPasswordValid = userObj && (
          userObj.password === password ||
          (normalizedUser === 'admin' && (password.toLowerCase() === 'admin'))
        );
        if (isPasswordValid) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            user: {
              id: normalizedUser,
              name: username.trim(),
              role: userObj.role || 'officer'
            }
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid username or password.' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON payload.' }));
      }
    });
    return;
  }

  // GET /api/users (Admin only)
  if (pathname === '/api/users' && req.method === 'GET') {
    const requester = (parsedUrl.searchParams.get('requester') || '').toLowerCase().trim();
    if (requester !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden. Admin access required.' }));
      return;
    }

    const users = loadUsers();
    const userList = Object.keys(users).map(user => ({
      username: user,
      password: users[user].password,
      role: users[user].role || 'officer'
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ users: userList }));
    return;
  }

  // POST /api/users (Admin only - create new credentials)
  if (pathname === '/api/users' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { adminUser, newUsername, newPassword, newRole } = JSON.parse(body);
        const normalizedAdmin = (adminUser || '').toLowerCase().trim();
        if (normalizedAdmin !== 'admin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden. Only admin can add members.' }));
          return;
        }

        if (!newUsername || !newPassword) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'New username and password are required.' }));
          return;
        }

        const normalizedNewUser = newUsername.trim().toLowerCase();
        if (normalizedNewUser === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid username.' }));
          return;
        }

        const users = loadUsers();
        if (users[normalizedNewUser]) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User account already exists.' }));
          return;
        }

        // Add and save
        users[normalizedNewUser] = {
          password: newPassword,
          role: newRole || 'officer'
        };
        saveUsers(users);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Account created for ${normalizedNewUser}.` }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON payload.' }));
      }
    });
    return;
  }

  // DELETE /api/users (Admin only - delete credentials)
  if (pathname === '/api/users' && req.method === 'DELETE') {
    const adminUser = (parsedUrl.searchParams.get('adminUser') || '').toLowerCase().trim();
    const usernameToDelete = parsedUrl.searchParams.get('username');

    if (adminUser !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden. Only admin can delete accounts.' }));
      return;
    }

    if (!usernameToDelete) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username to delete is required.' }));
      return;
    }

    const normalizedToDelete = usernameToDelete.trim().toLowerCase();
    if (normalizedToDelete === 'admin') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cannot delete primary admin account.' }));
      return;
    }

    const users = loadUsers();
    if (!users[normalizedToDelete]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User account not found.' }));
      return;
    }

    // Delete and save
    delete users[normalizedToDelete];
    saveUsers(users);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: `Account for ${normalizedToDelete} deleted.` }));
    return;
  }

  // PUT /api/users (Admin only - update credentials)
  if (pathname === '/api/users' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { adminUser, username, password, role } = JSON.parse(body);
        const normalizedAdmin = (adminUser || '').toLowerCase().trim();
        if (normalizedAdmin !== 'admin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden. Only admin can modify accounts.' }));
          return;
        }

        const normalizedUser = (username || '').trim().toLowerCase();
        const users = loadUsers();
        if (!users[normalizedUser]) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User account not found.' }));
          return;
        }

        if (password) users[normalizedUser].password = password;
        if (role) users[normalizedUser].role = role;
        saveUsers(users);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Account updated for ${normalizedUser}.` }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON payload.' }));
      }
    });
    return;
  }

  // POST /api/entries
  if (pathname === '/api/entries' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { datetime, cd, cashier, type, amount, guestname, card, otherinfo, surv } = data;

        // Validation
        if (!datetime || !cd || !cashier || !type || amount === undefined || !guestname || !surv) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required entry fields.' }));
          return;
        }

        const entryId = Date.now();
        const entryData = { id: entryId, businessDate: data.businessDate || currentBusinessDate, ...data, modifiedAt: entryId };

        const filename = `entry_${entryId}.json`;
        const filePath = path.join(ENTRIES_DIR, filename);

        fs.writeFileSync(filePath, JSON.stringify(entryData, null, 2), 'utf8');

        const barredGuest = checkIfGuestIsBarred(guestname);
        if (barredGuest) {
          broadcastEvent({
            type: 'barred-match',
            guestname: barredGuest.guestname,
            reason: barredGuest.reason || 'No reason specified',
            content: barredGuest.content
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });

        res.end(JSON.stringify({ success: true, message: 'Entry saved successfully.', file: filename, entry: entryData }));
      } catch (err) {
        console.error('Error writing entry:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to write entry to file system.' }));
      }
    });
    return;
  }

  // GET /api/barred
  if (pathname === '/api/barred' && req.method === 'GET') {
    try {
      if (!fs.existsSync(BARRED_DIR)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ barred: [] }));
        return;
      }
      const files = fs.readdirSync(BARRED_DIR);
      const barred = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(BARRED_DIR, file), 'utf8');
            barred.push(JSON.parse(content));
          } catch (e) {}
        }
      }
      barred.sort((a, b) => b.timestamp - a.timestamp);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ barred }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read barred guests.' }));
    }
    return;
  }

  // POST /api/barred
  if (pathname === '/api/barred' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { guestname, reason, date, inst, property, otherinfo, photo } = data;
        if (!guestname) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Guest Name is required.' }));
          return;
        }
        const id = Date.now();
        const entryData = { id, guestname, reason, date, inst, property, otherinfo, photo, timestamp: id };
        fs.writeFileSync(path.join(BARRED_DIR, `barred_${id}.json`), JSON.stringify(entryData, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, entry: entryData }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save barred guest.' }));
      }
    });
    return;
  }

  // POST /api/barred/bulk
  if (pathname === '/api/barred/bulk' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!Array.isArray(data.guests)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Expected an array of guests.' }));
          return;
        }
        
        // Remove existing files only if clearFirst is explicitly true
        if (data.clearFirst === true && fs.existsSync(BARRED_DIR)) {
          const oldFiles = fs.readdirSync(BARRED_DIR);
          for (const file of oldFiles) {
            if (file.endsWith('.json')) {
              fs.unlinkSync(path.join(BARRED_DIR, file));
            }
          }
        }
        
        const added = [];
        let idCounter = Date.now();
        data.guests.forEach(g => {
          const id = idCounter++;
          const entryData = { id, timestamp: id, ...g };
          fs.writeFileSync(path.join(BARRED_DIR, `barred_${id}.json`), JSON.stringify(entryData, null, 2), 'utf8');
          added.push(entryData);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: added.length }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to bulk import barred guests.' }));
      }
    });
    return;
  }

  // GET /api/staff
  if (pathname === '/api/staff' && req.method === 'GET') {
    try {
      if (!fs.existsSync(STAFF_DIR)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ staff: [] }));
        return;
      }
      const files = fs.readdirSync(STAFF_DIR);
      const staff = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(STAFF_DIR, file), 'utf8');
            staff.push(JSON.parse(content));
          } catch (e) {}
        }
      }
      staff.sort((a, b) => b.timestamp - a.timestamp);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ staff }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read staff.' }));
    }
    return;
  }

  // POST /api/staff/bulk
  if (pathname === '/api/staff/bulk' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!Array.isArray(data.staff)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Expected an array of staff.' }));
          return;
        }
        
        // Remove existing files before bulk insert to do a fresh import
        if (fs.existsSync(STAFF_DIR)) {
          const oldFiles = fs.readdirSync(STAFF_DIR);
          for (const file of oldFiles) {
            if (file.endsWith('.json')) {
              fs.unlinkSync(path.join(STAFF_DIR, file));
            }
          }
        }
        
        const added = [];
        let idCounter = Date.now();
        data.staff.forEach(s => {
          const id = idCounter++;
          const entryData = { id, timestamp: id, ...s };
          fs.writeFileSync(path.join(STAFF_DIR, `staff_${id}.json`), JSON.stringify(entryData, null, 2), 'utf8');
          added.push(entryData);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: added.length }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to bulk import staff.' }));
      }
    });
    return;
  }

  // DELETE /api/staff
  if (pathname === '/api/staff' && req.method === 'DELETE') {
    const id = parsedUrl.searchParams.get('id');
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ID is required.' }));
      return;
    }
    try {
      const filePath = path.join(STAFF_DIR, `staff_${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Staff not found.' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to delete staff.' }));
    }
    return;
  }

  // PUT /api/barred
  if (pathname === '/api/barred' && req.method === 'PUT') {
    const id = parsedUrl.searchParams.get('id');
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ID is required.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const filePath = path.join(BARRED_DIR, `barred_${id}.json`);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Barred guest not found.' }));
          return;
        }
        
        const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const data = JSON.parse(body);
        const { guestname, reason, date, inst, property, otherinfo, photo } = data;
        
        if (!guestname) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Guest Name is required.' }));
          return;
        }
        
        const updatedData = { 
          ...existingData, 
          guestname, 
          reason, 
          date, 
          inst, 
          property, 
          otherinfo,
          photo: photo !== undefined ? photo : existingData.photo 
        };
        
        fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, entry: updatedData }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update barred guest.' }));
      }
    });
    return;
  }

  // DELETE /api/barred
  if (pathname === '/api/barred' && req.method === 'DELETE') {
    const id = parsedUrl.searchParams.get('id');
    const all = parsedUrl.searchParams.get('all');

    if (all === 'true' || id === 'all') {
      try {
        if (fs.existsSync(BARRED_DIR)) {
          const files = fs.readdirSync(BARRED_DIR);
          for (const file of files) {
            if (file.endsWith('.json')) {
              fs.unlinkSync(path.join(BARRED_DIR, file));
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'All barred guests deleted.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to delete all barred guests.' }));
      }
      return;
    }

    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ID is required.' }));
      return;
    }
    try {
      const filePath = path.join(BARRED_DIR, `barred_${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Barred guest not found.' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to delete barred guest.' }));
    }
    return;
  }

  // GET /api/status
  if (pathname === '/api/status' && req.method === 'GET') {
    const istParts = getISTDateParts(new Date());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      currentBusinessDate,
      serverTime: Date.now(),
      serverTimeIST: `${istParts.isoDate} ${String(istParts.hour).padStart(2, '0')}:${String(istParts.minute).padStart(2, '0')}:${String(istParts.second).padStart(2, '0')} IST`,
      validUntilIST: businessDateState.validUntilIST,
      validUntilTimestamp: businessDateState.validUntilTimestamp
    }));
    return;
  }

  // GET /api/archives
  if (pathname === '/api/archives' && req.method === 'GET') {
    const year = parsedUrl.searchParams.get('year');
    const month = parsedUrl.searchParams.get('month');

    if (!year || !month) {
      const archives = getArchiveMetadata();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ archives }));
      return;
    }

    try {
      const entries = readArchiveEntries(year, month);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ entries }));
    } catch (err) {
      console.error('Error reading archive entries:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read archive entries.' }));
    }
    return;
  }

  // GET /api/archive/download - Download raw 1-31 monthly Excel workbook
  if (pathname === '/api/archive/download' && req.method === 'GET') {
    const year = parsedUrl.searchParams.get('year');
    const month = parsedUrl.searchParams.get('month');
    if (!year || !month) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'year and month are required.' }));
      return;
    }
    const filePath = getArchiveWorkbookPath(year, month);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Archive workbook not found.' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Monthly_Archive_${year}-${month}.xlsx"`
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // GET /api/entries
  if (pathname === '/api/entries' && req.method === 'GET') {
    try {
      if (!fs.existsSync(ENTRIES_DIR)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ entries: [], currentBusinessDate }));
        return;
      }

      const files = fs.readdirSync(ENTRIES_DIR);
      const entries = [];

      for (const file of files) {
        if (file.endsWith('.json') && file !== 'users_db.json') {
          try {
            const filePath = path.join(ENTRIES_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(content);
            entries.push(parsed);
          } catch (readErr) {
            console.error(`Error reading or parsing file ${file}:`, readErr);
          }
        }
      }

      // Sort entries by timestamp (newest modified first)
      entries.sort((a, b) => (b.modifiedAt || b.id) - (a.modifiedAt || a.id));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ entries, currentBusinessDate }));
    } catch (err) {
      console.error('Error fetching entries:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read entries from file system.' }));
    }
    return;
  }

  // PUT /api/entries?id=<id>  — update an existing entry file
  if (pathname === '/api/entries' && req.method === 'PUT') {
    const entryId = parsedUrl.searchParams.get('id');
    if (!entryId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Entry ID is required.' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        // Find the matching file by scanning for the ID
        const files = fs.readdirSync(ENTRIES_DIR);
        let targetFile = null;
        for (const file of files) {
          if (file.endsWith('.json') && file !== 'users_db.json') {
            try {
              const content = JSON.parse(fs.readFileSync(path.join(ENTRIES_DIR, file), 'utf8'));
              if (content.id === Number(entryId)) {
                targetFile = file;
                break;
              }
            } catch (e) { /* ignore */ }
          }
        }

        if (!targetFile) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Entry not found.' }));
          return;
        }

        let existingEntry = {};
        try {
          existingEntry = JSON.parse(fs.readFileSync(path.join(ENTRIES_DIR, targetFile), 'utf8'));
        } catch (e) {}

        const updatedEntry = { ...existingEntry, ...data, id: Number(entryId), modifiedAt: Date.now() };
        fs.writeFileSync(path.join(ENTRIES_DIR, targetFile), JSON.stringify(updatedEntry, null, 2), 'utf8');

        const barredGuest = checkIfGuestIsBarred(updatedEntry.guestname);
        if (barredGuest) {
          broadcastEvent({
            type: 'barred-match',
            guestname: barredGuest.guestname,
            reason: barredGuest.reason || 'No reason specified',
            content: barredGuest.content
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });

        res.end(JSON.stringify({ success: true, entry: updatedEntry }));
      } catch (err) {
        console.error('Error updating entry:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update entry.' }));
      }
    });
    return;
  }

  // POST /api/newday - Archive current entries and clear day
  if (pathname === '/api/newday' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const finishedDate = currentBusinessDate;
        const result = archiveActiveEntries();
        
        if (result.archived && result.archivedEntries && result.archivedEntries.length > 0) {
          try {
            exportEntriesToExcel(result.archivedEntries, finishedDate);
          } catch (e) {
            console.error('Failed to export to excel on manual new day:', e);
          }
        }

        // Advance business date
        const targetDate = data.newDate || addDaysToDateStr(currentBusinessDate, 1);
        saveBusinessDateState(targetDate, 'manual');

        // Broadcast date-changed so all open client tabs update immediately
        broadcastEvent({
          type: 'date-changed',
          newDate: targetDate
        });

        if (!result.archived) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Date changed. No previous entries to archive.', newDate: targetDate }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Archived ${result.count} entries to Excel`, archive: result.archivePaths, newDate: targetDate }));
      } catch (err) {
        console.error('Error during NEW DAY process:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to complete New Day archiving.' }));
      }
    });
    return;
  }

  // POST /api/entries/move
  if (pathname === '/api/entries/move' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const idsToCopy = data.ids || [];
        let targetDateStr = data.targetDate;
        let copiedCount = 0;
        fs.appendFileSync('move_log.txt', new Date().toISOString() + ' MOVE REQUEST: ' + JSON.stringify(data) + '\n');
        
        if (!Array.isArray(idsToCopy) || idsToCopy.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No IDs provided.' }));
          return;
        }

        // Use targetDate if provided, otherwise default to Next Day based on currentBusinessDate
        if (!targetDateStr) {
          const d = new Date(currentBusinessDate);
          d.setDate(d.getDate() + 1);
          targetDateStr = d.toISOString().split('T')[0];
        }

        const files = fs.existsSync(ENTRIES_DIR) ? fs.readdirSync(ENTRIES_DIR) : [];

        files.forEach(file => {
          if (!file.endsWith('.json') || file === 'users_db.json') return;
          
          try {
            const filePath = path.join(ENTRIES_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const entry = JSON.parse(content);
            
            if (idsToCopy.includes(entry.id)) {
              // Move existing entry to new date
              entry.businessDate = targetDateStr;
              if (entry.datetime) {
                const timePart = entry.datetime.includes('T') ? entry.datetime.split('T')[1] : entry.datetime.split(' ')[1];
                entry.datetime = `${targetDateStr}T${timePart}`;
              }
              entry.modifiedAt = Date.now();
              fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
              copiedCount++;
            }
          } catch (err) {
            console.error('Failed to parse or copy file:', file, err);
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, copied: copiedCount }));
      } catch (err) {
        console.error('Copy forward error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error during copy.' }));
      }
    });
    return;
  }

  // DELETE /api/entries?id=<id>  — delete an entry file
  if (pathname === '/api/entries' && req.method === 'DELETE') {
    const entryId = parsedUrl.searchParams.get('id');
    if (!entryId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Entry ID is required.' }));
      return;
    }

    try {
      const files = fs.readdirSync(ENTRIES_DIR);
      let targetFile = null;
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'users_db.json') {
          try {
            const content = JSON.parse(fs.readFileSync(path.join(ENTRIES_DIR, file), 'utf8'));
            if (content.id === Number(entryId)) {
              targetFile = file;
              break;
            }
          } catch (e) { /* ignore */ }
        }
      }

      if (!targetFile) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Entry not found.' }));
        return;
      }

      fs.unlinkSync(path.join(ENTRIES_DIR, targetFile));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Entry deleted.' }));
    } catch (err) {
      console.error('Error deleting entry:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to delete entry.' }));
    }
    return;
  }

  // ==========================================
  // STAFF / EMPLOYEE LOGIC
  // ==========================================
  if (req.method === 'GET' && pathname === '/api/staff') {
    try {
      if (!fs.existsSync(STAFF_DIR)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ staff: [] }));
      }
      const files = fs.readdirSync(STAFF_DIR);
      const staffList = [];
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(STAFF_DIR, file), 'utf8');
            staffList.push(JSON.parse(content));
          } catch (e) {
            console.error('Error reading staff file', file, e);
          }
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ staff: staffList }));
    } catch (e) {
      console.error('Failed to get staff list:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  if (req.method === 'POST' && pathname === '/api/staff') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { id, name, employeeid, department, role, photo } = JSON.parse(body);
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Name is required' }));
        }
        const entryData = { id, name, employeeid, department, role, photo, timestamp: id };
        fs.writeFileSync(path.join(STAFF_DIR, `staff_${id}.json`), JSON.stringify(entryData, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error('Error saving staff member:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/staff/bulk') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { entries } = JSON.parse(body);
        if (!entries || !Array.isArray(entries)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Invalid payload' }));
        }
        let added = [];
        entries.forEach(entry => {
          const { name, employeeid, department, role, photo } = entry;
          if (name) {
            const id = Date.now() + Math.floor(Math.random() * 10000);
            const entryData = { id, name, employeeid, department, role, photo, timestamp: id };
            fs.writeFileSync(path.join(STAFF_DIR, `staff_${id}.json`), JSON.stringify(entryData, null, 2), 'utf8');
            added.push(entryData);
          }
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, count: added.length }));
      } catch (e) {
        console.error('Error in bulk staff import:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/staff/')) {
    const id = pathname.split('/').pop();
    if (id) {
      try {
        const filePath = path.join(STAFF_DIR, `staff_${id}.json`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Staff member not found' }));
        }
      } catch (e) {
        console.error('Error deleting staff member:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to delete' }));
      }
    }
    return;
  }

  // ==========================================================================
  // STATIC FILE ROUTING
  // ==========================================================================
  
  // Clean request path
  const sanitizedPath = pathname === '/' ? '/index.html' : pathname;
  const rootFilePath = path.join(__dirname, sanitizedPath);
  const publicFilePath = path.join(__dirname, 'public', sanitizedPath);
  
  // Prefer root file if present (since direct GitHub uploads land at root), otherwise fallback to public/
  let filePath = publicFilePath;
  if (fs.existsSync(rootFilePath)) {
    filePath = rootFilePath;
  } else if (fs.existsSync(publicFilePath)) {
    filePath = publicFilePath;
  }
  
  // Security: prevent directory traversal
  const relativePublic = path.relative(path.join(__dirname, 'public'), filePath);
  const isSafePublic = relativePublic && !relativePublic.startsWith('..') && !path.isAbsolute(relativePublic);
  const relativeRoot = path.relative(__dirname, filePath);
  const isSafeRoot = relativeRoot && !relativeRoot.startsWith('..') && !path.isAbsolute(relativeRoot);
  const isSafe = isSafePublic || isSafeRoot;
  
  if (!isSafe) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // fallback to index.html for client-side routing (prefer root over public)
        let indexFile = path.join(__dirname, 'index.html');
        if (!fs.existsSync(indexFile)) {
          indexFile = path.join(__dirname, 'public', 'index.html');
        }
        fs.readFile(indexFile, (indexErr, indexContent) => {
          if (indexErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          } else {
            res.writeHead(200, {
              'Content-Type': 'text/html',
              'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
            });
            res.end(indexContent, 'utf-8');
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      });
      res.end(content, 'utf-8');
    }
  });
});

const osModule = require('os');
const networkInterfaces = osModule.networkInterfaces();
let localIp = 'localhost';

for (const interfaceName in networkInterfaces) {
  const interfaces = networkInterfaces[interfaceName];
  for (const iface of interfaces) {
    if (!iface.internal && iface.family === 'IPv4') {
      localIp = iface.address;
      break;
    }
  }
  if (localIp !== 'localhost') break;
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use! Another server process is already running.`);
    console.error(`To fix this in Termux, run: pkill -f node`);
  } else {
    console.error(`Server error:`, err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(` SUCCESS! Surveillance Server is LIVE!`);
  console.log(`======================================================`);
  console.log(` -> Access on this PC:      http://localhost:${PORT}`);
  if (localIp !== 'localhost') {
    console.log(` -> Access from other PCs:  http://${localIp}:${PORT}`);
  }
  console.log(`======================================================\n`);
  console.log(`Writing entries to: ${TARGET_DIR}`);
  startDailyArchiveJob();
});
