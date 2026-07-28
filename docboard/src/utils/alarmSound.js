const SOUND_PATTERNS = {
  gentle: [
    { frequency: 523, start: 0, duration: 0.22, volume: 0.12 },
    { frequency: 659, start: 0.28, duration: 0.28, volume: 0.1 }
  ],
  chime: [
    { frequency: 659, start: 0, duration: 0.18, volume: 0.14 },
    { frequency: 784, start: 0.2, duration: 0.18, volume: 0.13 },
    { frequency: 988, start: 0.4, duration: 0.34, volume: 0.11 }
  ],
  urgent: [
    { frequency: 880, start: 0, duration: 0.16, volume: 0.16 },
    { frequency: 880, start: 0.24, duration: 0.16, volume: 0.16 },
    { frequency: 880, start: 0.48, duration: 0.26, volume: 0.16 }
  ]
};

let alarmAudioContext = null;

function getAudioContext() {
  if (alarmAudioContext) return alarmAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  alarmAudioContext = new AudioContextClass();
  return alarmAudioContext;
}

export async function playAlarmSound(soundKey = 'gentle') {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === 'suspended') {
    await context.resume();
  }

  const pattern = SOUND_PATTERNS[soundKey] || SOUND_PATTERNS.gentle;
  const baseTime = context.currentTime + 0.03;

  for (const note of pattern) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = baseTime + note.start;
    const stopAt = startAt + note.duration;

    oscillator.type = soundKey === 'gentle' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(note.frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(note.volume, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.02);
  }
  return true;
}

export const ALARM_SOUNDS = [
  { key: 'gentle', label: 'Lembut', description: 'Dua nada tenang' },
  { key: 'chime', label: 'Chime', description: 'Tiga nada jernih' },
  { key: 'urgent', label: 'Penting', description: 'Tiga bunyi tegas' }
];
