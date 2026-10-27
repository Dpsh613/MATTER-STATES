import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Atom, ChartSpline, Zap, Magnet, ScanLine, Snowflake, SlidersHorizontal, X, Plus, Minus, RotateCcw, Pause, Play, Maximize2, Minimize2, MousePointer2, ChevronLeft, ChevronRight, ArrowLeft, Info, Crosshair, BookOpen, Check, ExternalLink } from 'lucide-react';
import CrystalScene, { type AtomSelection, type SceneHandle } from './CrystalScene';
import BandPlot from './BandPlot';
import { chapters, materials, magnetization, drude, criticalField, pairedGap, formatScientific, formatLatticeParameter, type ChapterId, type MaterialId, type DefectType } from './physics';

const icons = [Atom, ChartSpline, Zap, Magnet, ScanLine, Snowflake];
const tourNotes = [
  ['Begin with the pattern.', 'Everything begins with a repeating arrangement. Rotate the lattice, then switch to a conventional cell to see how a finite shape gives rise to an infinite pattern.'],
  ['Make room for energy.', 'A periodic lattice allows only particular energy bands. Widen the hopping strength, then fill the band. Watch the Fermi level find its place.'],
  ['Give the electrons direction.', 'A field adds a tiny drift to a restless sea of electrons. Increase the field or change the scattering time. The current follows the Drude model.'],
  ['Find the collective order.', 'Individual magnetic moments can act together. Raise the temperature and watch the mean-field magnetization disappear at the Curie point.'],
  ['Break a little symmetry.', 'A missing atom is a vacancy; an extra atom is an interstitial. Place a few examples and look at the pattern they interrupt.'],
  ['Cross a different threshold.', 'Cool lead below 7.19 K. At a sufficiently low applied field, the ideal Type-I sample enters a superconducting state. Watch the field move around the material.'],
];
const latticeNotes = {
  copper: {
    lattice: { title: ['A PATTERN, REPEATED.'], detail: 'Face-centered cubic. Four lattice points per conventional cell.' },
    cell: { title: ['ONE CELL.', 'FOUR LATTICE POINTS.'], detail: 'FCC: 8 corners (⅛) + 6 faces (½).' },
  },
  iron: {
    lattice: { title: ['A PATTERN, REPEATED.'], detail: 'Body-centered cubic. Two lattice points per conventional cell.' },
    cell: { title: ['ONE CELL.', 'TWO LATTICE POINTS.'], detail: 'BCC: 8 corners (⅛) + 1 body site.' },
  },
  salt: {
    lattice: { title: ['A PATTERN, REPEATED.'], detail: 'Rock salt. An FCC lattice with a two-ion basis.' },
    cell: { title: ['FOUR LATTICE POINTS.', 'EIGHT IONS.'], detail: 'NaCl: FCC + two-ion basis = four formula units.' },
  },
} as const;

function Logo() {
  return <svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="m18 3 12 7v16l-12 7-12-7V10L18 3Z" stroke="currentColor" strokeWidth="1.1"/><path d="m6 10 12 7 12-7M18 17v16M18 3v14m0 0L6 26m12-9 12 9" stroke="currentColor" strokeWidth="1.1"/><path d="m12 6.5 12 7v15" stroke="currentColor" strokeWidth=".6" opacity=".5"/><circle cx="18" cy="17" r="2" fill="currentColor"/></svg>;
}

function Modal({ children, onClose, className = '', label }: { children: ReactNode; onClose: () => void; className?: string; label: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, [tabindex="0"]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', listener); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal-panel ${className}`} ref={panel} role="dialog" aria-modal="true" aria-label={label}><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><X size={20}/></button>{children}</div></div>;
}

function RangeControl({ label, value, min, max, step = 1, unit, onChange, hint }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (n: number) => void; hint?: string }) {
  const id = label.toLowerCase().replace(/\W/g, '-');
  return <div className="range-control"><label htmlFor={id}><span>{label}</span><output>{Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)} <small>{unit}</small></output></label><input type="range" id={id} aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} style={{ '--range-progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties}/><div className="range-endpoints"><span>{min} {unit}</span><span>{max} {unit}</span></div>{hint && <p className="range-hint">{hint}</p>}</div>;
}

export default function App() {
  const [chapter, setChapter] = useState<ChapterId>(0);
  const [material, setMaterial] = useState<MaterialId>('copper');
  const [scale, setScale] = useState<'lattice' | 'cell'>('lattice');
  const [spacing, setSpacing] = useState(100);
  const [autoRotate, setAutoRotate] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal, setModal] = useState<'science' | 'about' | 'tour' | null>(null);
  const [tourStep, setTourStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selection, setSelection] = useState<AtomSelection | null>(null);
  const [hopping, setHopping] = useState(1);
  const [filling, setFilling] = useState(1);
  const [field, setField] = useState(60);
  const [tau, setTau] = useState(25);
  const [temperature, setTemperature] = useState(300);
  const [defectType, setDefectType] = useState<DefectType>('vacancy');
  const [defectCount, setDefectCount] = useState(1);
  const [scTemperature, setScTemperature] = useState(3);
  const [scField, setScField] = useState(20);
  const [toast, setToast] = useState('');
  const scene = useRef<SceneHandle>(null);
  const stage = useRef<HTMLElement>(null);
  const chapterData = chapters[chapter];
  const sample = materials[material];
  const latticeNote = latticeNotes[material][scale];
  const conductivity = drude(field, tau);
  const m = magnetization(temperature);
  const critical = criticalField(scTemperature);
  const superconducting = scTemperature < 7.19 && scField / 1000 < critical;
  const defectLabel = `${defectCount} ${defectType === 'vacancy' ? (defectCount > 1 ? 'vacancies' : 'vacancy') : (defectCount > 1 ? 'interstitials' : 'interstitial')}`;
  const closeModal = useCallback(() => setModal(null), []);
  const onReady = useCallback(() => setReady(true), []);
  const onSelect = useCallback((atom: AtomSelection | null) => setSelection(atom), []);

  const goToChapter = useCallback((next: ChapterId) => {
    setChapter(next); setScale('lattice'); setSelection(null); setSettingsOpen(false);
    setAutoRotate(false);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || modal || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); goToChapter(((chapter + 1) % 6) as ChapterId); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goToChapter(((chapter + 5) % 6) as ChapterId); }
      if (event.key === 'Escape') { setSettingsOpen(false); setSelection(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, goToChapter, modal]);
  useEffect(() => {
    const listener = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', listener);
    return () => document.removeEventListener('fullscreenchange', listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (chapter === 1) setReady(true);
  }, [chapter]);

  const explore = () => {
    if (chapter === 0 || chapter === 4) setScale('cell');
    setSettingsOpen(true);
    if (chapter === 1) setToast('Adjust the band’s hopping strength and electron filling below the plot.');
    if (chapter === 3) setTemperature(1150);
    if (chapter === 5) setScTemperature(9);
  };
  const changeTourStep = (value: number) => {
    setTourStep(value); goToChapter(value as ChapterId);
  };
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); }
    catch { setToast('Fullscreen is unavailable in this browser. The model remains fully interactive.'); }
  };
  const inspect = () => scene.current?.inspect();
  const specimenSymbol = chapter === 3 ? 'Fe' : chapter === 5 ? 'Pb' : chapter === 2 ? 'Cu' : chapter === 4 ? sample.symbol : sample.symbol;
  const specimenName = chapter === 3 ? 'Iron' : chapter === 5 ? 'Lead' : chapter === 2 ? 'Copper' : sample.name;
  const modelDescription = chapter === 0 ? `${sample.structure} · ${scale === 'cell' ? '1 conventional cell' : sample.abbreviation === 'ROCKSALT' ? '3 × 3 × 3 cells' : '3 × 3 × 3 cells'}` : chapter === 2 ? 'Copper · Drude transport model' : chapter === 3 ? 'Iron · Mean-field Ising model' : chapter === 4 ? `${specimenName} · ${defectLabel}` : 'Lead · Ideal Type-I superconductor';

  return <div className="matter-app" style={{ '--chapter-accent': chapterData.theme } as CSSProperties}>
    <header className="site-header">
      <a className="brand" href="#explore" onClick={event => { event.preventDefault(); goToChapter(0); }} aria-label="Matter States, return to atomic lattices"><Logo/><span>MATTER <b>/</b> STATES</span></a>
      <nav className="primary-nav" aria-label="Main navigation"><button className={!modal ? 'active' : ''} onClick={() => { closeModal(); stage.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Explore</button><button className={modal === 'science' ? 'active' : ''} onClick={() => setModal('science')}>The science</button><button className={modal === 'about' ? 'active' : ''} onClick={() => setModal('about')}>About the project <ArrowUpRight size={12}/></button></nav>
      <button className="journey-button" onClick={() => { changeTourStep(0); setModal('tour'); }}><span className="journey-dot"/><span>A guided journey</span><ArrowUpRight size={14}/></button>
    </header>

    <main className={`experience chapter-${chapter} ${scale === 'cell' ? 'cell-view' : ''}`} id="explore" ref={stage}>
      <div className="scene-atmosphere" aria-hidden="true"/>
      <aside className="chapter-intro" key={`intro-${chapter}`}>
        <div className="chapter-kicker"><span>{String(chapter + 1).padStart(2, '0')}</span><i/><span>{chapterData.name}</span></div>
        <h1><span>{chapterData.heading}</span><em>{chapterData.accent}</em></h1>
        <p className="chapter-description">{chapterData.description}</p>
        <div className="intro-actions"><button className="primary-action" onClick={explore}>{chapterData.action}<ArrowRight size={17}/></button><span className="intro-chapter-number">{String(chapter + 1).padStart(2, '0')} — 06</span></div>
        <div className="intro-footnote"><span className="footnote-mark">↳</span><p>{chapter === 0 ? <>The smallest structures.<br/>The biggest ideas.</> : chapter === 1 ? <>A simple model.<br/>A deeper understanding.</> : chapter === 2 ? <>Always in motion.<br/>Only sometimes in a current.</> : chapter === 3 ? <>Individual moments.<br/>Collective possibility.</> : chapter === 4 ? <>Real materials are never perfect.<br/>That changes everything.</> : <>A different kind of matter.<br/>A quantum state, made visible.</>}</p></div>
      </aside>

      <div className={`visualization-region ${chapter === 1 ? 'band-region' : ''}`}>
        {chapter === 1 ? <BandPlot hopping={hopping} filling={filling} onHoppingChange={setHopping} onFillingChange={setFilling}/> : <CrystalScene ref={scene} chapter={chapter} material={material} scale={scale} spacing={spacing} autoRotate={autoRotate} defectType={defectType} defectCount={defectCount} temperature={temperature} field={field} tau={tau} scTemperature={scTemperature} scField={scField} onSelect={onSelect} onReady={onReady}/>}
        {chapter !== 1 && !ready && <div className="scene-loading"><span/><span>ASSEMBLING THE LATTICE</span></div>}
        {chapter !== 1 && <div className="specimen-label"><span className="element-tile"><small>{chapter === 3 ? '26' : chapter === 5 ? '82' : chapter === 2 ? '29' : material === 'salt' ? 'IONIC' : sample.number}</small>{specimenSymbol}</span><div><span>{specimenName}</span><small>{chapter === 5 ? 'CONVENTIONAL SUPERCONDUCTOR' : chapter === 3 ? 'FERROMAGNETIC BELOW 1043 K' : chapter === 4 ? 'POINT DEFECT MODEL' : chapter === 2 ? 'ELECTRON TRANSPORT' : sample.structure.toUpperCase()}</small></div></div>}
        {chapter === 0 && !selection && <div className={`lattice-annotation ${scale === 'cell' ? 'cell-annotation' : ''}`}><div className="annotation-leader"><i/></div><span>{latticeNote.title.map((line, index) => <span key={line}>{index > 0 && <br/>}{line}</span>)}</span><small>{latticeNote.detail}</small></div>}
        {chapter === 3 && <div className="scene-phase-label"><span className="phase-dot"/><span>{temperature < 1043 ? 'FERROMAGNETIC ORDER' : 'PARAMAGNETIC PHASE'}</span><b>m / m₀ = {m.toFixed(3)}</b></div>}
        {chapter === 5 && <div className="scene-phase-label"><span className="phase-dot"/><span>{superconducting ? 'MEISSNER STATE' : 'NORMAL STATE'}</span><b>{superconducting ? `Flux excluded from the bulk · T < T꜀` : scTemperature >= 7.19 ? 'T > T꜀ · Thermal disorder wins' : 'Applied field exceeds B꜀(T)'}</b></div>}
        {chapter === 2 && <div className="scene-phase-label conductivity-status"><span className="phase-dot"/><span>DRUDE TRANSPORT</span><b>J = {formatScientific(conductivity.current, 1)} A/m² <small>MODEL</small></b></div>}
        {chapter === 4 && <div className="scene-phase-label defect-status"><span className="phase-dot"/><span>{defectType === 'vacancy' ? 'A PLACE LEFT EMPTY' : 'AN UNEXPECTED VISITOR'}</span><b>{defectLabel} · schematic relaxation</b></div>}
        {selection && chapter !== 1 && <div className="atom-selection" role="status"><button className="icon-button" onClick={() => { setSelection(null); scene.current?.clearSelection(); }} aria-label="Close atom inspection"><X size={15}/></button><span className="micro">ATOM INSPECTOR</span><div className="selected-title"><b>{selection.symbol}</b><span>{selection.kind}</span></div><p>{selection.position}</p><p>{selection.explanation}</p></div>}
      </div>

      <div className="visualization-top"><span className="figure-label"><span className="live-dot"/>FIG. {String(chapter + 1).padStart(2, '0')}<i/> {chapterData.figure}</span><button className={`model-settings-button ${settingsOpen ? 'is-open' : ''}`} aria-expanded={settingsOpen} aria-controls="model-parameters" aria-label="Model controls" onClick={() => setSettingsOpen(!settingsOpen)}><SlidersHorizontal size={13}/><span>Model controls</span></button></div>

      {settingsOpen && <aside className="model-panel" id="model-parameters" aria-label="Model controls"><div className="model-panel-header"><span>THE PARAMETERS</span><button className="icon-button" aria-label="Close model controls" onClick={() => setSettingsOpen(false)}><X size={15}/></button></div>
        {chapter === 0 && <><label className="select-label">Crystal structure<select aria-label="Crystal structure" value={material} onChange={e => setMaterial(e.target.value as MaterialId)}><option value="copper">Copper · FCC</option><option value="iron">Iron · BCC</option><option value="salt">Sodium chloride · rocksalt</option></select></label><RangeControl label="Model spacing" min={85} max={115} value={spacing} unit="%" onChange={setSpacing} hint="Uniformly scales the visual model. A schematic expansion, not a thermal prediction."/><div className="parameter-note"><span>Reference lattice parameter</span><b>{formatLatticeParameter(sample.spacing)} pm</b></div><p className="panel-footnote">A room-temperature reference, not a measurement from this scene.</p></>}
        {chapter === 1 && <><p className="panel-description">A one-dimensional chain, one orbital per site, and two spin states.</p><RangeControl label="Hopping strength" min={0.5} max={2} step={0.1} value={hopping} unit="eV" onChange={setHopping}/><RangeControl label="Band filling" min={0} max={2} step={0.05} value={filling} unit="e⁻ / site" onChange={setFilling}/><div className="parameter-note"><span>Band width</span><b>{(4 * hopping).toFixed(1)} eV</b></div><p className="panel-footnote">Zero-temperature model. Real materials have multiple bands and a three-dimensional Brillouin zone.</p></>}
        {chapter === 2 && <><RangeControl label="Electric field" min={0} max={200} value={field} unit="V/m" onChange={setField}/><RangeControl label="Scattering time" min={5} max={50} value={tau} unit="fs" onChange={setTau} hint="The mean time between momentum-relaxing collisions."/><div className="calculated-readout"><span>MODEL DRIFT VELOCITY</span><b>{(conductivity.drift * 1000).toFixed(3)} <small>mm/s</small></b></div><p className="panel-footnote">Electron motion is exaggerated to reveal drift. It is not a video of actual electrons.</p></>}
        {chapter === 3 && <><RangeControl label="Temperature" min={0} max={1150} step={5} value={temperature} unit="K" onChange={setTemperature}/><div className="parameter-note"><span>Curie temperature · Fe</span><b>1043 K</b></div><div className="calculated-readout"><span>MEAN-FIELD MAGNETIZATION</span><b>{(m * 100).toFixed(1)} <small>% of saturation</small></b></div><p className="panel-footnote">Illustrative spin-½ mean-field model, restricted to the BCC α-Fe region. The structural transition near 1185 K is not modeled.</p></>}
        {chapter === 4 && <><label className="select-label">Point defect type<select aria-label="Point defect type" value={defectType} onChange={e => setDefectType(e.target.value as DefectType)}><option value="vacancy">Vacancy · a missing atom</option><option value="interstitial">Self-interstitial · an extra atom</option></select></label><RangeControl label="Defects in the sample" min={1} max={7} value={defectCount} unit="sites" onChange={setDefectCount}/><div className="parameter-note"><span>Crystal structure</span><select aria-label="Defect crystal material" value={material} onChange={e => setMaterial(e.target.value as MaterialId)}><option value="copper">Copper · FCC</option><option value="iron">Iron · BCC</option><option value="salt">NaCl · rocksalt</option></select></div><p className="panel-footnote">Placed examples, not an equilibrium concentration. Neighbor relaxation is schematic.</p></>}
        {chapter === 5 && <><RangeControl label="Temperature" min={0} max={12} step={0.1} value={scTemperature} unit="K" onChange={setScTemperature}/><RangeControl label="Applied magnetic field" min={0} max={140} value={scField} unit="mT" onChange={setScField}/><div className="calculated-readout"><span>{superconducting ? 'SUPERCONDUCTING' : 'NORMAL STATE'}</span><b>{(critical * 1000).toFixed(1)} <small>mT · B꜀(T)</small></b></div><p className="panel-footnote">Lead · ideal Type-I approximation. T꜀ = 7.19 K, B꜀(0) ≈ 80 mT. Zero-field Δ/Δ₀ = {pairedGap(scTemperature).toFixed(2)} (schematic).</p></>}
        <button className="panel-science-link" onClick={() => setModal('science')}><BookOpen size={13}/> The science behind this model <ArrowUpRight size={13}/></button>
      </aside>}

      {chapter !== 1 && <div className="visualization-bottom"><div className="model-meta"><span className="model-status"><i/> {scale === 'cell' ? 'CONVENTIONAL CELL' : '3D CRYSTAL MODEL'}</span><small>{modelDescription}</small></div><div className="scene-toolbar" role="toolbar" aria-label="3D model controls"><div className="view-switch" role="group" aria-label="Model scale"><button onClick={() => setScale('lattice')} aria-pressed={scale === 'lattice'} className={scale === 'lattice' ? 'active' : ''}>Lattice</button><button onClick={() => setScale('cell')} aria-pressed={scale === 'cell'} className={scale === 'cell' ? 'active' : ''}>Unit cell</button></div><span className="toolbar-divider"/><button className={`icon-button ${autoRotate ? 'is-active' : ''}`} onClick={() => setAutoRotate(!autoRotate)} aria-label={autoRotate ? 'Pause rotation' : 'Rotate model'} aria-pressed={autoRotate} title={autoRotate ? 'Pause rotation' : 'Rotate model'}>{autoRotate ? <Pause size={15}/> : <Play size={14}/>}</button><button className="icon-button" onClick={() => scene.current?.zoom(1.13)} aria-label="Zoom out" title="Zoom out"><Minus size={15}/></button><button className="icon-button" onClick={() => scene.current?.zoom(0.87)} aria-label="Zoom in" title="Zoom in"><Plus size={15}/></button><button className="icon-button" onClick={() => { scene.current?.reset(); scene.current?.clearSelection(); setSelection(null); }} aria-label="Reset camera" title="Reset camera"><RotateCcw size={14}/></button><button className="icon-button inspect-button" onClick={inspect} aria-label="Inspect an atom" title="Inspect an atom"><Crosshair size={14}/></button><button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title="Fullscreen">{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button></div><div className="interaction-hint"><MousePointer2 size={11}/><span>DRAG TO ROTATE</span><i/><span>SCROLL TO EXPLORE</span></div></div>}
      {chapter === 1 && <div className="band-stage-footer"><button className="text-button" onClick={() => setModal('science')}><Info size={12}/> A simple band, not a complete band structure</button><button className="text-button" onClick={toggleFullscreen}><Maximize2 size={12}/> {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button></div>}
      <button className="chapter-next" onClick={() => goToChapter(((chapter + 1) % 6) as ChapterId)} aria-label={`Next chapter: ${chapters[(chapter + 1) % 6].name}`}><span>UP NEXT</span><ChevronRight size={17}/></button>
    </main>

    <nav className="chapter-navigation" aria-label="Explore the six chapters">
      {chapters.map((item, index) => { const Icon = icons[index]; return <button key={item.id} className={`chapter-tab ${chapter === index ? 'active' : ''}`} aria-current={chapter === index ? 'step' : undefined} onClick={() => goToChapter(index as ChapterId)}><span className="chapter-tab-top"><span className="chapter-number">{String(index + 1).padStart(2, '0')}</span><Icon size={18} strokeWidth={1.1}/></span><span className="chapter-tab-title">{item.name}<span className="active-tab-dot"/></span><span className="chapter-tab-description">{item.short}</span></button>; })}
    </nav>
    <footer className="site-footer"><span>AN EXPLORATION OF CONDENSED MATTER</span><div className="keyboard-guide"><kbd><ArrowLeft size={10}/></kbd><kbd><ArrowRight size={10}/></kbd><span>TO MOVE BETWEEN WORLDS</span></div><button onClick={() => setModal('science')}>Grounded in physics. Open to wonder. <ArrowUpRight size={11}/></button></footer>

    {modal === 'science' && <Modal onClose={closeModal} label={`The science: ${chapterData.name}`} className="science-modal"><div className="modal-eyebrow"><span>{String(chapter + 1).padStart(2, '0')} / 06</span><i/>THE SCIENCE</div><h2>{chapterData.name}<span className="title-period">.</span></h2><p className="modal-lead">{chapterData.insight}</p><div className="science-equation">{chapterData.equation}</div><p className="science-explanation">{chapterData.explanation}</p><div className="model-caveat"><Info size={15}/><div><h3>A note on the model</h3><p>{chapterData.model}</p></div></div><div className="reference-list"><span className="micro">FOLLOW THE SCIENCE</span>{chapterData.references.map(([name, url]) => <a href={url} target="_blank" rel="noreferrer" key={url}>{name}<ExternalLink size={12}/></a>)}</div><div className="modal-bottom"><button className="primary-action" onClick={closeModal}>Back to the experiment<ArrowRight size={16}/></button><span>MODELS, NOT MEASUREMENTS.</span></div></Modal>}
    {modal === 'about' && <Modal onClose={closeModal} label="About Matter States" className="about-modal"><div className="modal-eyebrow"><Logo/>MATTER / STATES</div><h2>A field guide to<br/><em>the invisible.</em></h2><p className="modal-lead">Matter is more than what you can hold. It is the patterns, interactions, and improbable agreements hiding inside it.</p><p className="science-explanation">This independent, interactive introduction to condensed matter turns a university-level subject into a place to explore. Six connected chapters. Real models. Room for curiosity.</p><div className="about-principles"><div><MousePointer2 size={19}/><span><strong>Look closer.</strong><p>Rotate a structure. Inspect an atom. Switch scales.</p></span></div><div><SlidersHorizontal size={19}/><span><strong>Change something.</strong><p>Adjust a physical parameter and see what follows.</p></span></div><div><BookOpen size={19}/><span><strong>Know the limits.</strong><p>Every model includes its assumptions and references. No simulated result is presented as a measurement.</p></span></div></div><div className="about-colophon"><span>BUILT FOR CURIOSITY</span><span>NOT A SUBSTITUTE FOR A TEXTBOOK. AN INVITATION TO OPEN ONE.</span></div><button className="primary-action" onClick={() => { closeModal(); goToChapter(0); }}>Enter the atomic world<ArrowRight size={16}/></button></Modal>}
    {modal === 'tour' && <Modal onClose={closeModal} label="A guided journey through matter" className="tour-modal"><div className="modal-eyebrow">A GUIDED JOURNEY<span>6 WORLDS · ONE MATERIAL UNIVERSE</span></div><div className="tour-progress">{chapters.map((item, index) => <button key={item.id} className={index <= tourStep ? 'complete' : ''} onClick={() => changeTourStep(index)} aria-label={`Go to ${item.name}`} aria-current={index === tourStep ? 'step' : undefined}/>)}</div><span className="tour-chapter-index">0{tourStep + 1} / {chapters[tourStep].name.toUpperCase()}</span><h2>{tourNotes[tourStep][0]}</h2><p className="modal-lead">{tourNotes[tourStep][1]}</p><div className="science-equation">{chapters[tourStep].equation}</div><div className="tour-nav"><button className="text-button" onClick={() => changeTourStep(tourStep - 1)} disabled={tourStep === 0}><ChevronLeft size={16}/> Previous</button><button className="primary-action" onClick={() => tourStep === 5 ? closeModal() : changeTourStep(tourStep + 1)}>{tourStep === 5 ? 'Explore on your own' : 'The next discovery'}<ArrowRight size={16}/></button></div><button className="tour-experiment-link" onClick={() => { closeModal(); setSettingsOpen(true); }}>Pause the guide and try this experiment <ArrowUpRight size={12}/></button></Modal>}
    {toast && <div className="toast" role="status"><Check size={15}/>{toast}<button onClick={() => setToast('')} aria-label="Dismiss message"><X size={13}/></button></div>}
    <div className="sr-only" aria-live="polite">Chapter {chapter + 1} of 6: {chapterData.name}. {chapterData.description}</div>
  </div>;
}
