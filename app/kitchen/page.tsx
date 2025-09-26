'use client';
import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../components/Toast';

type SessionKey = '12:30'|'13:00'|'none';
type Week = { byDate: { date: string; sessions: { session: SessionKey; items: { itemId:string; name:string; qty:number }[]; details:{ itemId:string; name:string; people:string[] }[] }[] }[] };

export default function KitchenPage() {
  const { push } = useToast();
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [locationId, setLocationId] = useState(''); // set this from the signed-in user's profile in your layout or here
  const [data, setData] = useState<Week | null>(null);
  const [showNames, setShowNames] = useState(false);

  useEffect(() => {
    // default to current Mon–Fri
    const today = new Date();
    const day = today.getDay(); // 0..6
    const monday = new Date(today); monday.setDate(today.getDate() - ((day+6)%7));
    const friday = new Date(monday); friday.setDate(monday.getDate()+4);
    const fmt = (d:Date)=>d.toISOString().slice(0,10);
    setFrom(fmt(monday)); setTo(fmt(friday));
  }, []);

  async function load() {
    if (!from || !to || !locationId) return;
    const r = await fetch(`/api/kitchen-week?from=${from}&to=${to}&locationId=${locationId}`, { credentials:'include' });
    const j = await r.json();
    if (!r.ok) { push({ text: j.error || 'Load failed', kind:'error' }); return; }
    setData(j as Week);
  }
  useEffect(() => { void load(); }, [from,to,locationId]);

  function exportPdf() {
    if (!data) { push({ text: 'Nothing to export', kind:'error' }); return; }
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`Picking list ${from} to ${to}`, 40, 40);

    data.byDate.forEach((d, idxDate) => {
      if (idxDate>0) doc.addPage();
      doc.setFontSize(12);
      doc.text(new Date(d.date).toDateString(), 40, 60);

      (['12:30','13:00','none'] as const).forEach((s, idxS) => {
        const sess = d.sessions.find(x=>x.session===s);
        if (!sess || sess.items.length===0) return;
        doc.setFontSize(11);
        doc.text(`Session: ${s}`, 40, 80 + idxS*18);
        autoTable(doc, {
          startY: 90 + idxS*18,
          head: [['Item','Qty', showNames ? 'Names' : '']],
          body: sess.items.map(it => {
            const names = (sess.details.find(k=>k.itemId===it.itemId)?.people ?? []).join(', ');
            return [it.name, String(it.qty), showNames ? names : ''];
          }),
          styles: { fontSize: 9, cellPadding: 4 },
          theme: 'grid',
          headStyles: { fillColor: [40,40,40] },
          margin: { left: 40, right: 40 },
        });
      });
    });

    doc.save(`picking_${from}_to_${to}.pdf`);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <input type="date" className="border rounded px-2 py-2" value={from} onChange={e=>setFrom(e.target.value)} />
        <input type="date" className="border rounded px-2 py-2" value={to} onChange={e=>setTo(e.target.value)} />
        <input className="border rounded px-2 py-2 min-w-[340px]" placeholder="Location UUID" value={locationId} onChange={e=>setLocationId(e.target.value)} />
        <button className="border rounded px-3 py-2" onClick={()=>void load()}>Refresh</button>
        <button className="border rounded px-3 py-2" onClick={()=>setShowNames(v=>!v)}>{showNames?'Hide names':'Show names'}</button>
        <button className="border rounded px-3 py-2" onClick={()=>exportPdf()}>Export week PDF</button>
      </div>

      {data?.byDate.map(d => (
        <div key={d.date} className="border rounded-lg p-3 space-y-2">
          <div className="font-semibold">{new Date(d.date).toLocaleDateString()}</div>
          <div className="grid md:grid-cols-2 gap-3">
            {d.sessions.map(s => (
              <div key={s.session} className="border rounded p-2">
                <div className="text-sm font-medium mb-1">Session: {s.session}</div>
                {s.items.length === 0 ? (
                  <div className="text-sm text-gray-500">No orders</div>
                ) : (
                  <ul className="text-sm space-y-1">
                    {s.items.map(it => (
                      <li key={it.itemId}>
                        <span className="font-medium">{it.name}</span> — {it.qty}
                        {showNames && (
                          <div className="text-gray-600">
                            {(s.details.find(k=>k.itemId===it.itemId)?.people ?? []).join(', ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
