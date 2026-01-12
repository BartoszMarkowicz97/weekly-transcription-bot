const path = require('path');
const fs = require('fs');
const AsyncLock = require('async-lock');
const config = require('config');
const utils = require('../utils/utils');
const embeds = require('../utils/embeds');
const state = require('../utils/state');

const stateLock = new AsyncLock();

const MEETINGS_DIR = path.join(__dirname, '../../meetings/');

module.exports = async (req, res) => {
  const channelId = req.body.channelId;

  if(!channelId) {
    return res.status(400).json({ error: 'Missing required field: channelId' });
  }

  await stateLock.acquire('recording', async () => {
    if(!state.recordingProcess || !state.connection) {
      return res.status(400).json({ error: 'No active recording' });
    }

    try {
      console.log('Stopping connection and cleaning up resources...');

      await utils.cleanupRecording();

      const meetingName = state.currentMeeting;
      state.currentMeeting = null;

      const meetingPath = path.join(MEETINGS_DIR, meetingName);

      const oggPath = path.join(meetingPath, `${meetingName}.ogg`);
      const mp3Path = path.join(meetingPath, `${meetingName}.mp3`);

      console.log(`Checking if OGG file exists at: ${oggPath}`);
      if(!fs.existsSync(oggPath)) {
        console.error('OGG file not found!');
        return res.status(500).json({ error: 'Recording file not found' });
      }

      state.meetings.push({
        name: meetingName,
        recorded: true,
        transcribed: false,
        summarized: false,
      });

      let thread = null;
      const sendEmbed = async (embed) => {
        try {
          if(!global.discordClient) return;
          const channel = await global.discordClient.channels.fetch(channelId);
          if(!channel) return;

          // If caller provided a thread channel, just send there
          if(channel.isThread && channel.isThread()) {
            await channel.send({ embeds: [embed] });
            return;
          }

          // Reuse thread if already created
          if(thread) {
            await thread.send({ embeds: [embed] });
            return;
          }

          if(!channel.isTextBased || !channel.isTextBased()) return;

          // First message in parent channel, then create a thread
          const msg = await channel.send({ embeds: [embed] });
          try {
            thread = await msg.startThread({ name: `Summary of the meeting '${meetingName}'` });
          } catch(err) {
            console.error('Could not start thread for status updates:', err.message);
          }
        } catch(err) {
          console.error('Error sending status embed:', err.message);
        }
      };

      // Async processing - don't wait
      setImmediate(async () => {
        try {
          console.log('Converting OGG to MP3...');
          await sendEmbed(embeds.convertingStartedEmbed);
          await utils.convertOggToMp3(oggPath, mp3Path);
          await sendEmbed(embeds.convertingSuccessEmbed);

          console.log('Starting audio splitting...');
          await sendEmbed(embeds.splittingStartedEmbed);
          const audioParts = await utils.splitAudioFile(mp3Path, config.get('openai.transcription_max_size_MB'));
          console.log(`Audio splitting successful. Parts: ${audioParts.length}`);
          await sendEmbed(embeds.splittingSuccessEmbed(audioParts.length));

          console.log('Starting transcription...');
          await sendEmbed(embeds.transcriptionStartedEmbed);
          const transcription = await utils.transcribe(audioParts);
          
          if(!transcription) {
            console.error('Transcription failed!');
            await sendEmbed(embeds.transcriptionFailedEmbed);
            return;
          }

          const transcriptionFile = path.join(meetingPath, 'transcription.txt');
          fs.writeFileSync(transcriptionFile, transcription);

          const meeting = state.meetings.find((m) => m.name === meetingName);
          if(meeting) meeting.transcribed = true;
          await sendEmbed(embeds.transcriptionCompletedEmbed);

          console.log('Starting summarization...');
          await sendEmbed(embeds.summaryStartedEmbed);
          const summary = await utils.summarize(transcription);

          if(summary) {
            const summaryFile = path.join(meetingPath, 'summary.md');
            fs.writeFileSync(summaryFile, summary);

            const meeting = state.meetings.find((m) => m.name === meetingName);
            if(meeting) meeting.summarized = true;
            await sendEmbed(embeds.summaryCompletedEmbed);
          }

          console.log('Meeting processing complete');
          await sendEmbed(embeds.processingSuccessEmbed);
        } catch(err) {
          console.error('Error in async processing:', err);
          await sendEmbed(embeds.processingFailedEmbed(err.message));
        }
      });

      res.json({ 
        success: true, 
        message: `Recording stopped for meeting: ${meetingName}. Processing started in background.`,
        meetingName: meetingName
      });
    } catch(error) {
      console.error('Error stopping recording:', error);
      res.status(500).json({ error: error.message });
    }
  });
};
