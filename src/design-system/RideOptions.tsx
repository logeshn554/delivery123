import { Bike, Car, Truck, CheckCircle2, Circle } from 'lucide-react';
const rides=[{id:'bike',label:'Bike',description:'A two-wheel journey',Icon:Bike,tone:'peach'},{id:'auto',label:'Auto',description:'A three-wheel journey',Icon:Truck,tone:'butter'},{id:'car',label:'Car',description:'Travel in a car',Icon:Car,tone:'sky'}] as const;
export default function RideOptions({selected,onSelect,disabled}: {selected:string;onSelect:(value:string)=>void;disabled?:boolean}) {
  return <div className="stitch-ride-options" role="group" aria-label="Choose your ride">{rides.map(({id,label,description,Icon,tone})=><button type="button" key={id} disabled={disabled} aria-pressed={selected===id} onClick={()=>onSelect(id)}><span className={`stitch-ride-icon ${tone}`}><Icon size={28} strokeWidth={1.6}/></span><span><strong>{label}</strong><small>{description}</small></span><span className="stitch-ride-check">{selected===id?<CheckCircle2 size={22}/>:<Circle size={22}/>}</span></button>)}</div>;
}
