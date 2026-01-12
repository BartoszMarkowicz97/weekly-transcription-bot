const state = require('../utils/state');
const config = require('config');

module.exports = async (req, res) => {
  if(state.meetings.length === 0) {
    return res.status(404).json({ error: 'No meetings found' });
  }

  res.json({
    success: true,
    meetings: state.meetings.map((meeting) => ({
      name: meeting.name,
      recorded: meeting.recorded,
      transcribed: meeting.transcribed,
      summarized: meeting.summarized,
    })),
    count: state.meetings.length,
  });
};
