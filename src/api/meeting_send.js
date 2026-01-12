const fs = require('fs');
const path = require('path');
const state = require('../utils/state');
const config = require('config');

module.exports = async (req, res) => {
  const MEETINGS_DIR = path.join(__dirname, '../../meetings/');
  const meetingName = req.params.name;
  const what = req.query.type || 'recording'; // 'recording', 'transcription'

  const meetingPath = path.join(MEETINGS_DIR, meetingName);

  if(!fs.existsSync(meetingPath)) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const files = fs.readdirSync(meetingPath);

  if(what === 'recording') {
    const audioFiles = files.filter(
      (file) => file.endsWith('.mp3') || file.endsWith('.ogg')
    );

    if(audioFiles.length === 0) {
      return res.status(404).json({ error: 'No recording found' });
    }

    const fileToSend = path.join(meetingPath, audioFiles[0]);
    res.download(fileToSend, `${meetingName}.${audioFiles[0].endsWith('.mp3') ? 'mp3' : 'ogg'}`);
  } else if(what === 'transcription') {
    const txtFiles = files.filter((file) => file.endsWith('.txt'));
    if(txtFiles.length === 0) {
      return res.status(404).json({ error: 'No transcription found' });
    }

    const fileToSend = path.join(meetingPath, txtFiles[0]);
    res.download(fileToSend, `${meetingName}_transcription.txt`);
  } else if(what === 'summary') {
    const mdFiles = files.filter((file) => file.endsWith('.md'));
    if(mdFiles.length === 0) {
      return res.status(404).json({ error: 'No summary found' });
    }

    const fileToSend = path.join(meetingPath, mdFiles[0]);
    res.download(fileToSend, `${meetingName}_summary.md`);
  } else {
    return res.status(400).json({ error: 'Invalid file type. Use: recording, transcription, or summary' });
  }
};
