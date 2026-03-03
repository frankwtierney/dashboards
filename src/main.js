import React, { useMemo, useState, useEffect } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

const STORAGE_KEY = 'ln-lounge-latest-upload-v1';
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      out.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }

  out.push(current.trim());
  return out;
}

function csvToRecords(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    building: headers.indexOf('building'),
    timestamp: headers.indexOf('timestamp'),
    dayOfWeek: headers.indexOf('dayofweek'),
    timeOnly: headers.indexOf('timeonly')
  };

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const timestampRaw = idx.timestamp >= 0 ? cols[idx.timestamp] : '';
    const dateObj = timestampRaw ? new Date(timestampRaw) : null;

    const dayFromDate = dateObj && !Number.isNaN(dateObj.getTime())
      ? dateObj.toLocaleString('en-US', { weekday: 'long' })
      : '';

    const dayOfWeek = idx.dayOfWeek >= 0 ? cols[idx.dayOfWeek] || dayFromDate : dayFromDate;

    const timeOnly = idx.timeOnly >= 0 ? cols[idx.timeOnly] : '';

    const hour = (() => {
      if (dateObj && !Number.isNaN(dateObj.getTime())) return dateObj.getHours();
      const match = timeOnly.match(/(\d{1,2})/);
      return match ? Number(match[1]) : null;
    })();

    return {
      building: idx.building >= 0 ? cols[idx.building] || 'Unknown' : 'Unknown',
      timestamp: timestampRaw,
      dateObj: dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj : null,
      dayOfWeek: dayOfWeek || 'Unknown',
      timeOnly,
      hour
    };
  });
}

function formatDate(dateObj) {
  if (!dateObj) return 'N/A';
  return dateObj.toLocaleString();
}

function maxCount(entries) {
  return Math.max(...entries.map((entry) => entry.count), 1);
}

function App() {
  const [records, setRecords] = useState([]);
  const [latestUploadAt, setLatestUploadAt] = useState(null);
  const [fileName, setFileName] = useState('No local upload yet');
  const [buildingFilter, setBuildingFilter] = useState('All');
  const [dayFilter, setDayFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState('Load a SharePoint export CSV to start.');

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.records?.length) {
          setRecords(parsed.records.map((r) => ({ ...r, dateObj: r.dateObj ? new Date(r.dateObj) : null })));
          setLatestUploadAt(parsed.latestUploadAt ? new Date(parsed.latestUploadAt) : null);
          setFileName(parsed.fileName || 'latest-upload.csv');
          setStatus('Loaded latest browser-saved export.');
          return;
        }
      } catch {
        // ignore and continue with hosted fallback
      }
    }

    fetch('./uploads/index.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest) => {
        if (!manifest?.latestFile) return null;
        return fetch(`./uploads/${manifest.latestFile}`)
          .then((res) => (res.ok ? res.text() : null))
          .then((text) => ({ manifest, text }));
      })
      .then((result) => {
        if (!result?.text) return;
        const parsedRecords = csvToRecords(result.text);
        setRecords(parsedRecords);
        setFileName(result.manifest.latestFile);
        setLatestUploadAt(new Date(result.manifest.uploadedAt));
        setStatus('Loaded committed fallback export from /uploads.');
      })
      .catch(() => {
        setStatus('No existing upload found. Drag-and-drop your latest export CSV below.');
      });
  }, []);

  function persistUpload(nextRecords, name) {
    const now = new Date();
    setRecords(nextRecords);
    setLatestUploadAt(now);
    setFileName(name);
    setStatus(`Loaded ${nextRecords.length.toLocaleString()} attendance rows from ${name}.`);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        records: nextRecords,
        latestUploadAt: now.toISOString(),
        fileName: name
      })
    );
  }

  async function onFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsedRecords = csvToRecords(text);
    persistUpload(parsedRecords, file.name);
  }

  const uniqueBuildings = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.building))).sort()], [records]);
  const uniqueDays = useMemo(() => ['All', ...DAY_ORDER.filter((day) => records.some((r) => r.dayOfWeek === day))], [records]);

  const filtered = useMemo(() => records.filter((r) => {
    if (buildingFilter !== 'All' && r.building !== buildingFilter) return false;
    if (dayFilter !== 'All' && r.dayOfWeek !== dayFilter) return false;

    if (fromDate || toDate) {
      if (!r.dateObj) return false;
      const dateOnly = new Date(r.dateObj.getFullYear(), r.dateObj.getMonth(), r.dateObj.getDate());
      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`);
        if (dateOnly < from) return false;
      }
      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`);
        if (r.dateObj > to) return false;
      }
    }

    return true;
  }), [records, buildingFilter, dayFilter, fromDate, toDate]);

  const byBuilding = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => map.set(r.building, (map.get(r.building) || 0) + 1));
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map(DAY_ORDER.map((d) => [d, 0]));
    filtered.forEach((r) => {
      if (map.has(r.dayOfWeek)) map.set(r.dayOfWeek, map.get(r.dayOfWeek) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
  }, [filtered]);

  const byHour = useMemo(() => {
    const map = new Map(Array.from({ length: 24 }, (_, hour) => [hour, 0]));
    filtered.forEach((r) => {
      if (Number.isInteger(r.hour)) map.set(r.hour, map.get(r.hour) + 1);
    });
    return Array.from(map.entries()).map(([hour, count]) => ({
      label: `${String(hour).padStart(2, '0')}:00`,
      count,
      hour
    }));
  }, [filtered]);

  const totalAttendance = filtered.length;
  const averagePerBuilding = byBuilding.length ? totalAttendance / byBuilding.length : 0;
  const peakBuilding = byBuilding[0];
  const peakDay = [...byDay].sort((a, b) => b.count - a.count)[0];
  const peakHour = [...byHour].sort((a, b) => b.count - a.count)[0];

  return (
    React.createElement('main', { className: 'app' },
      React.createElement('header', { className: 'top-bar' },
        React.createElement('div', null,
          React.createElement('p', { className: 'eyebrow' }, 'UB Late-Night Lounge Dashboard'),
          React.createElement('h1', null, 'LN QR Code Logs Analytics')
        ),
        React.createElement('div', { className: 'upload-meta' },
          React.createElement('p', null, `Latest dataset: ${fileName}`),
          React.createElement('p', null, `Uploaded: ${formatDate(latestUploadAt)}`)
        )
      ),

      React.createElement('section', { className: 'panel uploader' },
        React.createElement('h2', null, 'Data Source'),
        React.createElement('p', null, status),
        React.createElement('label', { className: 'upload-dropzone' },
          React.createElement('input', { type: 'file', accept: '.csv,text/csv', onChange: onFileChange }),
          React.createElement('span', null, 'Drag + drop or click to upload latest SharePoint export CSV')
        ),
        React.createElement('p', { className: 'muted' }, 'Tip: this app saves your latest upload in-browser and always loads it first.')
      ),

      React.createElement('section', { className: 'panel filters' },
        React.createElement('h2', null, 'Quick Filters'),
        React.createElement('div', { className: 'filter-grid' },
          React.createElement('label', null, 'Building',
            React.createElement('select', { value: buildingFilter, onChange: (e) => setBuildingFilter(e.target.value) },
              uniqueBuildings.map((b) => React.createElement('option', { key: b, value: b }, b))
            )
          ),
          React.createElement('label', null, 'Day of Week',
            React.createElement('select', { value: dayFilter, onChange: (e) => setDayFilter(e.target.value) },
              uniqueDays.map((d) => React.createElement('option', { key: d, value: d }, d))
            )
          ),
          React.createElement('label', null, 'From',
            React.createElement('input', { type: 'date', value: fromDate, onChange: (e) => setFromDate(e.target.value) })
          ),
          React.createElement('label', null, 'To',
            React.createElement('input', { type: 'date', value: toDate, onChange: (e) => setToDate(e.target.value) })
          )
        )
      ),

      React.createElement('section', { className: 'stats-grid' },
        React.createElement('article', { className: 'stat' }, React.createElement('h3', null, 'Total Attendance'), React.createElement('p', null, totalAttendance.toLocaleString())),
        React.createElement('article', { className: 'stat' }, React.createElement('h3', null, 'Avg / Building'), React.createElement('p', null, averagePerBuilding.toFixed(1))),
        React.createElement('article', { className: 'stat' }, React.createElement('h3', null, 'Peak Building'), React.createElement('p', null, peakBuilding ? `${peakBuilding.label} (${peakBuilding.count})` : 'N/A')),
        React.createElement('article', { className: 'stat' }, React.createElement('h3', null, 'Peak Day / Hour'), React.createElement('p', null, `${peakDay?.label || 'N/A'} · ${peakHour?.label || 'N/A'}`))
      ),

      React.createElement('section', { className: 'charts-grid' },
        React.createElement('article', { className: 'panel' },
          React.createElement('h2', null, 'Attendance by Building'),
          React.createElement('ul', { className: 'bar-list' },
            byBuilding.map((entry) => React.createElement('li', { key: entry.label },
              React.createElement('span', { className: 'label' }, entry.label),
              React.createElement('div', { className: 'bar-track' },
                React.createElement('div', {
                  className: 'bar-fill',
                  style: { width: `${(entry.count / maxCount(byBuilding)) * 100}%` }
                })
              ),
              React.createElement('span', { className: 'value' }, entry.count)
            ))
          )
        ),
        React.createElement('article', { className: 'panel' },
          React.createElement('h2', null, 'Trends by Day of Week'),
          React.createElement('ul', { className: 'bar-list compact' },
            byDay.map((entry) => React.createElement('li', { key: entry.label },
              React.createElement('span', { className: 'label' }, entry.label.slice(0, 3)),
              React.createElement('div', { className: 'bar-track' },
                React.createElement('div', {
                  className: 'bar-fill accent',
                  style: { width: `${(entry.count / maxCount(byDay)) * 100}%` }
                })
              ),
              React.createElement('span', { className: 'value' }, entry.count)
            ))
          )
        ),
        React.createElement('article', { className: 'panel' },
          React.createElement('h2', null, 'Peak Times (Hourly)'),
          React.createElement('div', { className: 'hour-grid' },
            byHour.map((entry) => React.createElement('div', {
              key: entry.label,
              className: `hour-cell ${entry.count === peakHour?.count && entry.count > 0 ? 'is-peak' : ''}`
            },
            React.createElement('span', null, entry.label),
            React.createElement('strong', null, entry.count)
            ))
          )
        )
      )
    )
  );
}

createRoot(document.getElementById('root')).render(React.createElement(App));
