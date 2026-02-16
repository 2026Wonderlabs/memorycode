# Personal Memorial Website

A warm, respectful digital tribute site where you can honor someone special. Create a memorial profile with their name, photo, biography, and audio messages that visitors can hear and revisit.

## Features

- **Create Memorial Profile**: Set up a profile with name, story, and admin passcode
- **Profile Photo**: Display a prominent photo of the person being remembered
- **Biography**: Share their story in your own words
- **Auto-Discovered Audio**: Upload audio files (voices, messages, favorite songs) and they're automatically listed and playable
- **Edit Anytime**: Update name, bio, and photo whenever you want
- **Unique QR Code**: Every memorial generates a shareable QR code for easy access on mobile
- **Warm, Respectful Design**: Clean, typographic interface that feels personal and human

## How to Run Locally

### Prerequisites
- Node.js v14 or higher

### Setup

1. Navigate to the project folder:
```bash
cd "grave qr code"
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The site will be available at `http://localhost:3000`

### Using the Memorial Site

1. **Create a memorial** by entering their name, a passcode (to protect edit access), and optionally a bio
2. **Add a profile photo** by editing the memorial and providing a photo URL
3. **Upload audio files** (voices, greetings, favorite songs) — they'll be automatically organized and displayed
4. **Share the QR code** — scan it to view the memorial on mobile, or share the direct link

## Data Storage

- **Profile metadata** is stored in `data/<id>.json`
- **Uploads** are organized into:
  - `uploads/<id>/audios/` — audio files
  - `uploads/<id>/photos/` — photos
  - `uploads/<id>/videos/` — videos

## API Endpoints

- `GET /api/profile?id=ID` — fetch public profile data
- `POST /api/create-profile` — create a new memorial (body: `{id, name, passcode, bio}`)
- `POST /api/edit-profile?id=ID` — edit profile (body: `{name, bio, newPhoto, passcode}`)
- `GET /api/audios?id=ID` — list all audio files for a profile (auto-discovered)
- `GET /api/profile-qr?id=ID` — get QR code as data URL
- `POST /api/upload?id=ID` — upload photos, audio, or videos (multipart form with `passcode`)

## Production Deployment

For long-term hosting and production use, consider:

1. **Hosting**: Deploy to Render, Railway, or Heroku
2. **File Storage**: Use cloud storage like AWS S3 for uploads
3. **Database**: Use a database (MongoDB, PostgreSQL) instead of local JSON files
4. **HTTPS**: Always use HTTPS for production
5. **Authentication**: Consider additional security measures for admin access

## Example

1. Create memorial for "John Smith" with passcode "secure123"
2. Upload a photo URL (e.g., from a cloud storage service)
3. Upload audio files: voice message, favorite song
4. Share the QR code on the headstone, in photos, or with family
5. Anyone can scan and listen to his voice anytime
