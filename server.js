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

function calculateActualBusinessDate() {
  const d = new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPersistedBusinessDate() {
  const filePath = path.join(TARGET_DIR, 'business_date.txt');
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  const d = calculateActualBusinessDate();
  fs.writeFileSync(filePath, d, 'utf8');
  return d;
}

let currentBusinessDate = getPersistedBusinessDate();

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

function savePersistedBusinessDate(d) {
  currentBusinessDate = d;
  fs.writeFileSync(path.join(TARGET_DIR, 'business_date.txt'), d, 'utf8');
}




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

function saveEntriesToArchive(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const archiveFiles = new Set();
  const groupedByMonth = {};

  entries.forEach(entry => {
    const dateValue = entry.datetime ? new Date(entry.datetime) : new Date();
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate());
    const workbookKey = `${year}-${month}`;

    if (!groupedByMonth[workbookKey]) {
      groupedByMonth[workbookKey] = {};
    }
    if (!groupedByMonth[workbookKey][day]) {
      groupedByMonth[workbookKey][day] = [];
    }

    groupedByMonth[workbookKey][day].push({
      id: entry.id,
      datetime: entry.datetime,
      surv: entry.surv,
      cd: entry.cd,
      cashier: entry.cashier,
      type: entry.type,
      amount: entry.amount,
      guestname: entry.guestname,
      card: entry.card || '',
      otherinfo: entry.otherinfo || ''
    });
  });

  Object.entries(groupedByMonth).forEach(([workbookKey, days]) => {
    const [year, month] = workbookKey.split('-');
    const workbookPath = ensureArchiveWorkbook(year, month);
    const workbook = fs.existsSync(workbookPath) ? xlsx.readFile(workbookPath) : xlsx.utils.book_new();

    Object.entries(days).forEach(([day, dayEntries]) => {
      const sheetName = String(Number(day));
      const existingSheet = workbook.Sheets[sheetName];
      const existingData = existingSheet ? xlsx.utils.sheet_to_json(existingSheet, { defval: '' }) : [];
      const merged = [...existingData, ...dayEntries];
      const worksheet = xlsx.utils.json_to_sheet(merged);
      workbook.Sheets[sheetName] = worksheet;
      if (!workbook.SheetNames.includes(sheetName)) {
        workbook.SheetNames.push(sheetName);
      }
    });

    xlsx.writeFile(workbook, workbookPath);
    archiveFiles.add(workbookPath);
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
    const formattedData = entries.map(e => ({
      ID: e.id,
      'Gaming Date': e.businessDate,
      'Date/Time': e.datetime,
      'Surv': e.surv || '',
      'CD': e.cd || '',
      'Cashier': e.cashier || '',
      'Type': e.type || '',
      'Amount': e.amount || '',
      'Guest Name': e.guestname || '',
      'Card Number': e.card || '',
      'Other Info': e.otherinfo || ''
    }));

    const worksheet = xlsx.utils.json_to_sheet(formattedData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Entries');

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
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    data.forEach(row => {
      entries.push({
        id: row.id || null,
        datetime: row.datetime || `${year}-${month}-${sheetName}`,
        surv: row.surv || '',
        cd: row.cd || '',
        cashier: row.cashier || '',
        type: row.type || '',
        amount: Number(row.amount) || 0,
        guestname: row.guestname || '',
        card: row.card || '',
        otherinfo: row.otherinfo || ''
      });
    });
  });

  entries.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  return entries;
}

function startDailyArchiveJob() {
  // 1. Check if we missed the reset while the server/PC was shut down
  const actualDate = calculateActualBusinessDate();
  if (actualDate > currentBusinessDate) {
    console.log(`[${new Date().toISOString()}] Missed a daily reset. Running catch-up archiving...`);
    try {
      const result = archiveActiveEntries();
      if (result.archived) {
        console.log(`Catch-up archived ${result.count} entries.`);
      }
      savePersistedBusinessDate(actualDate);
    } catch (err) {
      console.error('Catch-up archive failed:', err);
    }
  }

  // 2. Schedule the normal daily reset at 06:00 AM while the server is running
  cron.schedule('0 6 * * *', () => {
    const finishedBusinessDate = currentBusinessDate; // The date that just finished
    savePersistedBusinessDate(calculateActualBusinessDate()); // Auto reset the logical date
    console.log(`[${new Date().toISOString()}] Running daily archiving job...`);
    try {
      const result = archiveActiveEntries();
      if (result.archived) {
        console.log(`Archived ${result.count} active entries to: ${result.archivePaths.join(', ')}`);
        if (result.archivedEntries && result.archivedEntries.length > 0) {
          exportEntriesToExcel(result.archivedEntries, finishedBusinessDate);
        }
      } else {
        console.log('No active entries were found to archive.');
      }
    } catch (err) {
      console.error('Scheduled archive failed:', err);
    }
  }, {
    scheduled: true
  });
}

// Database Helper: Load users
function loadUsers() {
  const defaultUsers = {
    admin: { password: 'MANTHAN007', role: 'admin' },
    surv_agent: { password: 'password123', role: 'officer' },
    cashier_chief: { password: 'password123', role: 'supervisor' }
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
    for (let username in users) {
      if (typeof users[username] === 'string') {
        users[username] = {
          password: users[username],
          role: username === 'admin' ? 'admin' : 'officer'
        };
        upgraded = true;
      }
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
        if (userObj && userObj.password === password) {
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
    const requester = parsedUrl.searchParams.get('requester');
    if (requester !== 'admin' && requester !== 'supervisor') {
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
        if (adminUser !== 'admin' && adminUser !== 'supervisor') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden. Admin authorization required.' }));
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
    const adminUser = parsedUrl.searchParams.get('adminUser');
    const usernameToDelete = parsedUrl.searchParams.get('username');

    if (adminUser !== 'admin' && adminUser !== 'supervisor') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden. Admin authorization required.' }));
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

  // PUT /api/users (Admin/Supervisor - update credentials)
  if (pathname === '/api/users' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { adminUser, username, password, role } = JSON.parse(body);
        if (adminUser !== 'admin' && adminUser !== 'supervisor') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden. Admin authorization required.' }));
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
        const entryData = { id: entryId, ...data, modifiedAt: entryId };

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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ currentBusinessDate, serverTime: Date.now() }));
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

        const updatedEntry = { ...data, id: Number(entryId), modifiedAt: Date.now() };
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
        const result = archiveActiveEntries();
        
        // Advance business date
        if (data.newDate) {
          savePersistedBusinessDate(data.newDate);
        } else {
          const d = new Date(currentBusinessDate);
          d.setDate(d.getDate() + 1);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          savePersistedBusinessDate(`${year}-${month}-${day}`);
        }

        if (!result.archived) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Date changed. No previous entries to archive.', newDate: currentBusinessDate }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Archived ${result.count} entries to Excel`, archive: result.archivePaths, newDate: currentBusinessDate }));
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
  let filePath = path.join(__dirname, 'public', sanitizedPath);
  
  // Security: prevent directory traversal
  const relative = path.relative(path.join(__dirname, 'public'), filePath);
  const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  
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
        // fallback to index.html for client-side routing
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (indexErr, indexContent) => {
          if (indexErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
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
