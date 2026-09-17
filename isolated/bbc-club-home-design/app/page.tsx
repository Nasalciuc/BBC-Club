'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Globe2, Inbox, Plane, Search, UserCircle, X } from 'lucide-react'

type ScreenState = 'rest' | 'selected' | 'typing' | 'offers'

const fixture = {
  cards: [
    { title: 'Business class to London', price: '$4,200', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=500&q=80' },
    { title: 'Paris, autumn fares', price: '$3,850', image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=500&q=80' },
    { title: 'Tokyo before the holidays', price: '$4,650', image: 'https://images.unsplash.com/photo-1513407030348-c983a97b98d8?auto=format&fit=crop&w=500&q=80' },
  ],
  regions: [
    { label: 'To Europe', cards: [{ title: 'Rome in November', price: '$3,600' }, { title: 'Madrid, mid-week', price: '$3,400' }, { title: 'Lisbon', price: '' }] },
    { label: 'To Asia', cards: [{ title: 'Tokyo before the holidays', price: '$4,650' }, { title: 'Singapore', price: '$5,100' }, { title: 'Seoul', price: '' }] },
    { label: 'To the Middle East', cards: [{ title: 'Dubai', price: '$4,300' }, { title: 'Doha', price: '$4,100' }] },
  ],
  fares: [
    ['BA', 'British Airways', 'NONSTOP · 7H 05', 'Lie-flat suite', '$4,200', true],
    ['VS', 'Virgin Atlantic', 'NONSTOP · 7H 20', 'Upper Class', '$4,650', false],
    ['AA', 'American', 'NONSTOP · 7H 10', 'Flagship Business', '$4,900', false],
  ],
  airports: [
    ['LHR', 'London', 'London Heathrow'], ['LGW', 'London', 'London Gatwick'], ['LCY', 'London', 'London City'], ['CDG', 'Paris', 'Charles de Gaulle'],
  ],
}

const pinData = [
  { id: 'new-york', left: 150, top: 185, offer: false }, { id: 'london', left: 300, top: 150, offer: true },
  { id: 'paris', left: 322, top: 175, offer: false }, { id: 'rome', left: 342, top: 250, offer: true },
  { id: 'lisbon', left: 305, top: 205, offer: false }, { id: 'dubai', left: 395, top: 270, offer: false },
]

const tones = ['linear-gradient(160deg,#52677e,#26364a)', 'linear-gradient(160deg,#708092,#394a5c)', 'linear-gradient(160deg,#475b72,#1d2b3d)']

function Label({ children, action }: { children: React.ReactNode; action?: string }) {
  return <div className="section-label"><span>{children}</span>{action && <button>{action}</button>}</div>
}

function Card({ item, index = 0, image }: { item: { title: string; price: string }; index?: number; image?: string }) {
  return <article className="offer-card" style={{ backgroundImage: image ? `url(${image})` : tones[index % tones.length] }}><div className="scrim" /><div className="card-copy"><div>{item.title}</div>{item.price && <small>FROM {item.price}</small>}</div></article>
}

function Carousel({ cards, images = true }: { cards: { title: string; price: string }[]; images?: boolean }) {
  return <div className="carousel">{cards.map((card, index) => <Card key={card.title} item={card} index={index} image={images ? fixture.cards[index]?.image : undefined} />)}</div>
}

function Globe({ state, onPin }: { state: ScreenState; onPin: (id: string) => void }) {
  const selected = state === 'selected'
  return <div className={`globe ${selected ? 'globe-selected' : ''}`}>
    <div className="land land-a" /><div className="land land-b" /><div className="land land-c" /><div className="land land-d" />
    {pinData.map((pin) => <button aria-label={`Select ${pin.id}`} key={pin.id} className={`pin ${pin.offer ? 'offer' : ''} ${selected && pin.id === 'london' ? 'selected' : ''}`} style={{ left: pin.left, top: pin.top }} onClick={() => onPin(pin.id)} />)}
    {selected && <div className="pin-label" style={{ left: 300, top: 150 }}>London · <b>from $4,200</b></div>}
  </div>
}

function Status({ dark = false }: { dark?: boolean }) {
  return <div className={`status ${dark ? 'dark' : ''}`}><span>9:41</span><span className="status-icons">●●● ◔ ▮</span></div>
}

function Header({ dark = false }: { dark?: boolean }) {
  return <div className={`app-header ${dark ? 'dark' : ''}`}><span className="wordmark">BUYBUSINESSCLASS</span><span className="avatar" /></div>
}

function SearchField({ state, setState }: { state: ScreenState; setState: (state: ScreenState) => void }) {
  const selected = state === 'selected'
  return <button className={`search-field ${selected ? 'active' : ''}`} onClick={() => setState('typing')}><Search size={20} /><span>{selected ? <><span className="mono-fact">JFK → </span>London · LHR</> : 'Where would you like to fly?'}</span>{selected && <span className="clear" onClick={(event) => { event.stopPropagation(); setState('rest') }}><X size={16} /></span>}</button>
}

function Chips() { return <div className="chips"><span>▦ &nbsp;Oct 12–19</span><span>▭ &nbsp;Business</span><span>◉ &nbsp;1 adult</span></div> }

function FareRows() { return <div className="fare-list">{fixture.fares.map(([code, airline, route, cabin, price, offer]) => <div className="fare" key={code}><div className="airline-code">{code}</div><div className="fare-info"><span>{airline}</span><small>{route}</small><em>{cabin}</em></div><div className="fare-price">{offer && <b>OFFER</b>}<strong>{price}</strong></div></div>)}</div> }

function AirportList({ setState }: { setState: (state: ScreenState) => void }) { return <div className="airport-list">{fixture.airports.map(([code, city, airport], index) => <button className={`airport-row ${index === 3 ? 'recent-row' : ''}`} key={code} onClick={() => index < 3 && setState('selected')}><span className="code-pill"><Plane size={14} />{code}</span><span className="airport-copy"><span>{city}</span><small>{airport}</small></span><span className="flag" /></button>)}</div> }

function TabBar() { return <nav className="tabbar"><div className="tab active"><Globe2 /><span>EXPLORE</span></div><div className="tab requests"><Inbox /><i /><span>REQUESTS</span></div><div className="tab"><UserCircle /><span>PROFILE</span></div></nav> }

function SheetContent({ state, setState }: { state: ScreenState; setState: (state: ScreenState) => void }) {
  if (state === 'typing') return <div className="typing-content"><SearchField state={state} setState={setState} /><Label>AIRPORTS</Label><AirportList setState={setState} /><Label>RECENT</Label><div className="recent-wrap"><AirportList setState={setState} /></div></div>
  if (state === 'selected') return <><SearchField state={state} setState={setState} /><Chips /><Label>3 FARES · LOWEST FIRST</Label><FareRows /><div className="quote">Nothing that fits? <b>Request a quote →</b></div></>
  return <><SearchField state={state} setState={setState} /><Label>OFFERS TO INSPIRE <button>See all</button></Label><Carousel cards={fixture.cards} />{state === 'offers' && fixture.regions.map((region) => <section className="region" key={region.label}><Label action="See all">{region.label}</Label><Carousel cards={region.cards} images={false} /></section>)}</>
}

export default function Page() {
  const [state, setState] = useState<ScreenState>('rest')
  const [height, setHeight] = useState(35)
  const choose = (next: ScreenState) => { setState(next); setHeight(next === 'rest' ? 35 : next === 'selected' ? 60 : 100) }
  return <main className="prototype-page"><div className="switcher"><span>BBC Club — Home</span>{(['rest', 'selected', 'typing', 'offers'] as ScreenState[]).map((item) => <button key={item} className={state === item ? 'selected' : ''} onClick={() => choose(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div><div className="phone"><Status dark={state === 'typing' || state === 'offers'} /><Header dark={state === 'typing' || state === 'offers'} />{state !== 'typing' && state !== 'offers' && <><Globe state={state} onPin={() => choose('selected')} /><div className="globe-hint">DRAG TO ROTATE · TAP A CITY</div>{state === 'selected' && <svg className="arc" width="520" height="520" viewBox="0 0 520 520" aria-hidden="true"><path d="M150 185 Q 225 70 300 150" /></svg>}</>}<motion.section className={`sheet ${state === 'typing' || state === 'offers' ? 'full' : ''}`} animate={{ height: `${height}%` }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}><div className="handle" onClick={() => choose(height === 35 ? 'selected' : height === 60 ? 'offers' : 'rest')} /><div className="sheet-scroll"><SheetContent state={state} setState={choose} />{state === 'offers' && <footer>+1 212 555 0184<br /><span>Specialists available 24/7</span></footer>}</div></motion.section><TabBar /></div></main>
}
