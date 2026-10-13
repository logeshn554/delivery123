import type { ComponentType, ReactNode } from 'react';
import { ChevronRight, UserRound } from 'lucide-react';
import type { UserProfile } from '../types';
import { CatalogImage } from '../design-system/CatalogImage';
export type ProfileAction = {label:string;detail?:string;Icon:ComponentType<{size?:number}>;value?:string;onClick:()=>void};
export default function ProfileScreen({profile,name,actions,children,onSignOut}: {profile?:UserProfile|null;name:string;actions:ProfileAction[];children?:ReactNode;onSignOut:()=>void}) {
  return <section className="stitch-profile"><header><h1>Profile</h1></header><div className="stitch-profile-person"><CatalogImage src={profile?.photoURL} alt="" className="stitch-profile-avatar" fallback={<UserRound size={46} strokeWidth={1.3}/>}/><h2>{name||'Your AllGo account'}</h2>{(profile?.phone||profile?.email)&&<p>{profile.phone||profile.email}</p>}</div><div className="stitch-profile-links">{actions.map(({label,detail,Icon,value,onClick})=><button type="button" key={label} onClick={onClick}><Icon size={20}/><span><strong>{label}</strong>{detail&&<small>{detail}</small>}</span>{value&&<span className="stitch-profile-value">{value}</span>}<ChevronRight size={17}/></button>)}</div>{children}<button type="button" className="stitch-signout" onClick={onSignOut}>Sign out</button></section>;
}
