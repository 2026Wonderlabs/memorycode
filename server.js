const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.json());

function hashPass(p) {
  return crypto.createHash('sha256').update(p || '').digest('hex');
}

app.get('/api/profile', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send({ error: 'Missing id' });
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return res.status(404).send({ error: 'Not found' });
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { passHash, ...publicData } = j;
  res.json(publicData);
});

app.post('/api/create-profile', (req, res) => {
  const { id, name, passcode, bio } = req.body || {};
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).send('Invalid id');
  const file = path.join(DATA_DIR, `${id}.json`);
  if (fs.existsSync(file)) return res.status(409).send('Profile exists');
  const passHash = hashPass(passcode || '');
  const profile = { id, name: name || '', bio: bio || '', photo: '', story: '', quote: '', passHash, photos: [], audios: [], videos: [], messages: [], playlists: [] };
  fs.mkdirSync(path.join(UPLOADS_DIR, id, 'audios'), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(profile, null, 2));
  res.status(201).send('Created');
});

app.post('/api/edit-profile', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing id');
  const { name, bio, passcode, newPhoto, story, quote } = req.body || {};
  const pass = passcode || '';
  const dataFile = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(dataFile)) return res.status(404).send('Profile not found');
  let profile = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const passOk = (hashPass(pass) === profile.passHash);
  if (!passOk) return res.status(403).send('Bad passcode');
  if (name !== undefined) profile.name = name;
  if (bio !== undefined) profile.bio = bio;
  if (newPhoto !== undefined) profile.photo = newPhoto;
  if (story !== undefined) profile.story = story;
  if (quote !== undefined) profile.quote = quote;
  fs.writeFileSync(dataFile, JSON.stringify(profile, null, 2));
  res.send('OK');
});

app.post('/api/login', (req, res) => {
  const id = req.query.id || req.body.id;
  const pass = req.body.passcode || req.body.pass || '';
  if (!id) return res.status(400).send('Missing id');
  const dataFile = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(dataFile)) return res.status(404).send('Profile not found');
  const profile = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const ADMIN = process.env.ADMIN_PASS || '';
  const passOk = (ADMIN && pass === ADMIN) || (hashPass(pass) === profile.passHash);
  if (!passOk) return res.status(403).send('Bad passcode');
  res.send('OK');
});

app.get('/api/audios', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send({ error: 'Missing id' });
  const audiosDir = path.join(UPLOADS_DIR, id, 'audios');
  const list = [];
  if (fs.existsSync(audiosDir)) {
    fs.readdirSync(audiosDir).forEach(fname => {
      const fpath = path.join(audiosDir, fname);
      if (fs.statSync(fpath).isFile()) {
        list.push({ name: fname, url: `/uploads/${id}/audios/${fname}`, ts: fs.statSync(fpath).mtimeMs });
      }
    });
  }
  res.json({ audios: list.sort((a, b) => b.ts - a.ts) });
});

app.get('/api/profile-qr', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send({ error: 'Missing id' });
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return res.status(404).send({ error: 'Profile not found' });
  const profileUrl = `${req.protocol}://${req.get('host')}/?id=${encodeURIComponent(id)}`;
  try {
    const dataUrl = await qrcode.toDataURL(profileUrl, { errorCorrectionLevel: 'H', width: 360 });
    res.json({ dataUrl, url: profileUrl });
  } catch (e) {
    res.status(500).send('QR generation failed');
  }
});

app.post('/api/upload', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing id');

  const storage = multer.diskStorage({
    destination: function (reqf, file, cb) {
      const dir = path.join(UPLOADS_DIR, id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: function (reqf, file, cb) {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_.]/g, '_');
      cb(null, Date.now() + '-' + safe);
    }
  });

  const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }).any();
  upload(req, res, err => {
    if (err) return res.status(500).send('Upload error');

    const pass = req.body.passcode || '';
    const ADMIN = process.env.ADMIN_PASS || '';

    const dataFile = path.join(DATA_DIR, `${id}.json`);
    if (!fs.existsSync(dataFile)) return res.status(404).send('Profile not found');
    let meta = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    const passOk = (ADMIN && pass === ADMIN) || (hashPass(pass) === meta.passHash);
    if (!passOk) return res.status(403).send('Bad passcode');

    for (const f of req.files || []) {
      const relBase = `/uploads/${id}`;
      let subdir = 'files';
      if (f.mimetype && f.mimetype.startsWith('image/')) subdir = 'photos';
      else if (f.mimetype && f.mimetype.startsWith('audio/')) subdir = 'audios';
      else if (f.mimetype && f.mimetype.startsWith('video/')) subdir = 'videos';
      else {
        // fallback to extension-based detection when mimetype is missing/unknown
        const ext = (path.extname(f.originalname || '') || '').toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) subdir = 'photos';
        else if (['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) subdir = 'audios';
        else if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) subdir = 'videos';
      }
      const subdirPath = path.join(UPLOADS_DIR, id, subdir);
      fs.mkdirSync(subdirPath, { recursive: true });
      const newPath = path.join(subdirPath, f.filename);
      fs.renameSync(f.path, newPath);
      const rel = `${relBase}/${subdir}/${f.filename}`;
      if (subdir === 'photos') {
        meta.photos.push({ name: f.filename, displayName: f.originalname, url: rel, ts: Date.now() });
      } else if (subdir === 'audios') {
        meta.audios.push({ name: f.filename, displayName: f.originalname, url: rel, ts: Date.now() });
      } else if (subdir === 'videos') {
        meta.videos.push({ name: f.filename, displayName: f.originalname, url: rel, ts: Date.now() });
      }
    }

    fs.writeFileSync(dataFile, JSON.stringify(meta, null, 2));
    res.send('OK');
  });
});

app.post('/api/delete-file', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing id');
  const { type, filename, passcode } = req.body || {};
  if (!type || !filename || !passcode) return res.status(400).send('Missing type, filename, or passcode');

  const dataFile = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(dataFile)) return res.status(404).send('Profile not found');
  let profile = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

  const passOk = (hashPass(passcode) === profile.passHash);
  if (!passOk) return res.status(403).send('Bad passcode');

  const filePath = path.join(UPLOADS_DIR, id, type, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  try {
    fs.unlinkSync(filePath);
    // Remove from metadata
    if (type === 'photos') profile.photos = profile.photos.filter(p => p.name !== filename);
    else if (type === 'audios') profile.audios = profile.audios.filter(a => a.name !== filename);
    else if (type === 'videos') profile.videos = profile.videos.filter(v => v.name !== filename);
    fs.writeFileSync(dataFile, JSON.stringify(profile, null, 2));
    res.send('Deleted');
  } catch (e) {
    res.status(500).send('Delete failed');
  }
});

app.post('/api/add-message', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing id');
  const { name, message } = req.body || {};
  if (!message) return res.status(400).send('Message required');
  
  const dataFile = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(dataFile)) return res.status(404).send('Profile not found');
  let profile = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  
  const msg = {
    name: (name || 'Anonymous').substring(0, 100),
    text: message.substring(0, 500),
    ts: Date.now()
  };
  if (!profile.messages) profile.messages = [];
  profile.messages.push(msg);
  fs.writeFileSync(dataFile, JSON.stringify(profile, null, 2));
  res.send('Message added');
});

app.get('/api/messages', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing id');
  
  const dataFile = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(dataFile)) return res.status(404).send('Profile not found');
  const profile = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  
  res.json({ messages: (profile.messages || []).sort((a, b) => b.ts - a.ts) });
});

// Playlist endpoints
function extractPlaylistInfo(url) {
  // Spotify: https://open.spotify.com/playlist/PLAYLIST_ID or https://open.spotify.com/playlist/PLAYLIST_ID?...
  const spotifyMatch = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (spotifyMatch) {
    return { platform: 'spotify', id: spotifyMatch[1], url: `https://open.spotify.com/playlist/${spotifyMatch[1]}` };
  }
  
  // Amazon Music: handles all regional domains (.com, .co.uk, etc) and both /playlists/ and /user-playlists/
  const amazonMatch = url.match(/music\.amazon\.[a-z.]+\/(playlists|user-playlists)\/([a-zA-Z0-9\-]+)/);
  if (amazonMatch) {
    return { platform: 'amazon', id: amazonMatch[2], url: url };
  }
  
  return null;
}

app.post('/api/add-playlist', (req, res) => {
  const id = req.query.id;
  const { playlistUrl, passcode } = req.body || {};
  
  if (!id || !playlistUrl || !passcode) return res.status(400).send('Missing fields');
  
  const dataFile = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(dataFile)) return res.status(404).send('Profile not found');
  
  let profile = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const passOk = (hashPass(passcode) === profile.passHash);
  if (!passOk) return res.status(403).send('Bad passcode');
  
  const playlistInfo = extractPlaylistInfo(playlistUrl);
  if (!playlistInfo) return res.status(400).send('Invalid playlist URL');
  
  if (!profile.playlists) profile.playlists = [];
  profile.playlists.push({ ...playlistInfo, ts: Date.now() });
  
  fs.writeFileSync(dataFile, JSON.stringify(profile, null, 2));
  res.send('Playlist added');
});

app.post('/api/delete-playlist', (req, res) => {
  const id = req.query.id;
  const { playlistId, passcode } = req.body || {};
  
  if (!id || !playlistId || !passcode) return res.status(400).send('Missing fields');
  
  const dataFile = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(dataFile)) return res.status(404).send('Profile not found');
  
  let profile = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const passOk = (hashPass(passcode) === profile.passHash);
  if (!passOk) return res.status(403).send('Bad passcode');
  
  if (!profile.playlists) profile.playlists = [];
  profile.playlists = profile.playlists.filter(p => p.id !== playlistId);
  
  fs.writeFileSync(dataFile, JSON.stringify(profile, null, 2));
  res.send('Playlist deleted');
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
