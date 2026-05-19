import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

const COLUMNS = [
  { id: 'new',     label: '🆕 New'     },
  { id: 'applied', label: '📤 Applied' },
  { id: 'replied', label: '💬 Replied' },
  { id: 'won',     label: '🏆 Won'     },
  { id: 'lost',    label: '❌ Lost'    },
];

const STATUS_ACTIONS = {
  new:     ['applied', 'skip', 'lost'],
  applied: ['replied', 'won', 'lost'],
  replied: ['won', 'lost'],
  won:     [],
  lost:    [],
  skip:    [],
};

const ACTION_LABELS = {
  applied: '📤 Applied',
  replied: '💬 Replied',
  won:     '🏆 Won',
  lost:    '❌ Lost',
  skip:    '⏭ Skip',
};

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
        background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
        color: copied ? 'var(--success)' : 'var(--primary)', fontSize: '0.72rem', fontWeight: 600 }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy proposal'}
    </button>
  );
}

function scoreDisplay(score) {
  const color = score >= 70 ? '#4caf80' : score >= 50 ? '#f0a050' : '#627a90';
  return React.createElement('span', { style: { fontWeight: 700, color } }, (score ?? '—') + '/100');
}

function JobCard({ job, onStatus }) {
  const [open, setOpen] = useState(false);
  const actions = STATUS_ACTIONS[job.status] || [];
  const budget = job.budget_min
    ? job.budget_type === 'hourly'
      ? `$${job.budget_min}–${job.budget_max ?? '?'}/hr`
      : `$${Number(job.budget_min).toLocaleString()} fixed`
    : 'Budget TBD';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '12px', marginBottom: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {job.title}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 2 }}>
            {budget} · {scoreDisplay(job.relevance_score)} · {timeAgo(job.created_at)}
          </div>
        </div>
        <a href={job.url} target="_blank" rel="noreferrer"
          style={{ color: 'var(--text3)', flexShrink: 0 }}>
          <ExternalLink size={13} />
        </a>
      </div>

      {/* Skills */}
      {(job.skills || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {job.skills.slice(0, 5).map((s) => (
            <span key={s} style={{ fontSize: '0.65rem', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 100, padding: '2px 7px', color: 'var(--text3)' }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Proposal (expandable) */}
      {job.proposal && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setOpen(!open)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none',
              color: 'var(--primary)', fontSize: '0.72rem', fontWeight: 600 }}>
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Proposal draft
          </button>
          {open && (
            <div style={{ marginTop: 6, padding: 10, background: 'var(--surface2)',
              borderRadius: 6, border: '1px solid var(--border)' }}>
              <pre style={{ fontSize: '0.75rem', color: 'var(--text2)', whiteSpace: 'pre-wrap',
                fontFamily: 'inherit', lineHeight: 1.55 }}>
                {job.proposal}
              </pre>
              <div style={{ marginTop: 8 }}>
                <CopyBtn text={job.proposal} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {actions.map((a) => (
            <button key={a} onClick={() => onStatus(job.id, a)}
              style={{ fontSize: '0.7rem', fontWeight: 600, padding: '4px 10px',
                borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text2)' }}>
              {ACTION_LABELS[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [jobs, setJobs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCol, setActiveCol] = useState('new');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const { jobs: data } = await res.json();
      setJobs(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id, status) => {
    await fetch('/api/jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status } : j));
  };

  const counts = COLUMNS.reduce((acc, col) => {
    acc[col.id] = jobs.filter((j) => j.status === col.id).length;
    return acc;
  }, {});

  const visible = jobs.filter((j) => j.status === activeCol)
    .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>🎯 Gig Hunter</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Upwork pipeline</div>
        </div>
        <button onClick={load} style={{ background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', color: 'var(--text2)' }}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Column tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
        {COLUMNS.map((col) => (
          <button key={col.id} onClick={() => setActiveCol(col.id)}
            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem',
              fontWeight: 600, border: '1px solid var(--border)',
              background: activeCol === col.id ? 'var(--primary)' : 'var(--surface)',
              color: activeCol === col.id ? '#fff' : 'var(--text2)' }}>
            {col.label} {counts[col.id] > 0 && <span style={{ opacity: 0.75 }}>({counts[col.id]})</span>}
          </button>
        ))}
      </div>

      {/* Job cards */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', paddingTop: 40 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', paddingTop: 40 }}>
          No jobs in this column yet.
        </div>
      ) : (
        visible.map((job) => (
          <JobCard key={job.id} job={job} onStatus={handleStatus} />
        ))
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
