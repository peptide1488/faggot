import { useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

function formatBytes(bytes) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(1)} ${units[i]}`
}

function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export default function App() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedFormat, setSelectedFormat] = useState('')
  const [audioOnly, setAudioOnly] = useState(false)
  const [audioFormat, setAudioFormat] = useState('mp3')
  const [jobs, setJobs] = useState([])
  const [files, setFiles] = useState([])
  const [version, setVersion] = useState(null)
  const wsRef = useRef(null)

  useEffect(() => {
    fetchJobs()
    fetchFiles()
    fetchVersion()

    let closed = false
    let reconnectTimer = null

    function connectWs() {
      const ws = new WebSocket(`${WS_BASE}/ws/progress`)
      wsRef.current = ws
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'job_update') {
          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === data.job.id)
            if (idx === -1) return [data.job, ...prev]
            const copy = [...prev]
            copy[idx] = { ...copy[idx], ...data.job }
            return copy
          })
          if (data.job.status === 'completed') {
            fetchFiles()
          }
        }
      }
      ws.onclose = () => {
        // Reconnect after backend restarts or network blips (e.g. VPN toggles)
        if (!closed) {
          reconnectTimer = setTimeout(() => {
            fetchJobs()
            fetchFiles()
            connectWs()
          }, 2000)
        }
      }
    }
    connectWs()

    // Safety net: refresh job state even if websocket updates are missed
    const pollTimer = setInterval(fetchJobs, 5000)

    return () => {
      closed = true
      clearTimeout(reconnectTimer)
      clearInterval(pollTimer)
      wsRef.current?.close()
    }
  }, [])

  async function fetchJobs() {
    const res = await fetch(`${API_BASE}/api/jobs`)
    const data = await res.json()
    setJobs(data.reverse())
  }

  async function fetchFiles() {
    const res = await fetch(`${API_BASE}/api/files`)
    const data = await res.json()
    setFiles(data)
  }

  async function fetchVersion() {
    try {
      const res = await fetch(`${API_BASE}/api/version`)
      setVersion(await res.json())
    } catch {
      setVersion(null)
    }
  }

  async function handleFetchInfo() {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setInfo(null)
    setSelectedFormat('')
    try {
      const res = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to fetch info')
      }
      const data = await res.json()
      setInfo(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload(targetUrl) {
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl || url,
          format_id: audioOnly ? null : selectedFormat || null,
          audio_only: audioOnly,
          audio_format: audioFormat,
          playlist: !!targetUrl && targetUrl === url && info?.is_playlist,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to start download')
      }
      // Show the job immediately even if the websocket is down
      fetchJobs()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleCancel(jobId) {
    await fetch(`${API_BASE}/api/jobs/${jobId}/cancel`, { method: 'POST' })
    fetchJobs()
  }

  async function handleDelete(name) {
    await fetch(`${API_BASE}/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' })
    fetchFiles()
  }

  // Exclude only known audio-only formats; many sites report no vcodec at all
  const videoFormats = (info?.formats || []).filter((f) => f.vcodec !== 'none')

  return (
    <div className="container">
      <header>
        <h1>🎬 Omni Video Downloader</h1>
        <p className="subtitle">Download videos and audio from thousands of sites</p>
        <p className="version">
          {version ? (
            <>
              build <code>{version.revision}</code> · yt-dlp <code>{version.yt_dlp}</code>
            </>
          ) : (
            'backend offline'
          )}
        </p>
      </header>

      <section className="card">
        <div className="url-row">
          <input
            type="text"
            placeholder="Paste a video or playlist URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFetchInfo()}
          />
          <button onClick={handleFetchInfo} disabled={loading}>
            {loading ? 'Loading...' : 'Fetch'}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {info && !info.is_playlist && (
          <div className="info-panel">
            <div className="info-main">
              {info.thumbnail && <img src={info.thumbnail} alt="" className="thumb" />}
              <div>
                <h3>{info.title}</h3>
                <p className="meta">
                  {info.uploader} {info.duration ? `· ${formatDuration(info.duration)}` : ''}
                </p>
              </div>
            </div>

            <div className="options">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={audioOnly}
                  onChange={(e) => setAudioOnly(e.target.checked)}
                />
                Audio only
              </label>

              {audioOnly ? (
                <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value)}>
                  <option value="mp3">MP3</option>
                  <option value="m4a">M4A</option>
                  <option value="wav">WAV</option>
                  <option value="flac">FLAC</option>
                </select>
              ) : (
                <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)}>
                  <option value="">Best quality</option>
                  {videoFormats.map((f) => (
                    <option key={f.format_id} value={f.format_id}>
                      {f.resolution || f.format_note} · {f.ext}
                      {f.filesize ? ` · ${formatBytes(f.filesize)}` : ''}
                    </option>
                  ))}
                </select>
              )}

              <button className="primary" onClick={() => handleDownload(url)}>
                Download
              </button>
            </div>
          </div>
        )}

        {info && info.is_playlist && (
          <div className="info-panel">
            <h3>📃 {info.title}</h3>
            <p className="meta">{info.entry_count} videos in playlist</p>
            <div className="options">
              <button className="primary" onClick={() => handleDownload(url)}>
                Download entire playlist
              </button>
            </div>
            <ul className="playlist-entries">
              {info.entries.map((e, idx) => (
                <li key={idx}>
                  <span className="entry-title">{e.title}</span>
                  {e.duration ? <span className="meta">{formatDuration(e.duration)}</span> : null}
                  <button onClick={() => handleDownload(e.url)}>Download</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {jobs.length > 0 && (
        <section className="card">
          <h2>Downloads</h2>
          <ul className="jobs-list">
            {jobs.map((job) => (
              <li key={job.id} className="job-item">
                <div className="job-info">
                  <span className="job-name">{job.filename || job.url}</span>
                  <span className={`status status-${job.status}`}>{job.status}</span>
                  {['queued', 'downloading', 'processing'].includes(job.status) && (
                    <button className="danger small" onClick={() => handleCancel(job.id)}>
                      Cancel
                    </button>
                  )}
                </div>
                {job.status === 'downloading' && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${job.percent}%` }} />
                  </div>
                )}
                {job.status === 'downloading' && (
                  <div className="job-meta">
                    {job.percent}%
                    {job.speed ? ` · ${formatBytes(job.speed)}/s` : ''}
                    {job.eta ? ` · ETA ${job.eta}s` : ''}
                  </div>
                )}
                {job.status === 'error' && <div className="job-meta error">{job.error}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {files.length > 0 && (
        <section className="card">
          <h2>Downloaded Files</h2>
          <ul className="files-list">
            {files.map((f) => (
              <li key={f.name} className="file-item">
                <span className="file-name">{f.name}</span>
                <span className="meta">{formatBytes(f.size)}</span>
                <div className="file-actions">
                  <a href={`${API_BASE}/api/files/${encodeURIComponent(f.name)}`} download>
                    <button>Save</button>
                  </a>
                  <button className="danger" onClick={() => handleDelete(f.name)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
