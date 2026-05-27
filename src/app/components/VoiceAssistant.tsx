import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Mic, MicOff, Loader2, Volume2, Send } from 'lucide-react';
import { localApi } from '../utils/api';
import { storage } from '../utils/storage';

type Phase = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
interface Message { role: 'user' | 'assistant'; text: string; }
interface VoiceAssistantProps {
  pageKey: string;
  pageLabel: string;
}

const SILENCE_THRESHOLD  = 14;     // 提高門檻：過濾環境音（冷氣/風扇）
const SILENCE_MS         = 2200;
const SPEECH_ONSET_MS    = 200;    // RMS 必須持續超過門檻 200ms 才算開始講話
const MIN_SPEECH_MS      = 800;    // 最短錄音時間才送出
const MAX_RECORD_MS      = 30_000;
const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

async function resampleTo16k(samples: Float32Array, originalRate: number): Promise<Float32Array> {
  if (originalRate === 16000) return samples;
  const offCtx = new OfflineAudioContext(1, Math.ceil(samples.length * 16000 / originalRate), 16000);
  const buf = offCtx.createBuffer(1, samples.length, originalRate);
  buf.copyToChannel(samples, 0);
  const src = offCtx.createBufferSource();
  src.buffer = buf;
  src.connect(offCtx.destination);
  src.start();
  const rendered = await offCtx.startRendering();
  return rendered.getChannelData(0);
}

function normalizeAudio(samples: Float32Array): Float32Array {
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (peak < 0.01 || peak >= 1.0) return samples;
  const scale = 0.9 / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buf  = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const str  = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); str(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function VoiceAssistant({ pageKey, pageLabel }: VoiceAssistantProps) {
  const [phase,      setPhase]      = useState<Phase>('idle');
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [textInput,  setTextInput]  = useState('');

  const phaseRef   = useRef<Phase>('idle');
  const stopRef    = useRef<((submit: boolean) => void) | null>(null);
  const animRef    = useRef(0);
  const startRef   = useRef<() => void>(() => {});
  const queryRef   = useRef<(blob: Blob) => void>(() => {});

  const updatePhase = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const handleQuery = async (blob: Blob) => {
    updatePhase('processing');
    try {
      const { text } = await localApi.transcribe(blob);
      const query = text.trim();
      if (!query) { setTimeout(() => startRef.current(), 300); return; }

      setMessages(prev => [...prev, { role: 'user', text: query }]);
      const vaultPath = storage.getConfig().notePath;
      const { answer } = await localApi.voiceChat(query, vaultPath, { pageKey, pageLabel }, messages);
      setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
      updatePhase('speaking');

      const utt = new SpeechSynthesisUtterance(answer);
      utt.lang = 'zh-TW'; utt.rate = 1.0;
      const resume = () => { if (phaseRef.current === 'speaking') setTimeout(() => startRef.current(), 400); };
      utt.onend = resume; utt.onerror = resume;
      window.speechSynthesis.speak(utt);
      startBargeinMonitor();
    } catch (err: any) {
      setErrorMsg(err.message || '發生錯誤，請稍後再試。');
      updatePhase('error');
    }
  };

  const handleTextQuery = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || phase === 'processing') return;
    setTextInput('');
    stopRef.current?.(false);
    bargeinRecRef.current?.abort();
    window.speechSynthesis.cancel();
    updatePhase('processing');
    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    try {
      const vaultPath = storage.getConfig().notePath;
      const { answer } = await localApi.voiceChat(trimmed, vaultPath, { pageKey, pageLabel }, messages);
      setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
      updatePhase('speaking');
      const utt = new SpeechSynthesisUtterance(answer);
      utt.lang = 'zh-TW'; utt.rate = 1.0;
      const resume = () => { if (phaseRef.current === 'speaking') setTimeout(() => startRef.current(), 400); };
      utt.onend = resume; utt.onerror = resume;
      window.speechSynthesis.speak(utt);
      startBargeinMonitor();
    } catch (err: any) {
      setErrorMsg(err.message || '發生錯誤，請稍後再試。');
      updatePhase('error');
    }
  };

  const bargeinRecRef = useRef<any>(null);

  const startBargeinMonitor = () => {
    if (!SpeechRecognitionAPI) return;

    const listen = () => {
      if (phaseRef.current !== 'speaking') return;
      const rec = new SpeechRecognitionAPI();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = true;
      bargeinRecRef.current = rec;

      rec.onresult = (e: any) => {
        const text = Array.from(e.results as any[])
          .map((r: any) => r[0].transcript.toLowerCase()).join(' ');
        if (text.includes('hey jarvis') || text.includes('jarvis')) {
          rec.abort();
          window.speechSynthesis.cancel();
          startRef.current();
        }
      };

      rec.onend = () => { if (phaseRef.current === 'speaking') setTimeout(listen, 200); };
      rec.onerror = () => { if (phaseRef.current === 'speaking') setTimeout(listen, 500); };

      try { rec.start(); } catch { setTimeout(listen, 1000); }
    };

    listen();
  };

  const startListening = async () => {
    if (phaseRef.current === 'listening') return; // 防止重複啟動
    updatePhase('listening');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
    catch { setErrorMsg('無法取得麥克風權限。'); updatePhase('error'); return; }

    const ctx        = new AudioContext();
    const sampleRate = ctx.sampleRate;
    const source     = ctx.createMediaStreamSource(stream);
    const analyser   = ctx.createAnalyser(); analyser.fftSize = 512;
    source.connect(analyser);

    // ScriptProcessorNode: capture raw PCM (muted output to prevent feedback)
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const silencer  = ctx.createGain(); silencer.gain.value = 0;
    source.connect(processor); processor.connect(silencer); silencer.connect(ctx.destination);
    const pcm: Float32Array[] = [];
    processor.onaudioprocess = (e) => {
      if (phaseRef.current === 'listening') pcm.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    let submitted = false; // 防止 silence detection + MAX_RECORD_MS 同時觸發導致重複送出

    const teardown = (submit: boolean) => {
      if (submitted) return; // 已經送出過，直接忽略
      stopRef.current = null;
      cancelAnimationFrame(animRef.current);
      setAudioLevel(0);
      processor.disconnect(); source.disconnect();
      stream.getTracks().forEach(t => t.stop());
      ctx.close();

      if (!submit || pcm.length === 0) return;
      const total  = pcm.reduce((s, c) => s + c.length, 0);
      const merged = new Float32Array(total);
      let   off    = 0; for (const c of pcm) { merged.set(c, off); off += c.length; }
      if (merged.length > sampleRate * 0.8 && phaseRef.current === 'listening') {
        submitted = true;
        resampleTo16k(merged, sampleRate).then(resampled => {
          const normalized = normalizeAudio(resampled);
          queryRef.current(encodeWAV(normalized, 16000));
        });
      } else if (phaseRef.current === 'listening') {
        setTimeout(() => startRef.current(), 300);
      }
    };
    stopRef.current = teardown;

    // Silence detection loop
    const data = new Uint8Array(analyser.frequencyBinCount);
    let hasSpoken        = false;
    let silenceStart:     number | null = null;
    let speechOnsetStart: number | null = null;
    const t0 = Date.now();

    const tick = () => {
      if (phaseRef.current !== 'listening') { teardown(false); return; }
      analyser.getByteTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length);
      setAudioLevel(Math.min(100, (rms / 15) * 100));
      if (rms > SILENCE_THRESHOLD) {
        if (speechOnsetStart === null) speechOnsetStart = Date.now();
        if (Date.now() - speechOnsetStart >= SPEECH_ONSET_MS) {
          hasSpoken = true;
          silenceStart = null;
        }
      } else {
        speechOnsetStart = null;
        if (hasSpoken) {
          if (silenceStart === null) silenceStart = Date.now();
          if (Date.now() - silenceStart > SILENCE_MS && Date.now() - t0 > MIN_SPEECH_MS) {
            teardown(true); return;
          }
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    setTimeout(() => { if (phaseRef.current === 'listening') teardown(true); }, MAX_RECORD_MS);
  };

  useEffect(() => { startRef.current = startListening; queryRef.current = handleQuery; });

  useEffect(() => {
    const t = setTimeout(() => startRef.current(), 500);
    return () => { clearTimeout(t); stopRef.current?.(false); window.speechSynthesis.cancel(); };
  }, []);

  const msgEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleManualStop = () => {
    updatePhase('idle');
    stopRef.current?.(false);
    bargeinRecRef.current?.abort();
    window.speechSynthesis.cancel();
  };

  const label: Record<Phase, string> = {
    idle: '等待中', listening: '聆聽中…', processing: '辨識中…', speaking: '播放中…', error: '發生錯誤',
  };

  return (
    <div className="mt-2 rounded-xl border border-indigo-100 bg-white flex flex-col overflow-hidden" style={{ maxHeight: 340 }}>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[60px]">
        {messages.length === 0 && phase !== 'error' && (
          <p className="text-center text-gray-400 text-xs py-2">說出您的問題…</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
              m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
            }`}>{m.text}</div>
          </div>
        ))}
        {phase === 'error' && <p className="text-xs text-red-600 px-1">{errorMsg}</p>}
        <div ref={msgEnd} />
      </div>

      {phase === 'listening' && (
        <div className="px-3 pb-1 shrink-0">
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-400 rounded-full transition-all duration-75" style={{ width: `${audioLevel}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-gray-100 bg-gray-50 shrink-0">
        <input
          type="text"
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleTextQuery(textInput); }}
          placeholder="或直接打字…"
          className="flex-1 text-xs rounded-lg border border-gray-200 px-2 py-1 outline-none focus:border-indigo-400 bg-white"
        />
        <button
          onClick={() => handleTextQuery(textInput)}
          disabled={!textInput.trim() || phase === 'processing'}
          className="p-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="size-3" />
        </button>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {phase === 'listening' && <span className="relative flex size-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full size-2 bg-red-500" /></span>}
          {phase === 'processing' && <Loader2 className="size-3 animate-spin text-indigo-500" />}
          {phase === 'speaking'   && <Volume2 className="size-3 text-indigo-500 animate-pulse" />}
          {(phase === 'idle' || phase === 'error') && <Mic className="size-3 text-gray-400" />}
          {label[phase]}
        </div>
        <div className="flex gap-1.5">
          {phase === 'error' && (
            <button onClick={() => { setErrorMsg(''); startListening(); }} className="px-2 py-1 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">重試</button>
          )}
          {(phase === 'listening' || phase === 'speaking') && (
            <button onClick={handleManualStop} className="px-2 py-1 text-xs rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 flex items-center gap-1">
              <MicOff className="size-3" /> 停止
            </button>
          )}
          {phase === 'idle' && (
            <button onClick={startListening} className="px-2 py-1 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1">
              <Mic className="size-3" /> 說話
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
