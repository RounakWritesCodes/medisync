'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

interface VoiceInputProps {
  onResult: (text: string, symptoms: string[]) => void
  onError?: (error: string) => void
  disabled?: boolean
}

export default function VoiceInput({ onResult, onError, disabled }: VoiceInputProps) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

  // Live audio level visualization
  const updateLevel = useCallback(() => {
    if (!analyserRef.current) return
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(data)
    const avg = data.reduce((a, b) => a + b, 0) / data.length
    setAudioLevel(Math.min(avg / 128, 1))
    animFrameRef.current = requestAnimationFrame(updateLevel)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,      // High sample rate — ffmpeg will downsample to 16kHz
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,  // Normalizes volume in-browser
        },
      })

      streamRef.current = stream

      // Set up audio analyser for waveform visualization
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyserRef.current = analyser

      // Prefer opus codec (best quality for voice)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64000,  // 64kbps — good balance of quality and size
      })

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks and cleanup audio context
        stream.getTracks().forEach(track => track.stop())
        audioCtx.close()
        analyserRef.current = null
        setAudioLevel(0)
        cancelAnimationFrame(animFrameRef.current)

        setProcessing(true)

        try {
          // Use the recorded mimeType for the blob
          const audioBlob = new Blob(chunksRef.current, { type: mimeType })
          const result = await api.speechToText(audioBlob)
          onResult(result.text, result.symptoms)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Speech recognition failed'
          onError?.(message)
        } finally {
          setProcessing(false)
        }
      }

      // Collect data every 500ms for better quality
      mediaRecorder.start(500)
      setRecording(true)

      // Start waveform animation
      updateLevel()
    } catch (err) {
      const message = err instanceof Error
        ? err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone access and try again.'
          : err.name === 'NotFoundError'
            ? 'No microphone found. Please connect a microphone.'
            : err.message
        : 'Could not access microphone'
      onError?.(message)
    }
  }, [onResult, onError, updateLevel])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }, [recording])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        disabled={disabled || processing}
        title={recording ? 'Stop recording' : 'Describe symptoms by voice'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: `2px solid ${recording ? '#ef4444' : 'var(--color-primary)'}`,
          background: recording ? '#fef2f2' : processing ? 'var(--color-primary-container)' : 'white',
          color: recording ? '#ef4444' : 'var(--color-primary)',
          cursor: disabled || processing ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          flexShrink: 0,
          opacity: disabled ? 0.5 : 1,
          animation: recording ? 'pulse 1.5s ease-in-out infinite' : 'none',
          boxShadow: recording ? `0 0 ${8 + audioLevel * 20}px ${2 + audioLevel * 8}px rgba(239, 68, 68, ${0.2 + audioLevel * 0.3})` : 'none',
        }}
      >
        {processing ? (
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
        ) : recording ? (
          <MicOff size={22} />
        ) : (
          <Mic size={22} />
        )}
      </button>

      {/* Live waveform visualization */}
      {recording && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          height: '32px',
          padding: '0 4px',
        }}>
          {Array.from({ length: 12 }).map((_, i) => {
            const offset = i / 12
            const height = Math.max(4, audioLevel * 28 * Math.sin(Date.now() / 200 + offset * Math.PI * 2) ** 2 + 4)
            return (
              <div
                key={i}
                style={{
                  width: '3px',
                  height: `${height}px`,
                  borderRadius: '2px',
                  background: `rgba(239, 68, 68, ${0.4 + audioLevel * 0.6})`,
                  transition: 'height 0.1s ease',
                }}
              />
            )
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
