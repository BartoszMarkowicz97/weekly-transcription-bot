const djsv = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const prism = require('prism-media');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { PassThrough } = require('stream');
const AsyncLock = require('async-lock');
const config = require('config');
const { cleanupRecording } = require('../utils/utils');
const embeds = require('../utils/embeds');
const state = require('../utils/state');

const stateLock = new AsyncLock();

const MEETINGS_DIR = path.join(__dirname, '../../meetings/');
const AUDIO_SETTINGS = {
  channels: 1,
  rate: 48000,
  frameSize: 960,
  bitrate: '64k',
  mixInterval: 20,
};

module.exports = async (req, res) => {
  const { name, channelId } = req.body;

  // Validation
  if(!name) return res.status(400).json({ error: 'Missing required field: name' });
  if(!channelId) return res.status(400).json({ error: 'Missing required field: channelId' });

  await stateLock.acquire('recording', async () => {
    if(state.currentMeeting) {
      return res.status(409).json({ error: 'A meeting is already being recorded' });
    }

    if(state.meetings.map((m) => m.name).includes(name)) {
      return res.status(409).json({ error: 'A meeting with this name already exists' });
    }

    try {
      if(!global.discordClient) {
        return res.status(500).json({ error: 'Discord client not available' });
      }

      const voiceChannel = await global.discordClient.channels.fetch(channelId);
      if(!voiceChannel || voiceChannel.type !== 2) return res.status(400).json({ error: 'Invalid voice channel' });
      const guild = voiceChannel.guild;

      state.connection = djsv.joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true,
      });

      if(!state.connection) {
        return res.status(500).json({ error: 'Failed to join voice channel' });
      }

      state.connection.on('stateChange', (oldState, newState) => {
        if(newState.status === djsv.VoiceConnectionStatus.Disconnected && 
           oldState.status !== newState.status) {
          console.error('Unexpected disconnection!');
          cleanupRecording();
        }
      });

      state.currentMeeting = name;

      const meetingFolder = path.join(MEETINGS_DIR, state.currentMeeting);
      if(!fs.existsSync(meetingFolder)) fs.mkdirSync(meetingFolder);

      const oggPath = path.join(meetingFolder, `${state.currentMeeting}.ogg`);
      state.recordingProcess = spawn(ffmpeg, [
        '-f', 's16le',
        '-ar', AUDIO_SETTINGS.rate.toString(),
        '-ac', AUDIO_SETTINGS.channels.toString(),
        '-i', 'pipe:0',
        '-c:a', 'libopus',
        '-b:a', AUDIO_SETTINGS.bitrate,
        '-application', 'voip',
        '-flush_packets', '1',
        '-vn', '-y',
        oggPath,
      ]);
      
      state.recordingProcess.on('error', (err) => {
        console.error('Recording process error: ', err);
        state.connection.destroy();
        state.connection = null;
      });

      state.recordingProcess.on('close', async () => {
        if(!fs.existsSync(oggPath)) {
          console.error('OGG file does not exist');
          fs.rmSync(meetingFolder, { recursive: true });
        } else {
          console.log('Recording saved successfully');
        }
      });

      state.userBuffers = new Map();
      state.mixingInterval = setInterval(() => {
        const chunkSize = AUDIO_SETTINGS.rate * 2 * (AUDIO_SETTINGS.mixInterval / 1000);

        const users = Array.from(state.userBuffers.entries());
        if(users.length === 0) return;

        const userChunks = [];
        for(const [, user] of users) {
          const available = user.buffer.length - user.position;
          const bytesToRead = Math.min(available, chunkSize);
          let chunk;

          if(bytesToRead > 0) {
            chunk = user.buffer.subarray(user.position, user.position + bytesToRead);
            user.position += bytesToRead;
            if(user.position >= user.buffer.length) {
              user.buffer = Buffer.alloc(0);
              user.position = 0;
            }
          } else
            chunk = Buffer.alloc(0);

          if(chunk.length < chunkSize) {
            const padding = Buffer.alloc(chunkSize - chunk.length);
            chunk = Buffer.concat([chunk, padding]);
          }

          userChunks.push(chunk);
        }

        const mixed = Buffer.alloc(Math.max(...userChunks.map((c) => c.length)));
        mixed.fill(0);

        for(const chunk of userChunks) {
          for(let i = 0; i < chunk.length; i += 2) {
            const sample = chunk.readInt16LE(i);
            const current = mixed.readInt16LE(i);
            const mixed_sample = Math.max(-32768, Math.min(32767, sample + current));
            mixed.writeInt16LE(mixed_sample, i);
          }
        }

        state.recordingProcess.stdin.write(mixed);
      }, AUDIO_SETTINGS.mixInterval);

      const receiver = state.connection.receiver;

      receiver.speaking.on('start', (userId) => {
        const pcm = receiver.subscribe(userId, {
          end: {
            behavior: djsv.EndBehaviorType.AfterInactivity,
            duration: 100,
          },
        });

        // Decode Opus -> PCM using a stream decoder to avoid per-chunk instantiation
        const opusDecoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
        pcm.pipe(opusDecoder);

        if(!state.userBuffers.has(userId)) {
          state.userBuffers.set(userId, { buffer: Buffer.alloc(0), position: 0 });
        }

        const user = state.userBuffers.get(userId);

        opusDecoder.on('data', (pcmData) => {
          // Downmix stereo -> mono
          if(pcmData.length === 0) return;

          const mono = Buffer.alloc(pcmData.length / 2);
          for(let i = 0; i < mono.length; i += 2) {
            const left = pcmData.readInt16LE(i * 2);
            const right = pcmData.readInt16LE(i * 2 + 2);
            const mixed = Math.round((left + right) / 2);
            mono.writeInt16LE(mixed, i);
          }

          user.buffer = Buffer.concat([user.buffer, mono]);
        });

        opusDecoder.on('end', () => {
          console.log(`User ${userId} stopped speaking`);
        });
      });

      res.json({ 
        success: true, 
        message: `Recording started for meeting: ${name}`,
        meetingName: name
      });
    } catch(error) {
      console.error('Error starting recording:', error);
      res.status(500).json({ error: error.message });
    }
  });
};
