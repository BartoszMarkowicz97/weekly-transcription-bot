const fs = require('fs');
const path = require('path');
const state = require('../utils/state');
const config = require('config');

module.exports = async (req, res) => {
  const MEETINGS_DIR = path.join(__dirname, '../../meetings/');
  const meetingName = req.params.name;
  const what = req.query.type || 'meeting'; // 'recording', 'meeting'

  const meetingPath = path.join(MEETINGS_DIR, meetingName);

  if(!fs.existsSync(meetingPath)) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  if(what === 'recording') {
    const files = fs.readdirSync(meetingPath);
    const audioFiles = files.filter(
      (file) => file.endsWith('.ogg') || file.endsWith('.mp3')
    );

    if(audioFiles.length === 0) {
      return res.status(404).json({ error: 'No recordings found' });
    }

    audioFiles.forEach((file) => fs.unlinkSync(path.join(meetingPath, file)));

    const meeting = state.meetings.find(
      (meeting) => meeting.name === meetingName
    );
    if(meeting) meeting.recorded = false;

    return res.json({ success: true, message: 'Recording files deleted' });
  } else {
    fs.rmSync(meetingPath, { recursive: true, force: true });
    state.meetings = state.meetings.filter(
      (meeting) => meeting.name !== meetingName
    );
    return res.json({ success: true, message: 'Meeting deleted' });
  }
};
