import { useId, useState } from 'react';
import { ArrowUpRight, Info } from 'lucide-react';

export default function BandPlot({ hopping, filling, onHoppingChange, onFillingChange }: { hopping: number; filling: number; onHoppingChange: (value: number) => void; onFillingChange: (value: number) => void }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const left = 72, right = 660, top = 75, bottom = 410, width = right - left, height = bottom - top;
  const toX = (k: number) => left + (k + 1) / 2 * width;
  const toY = (energy: number) => top + (4 - energy) / 8 * height;
  const points = Array.from({ length: 241 }, (_, i) => {
    const k = -1 + i / 120;
    return { k, x: toX(k), y: toY(-2 * hopping * Math.cos(Math.PI * k)) };
  });
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const fermiK = filling / 2;
  const fermiRaw = -2 * hopping * Math.cos(Math.PI * fermiK);
  const fermi = Math.abs(fermiRaw) < 1e-9 ? 0 : fermiRaw;
  const area = [...points.filter(p => p.k >= -fermiK && p.k <= fermiK), { x: toX(fermiK), y: toY(fermi) }].map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ` L${toX(fermiK)},${bottom} L${toX(-fermiK)},${bottom} Z`;
  const visiblePoints = points.filter(p => p.k >= -fermiK && p.k <= fermiK);
  const fermiY = toY(fermi);
  return <div className="band-visualization">
    <div className="plot-heading"><span className="micro">ONE ORBITAL. ONE CHAIN. MANY STATES.</span><span className="plot-model-badge">1D TIGHT-BINDING</span></div>
    <svg className="band-plot" viewBox="0 0 730 500" role="img" aria-label={`Tight-binding dispersion E(k) = minus 2t cos(ka), with hopping ${hopping.toFixed(1)} electron-volts and ${filling.toFixed(2)} electrons per site. ${filling === 2 ? 'Band full; an insulator in this one-band model.' : filling === 0 ? 'Band empty.' : 'Partially filled band; available states near the Fermi level.'}`} onPointerLeave={() => setHover(null)}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9aadc7" stopOpacity=".2"/><stop offset="1" stopColor="#9aadc7" stopOpacity=".015"/></linearGradient>
        <linearGradient id={`${id}-line`}><stop offset="0" stopColor="#5e667a"/><stop offset=".5" stopColor="#d0c8e9"/><stop offset="1" stopColor="#73738e"/></linearGradient>
        <filter id={`${id}-glow`}><feGaussianBlur stdDeviation="3"/></filter>
      </defs>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <g key={i}><line x1={left} y1={top + i * height / 8} x2={right} y2={top + i * height / 8} stroke="#cbd6c5" strokeOpacity={i === 4 ? '0.18' : '0.065'} strokeDasharray={i === 4 ? '3 6' : ''}/><text x="54" y={top + i * height / 8 + 4} fill="#758079" fontSize="10" textAnchor="end">{4 - i}</text></g>)}
      {[-1, -0.5, 0, 0.5, 1].map(k => <g key={k}><line x1={toX(k)} y1={top} x2={toX(k)} y2={bottom} stroke="#cbd6c5" strokeOpacity=".06"/><line x1={toX(k)} y1={bottom} x2={toX(k)} y2={bottom + 6} stroke="#889a8e" strokeOpacity=".5"/><text x={toX(k)} y={bottom + 25} fill="#929d94" fontSize="11" textAnchor="middle">{k === -1 ? '−π/a' : k === 1 ? 'π/a' : k === 0 ? 'Γ' : k < 0 ? '−π/2a' : 'π/2a'}</text></g>)}
      <text x="17" y="47" fill="#b7c3b7" fontSize="11">E (eV)</text><text x={right + 12} y={bottom + 26} fill="#8b968f" fontSize="12">k</text>
      <path d={area} fill={`url(#${id}-fill)`}/>
      <path d={line} fill="none" stroke="#aca3d7" strokeWidth="6" opacity=".16" filter={`url(#${id}-glow)`}/>
      <path d={line} fill="none" stroke={`url(#${id}-line)`} strokeWidth="2"/>
      {visiblePoints.length > 0 && <path d={visiblePoints.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} stroke="#ccc3e4" strokeWidth="2.3" fill="none"/>}
      <line x1={left} y1={fermiY} x2={right} y2={fermiY} stroke="#c8d2a6" strokeOpacity=".65" strokeDasharray="4 7"/>
      <rect x={right - 87} y={fermiY - 22} width="98" height="21" fill="#0a110e" rx="3"/>
      <text x={right - 1} y={fermiY - 8} textAnchor="end" fill="#c8d2a6" fontSize="10.5">Eꜰ = {fermi.toFixed(2)} eV</text>
      <circle cx={toX(fermiK)} cy={fermiY} r="4.5" fill="#c2d1ae"/><circle cx={toX(-fermiK)} cy={fermiY} r="4.5" fill="#c2d1ae"/>
      <text x="365" y="465" textAnchor="middle" fill="#718379" fontSize="10" letterSpacing="1.5">FIRST BRILLOUIN ZONE</text>
      {hover !== null && <g><line x1={toX(hover)} y1={top} x2={toX(hover)} y2={bottom} stroke="#b8c6ad" strokeOpacity=".5" strokeDasharray="3 4"/><circle cx={toX(hover)} cy={toY(-2 * hopping * Math.cos(Math.PI * hover))} r="4" fill="#eff9e7"/><rect x={Math.min(right - 156, Math.max(left, toX(hover) - 75))} y="36" width="156" height="27" rx="4" fill="#202d25" stroke="#4d6251"/><text x={Math.min(right - 78, Math.max(left + 78, toX(hover)))} y="54" textAnchor="middle" fill="#d7e5d4" fontSize="10">k = {hover.toFixed(2)}π/a · E = {(-2 * hopping * Math.cos(Math.PI * hover)).toFixed(2)} eV</text></g>}
      <rect x={left} y={top} width={width} height={height} fill="transparent" onPointerMove={event => { const svg = event.currentTarget.ownerSVGElement!; const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY; const transform = svg.getScreenCTM(); if (!transform) return; const x = point.matrixTransform(transform.inverse()).x; setHover(Math.max(-1, Math.min(1, (x - left) / width * 2 - 1)));  }}/>
    </svg>
    <div className="band-equation"><span>E(k) = ε₀ − 2t cos(ka)</span><span className="band-status"><i/> {filling === 0 ? 'Empty band' : filling === 2 ? 'Full band · insulating in this model' : 'Partially occupied · conducting'}</span></div>
    <div className="band-inline-controls">
      <label><span>Hopping strength <b>t</b></span><input aria-label="Hopping strength in electron volts" type="range" min="0.5" max="2" step="0.1" value={hopping} onChange={e => onHoppingChange(+e.target.value)}/><output>{hopping.toFixed(1)} eV</output></label>
      <label><span>Electrons per site <b>n</b></span><input aria-label="Band filling in electrons per site" type="range" min="0" max="2" step="0.05" value={filling} onChange={e => onFillingChange(+e.target.value)}/><output>{filling.toFixed(2)}</output></label>
    </div>
    <p className="plot-disclaimer"><Info size={12}/> Zero-temperature model · One spin-degenerate band · ε₀ = 0 <a href="https://en.wikipedia.org/wiki/Tight_binding" target="_blank" rel="noreferrer" aria-label="Read about the tight-binding model"> <ArrowUpRight size={12}/></a></p>
  </div>;
}
