import fs from 'node:fs';
import { parse } from 'dotenv';
const environment = process.argv.find(value=>value.startsWith('--environment='))?.split('=')[1];
if (!['staging','production'].includes(environment)) { console.error('Use --environment=staging or --environment=production.');process.exit(1); }
const file = `.env.${environment}.local`, otherFile = `.env.${environment==='staging'?'production':'staging'}.local`;
const env = fs.existsSync(file)?parse(fs.readFileSync(file)):{};
const other = fs.existsSync(otherFile)?parse(fs.readFileSync(otherFile)):{};
const errors = [];
const required = ['DATABASE_URL','FIREBASE_PROJECT_ID','FIRESTORE_DATABASE_ID','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_DATABASE_ID','VITE_FIREBASE_APP_ID','VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_MESSAGING_SENDER_ID','VITE_ACCOUNT_API_URL','ACCOUNT_ALLOWED_ORIGINS','ACCOUNT_EMAIL_API_KEY','ACCOUNT_EMAIL_FROM','VITE_APP_CHECK_SITE_KEY','VITE_SUPPORT_EMAIL','VITE_PRIVACY_URL','VITE_TERMS_URL','VITE_CANCELLATION_URL'];
for(const key of required) if(!env[key]?.trim())errors.push(`${key} is missing from the ${environment} configuration.`);
for(const key of ['VITE_ACCOUNT_API_URL','VITE_PRIVACY_URL','VITE_TERMS_URL','VITE_CANCELLATION_URL']) {
  try {const url=new URL(env[key]);if(url.protocol!=='https:'||url.username||url.password||['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(url.hostname))throw new Error();} catch{errors.push(`${key} must use a deployed HTTPS URL.`);}
}
if(env.FIREBASE_PROJECT_ID!==env.VITE_FIREBASE_PROJECT_ID || env.FIRESTORE_DATABASE_ID!==env.VITE_FIREBASE_DATABASE_ID)errors.push('Client and account-server Firebase identity configuration must match.');
for(const key of ['DATABASE_URL','FIREBASE_PROJECT_ID','ACCOUNT_EMAIL_API_KEY'])if(env[key]&&other[key]===env[key])errors.push(`${key} is shared between staging and production.`);
for(const key of ['ACCOUNT_FIREBASE_BRIDGE_ENABLED','VITE_APP_CHECK_ENABLED','REQUIRE_APP_CHECK'])if(env[key]!=='true')errors.push(`${key} requires validated provider configuration and enforcement for release.`);
if(env.VITE_APP_CHECK_DEBUG==='true')errors.push('App Check debug mode must be disabled for release.');
if((env.ACCOUNT_ALLOWED_ORIGINS||'').split(',').some(origin=>origin.trim()==='*'||origin.trim().startsWith('http://')))errors.push('Release account origins must be explicit secure web/native origins.');
for(const [label,path] of [['Android Firebase registration','android/app/google-services.json'],['iOS Firebase registration','ios/App/App/GoogleService-Info.plist']])if(!fs.existsSync(path))errors.push(`${label} is missing.`);
if(fs.existsSync('android/app/google-services.json'))try{const config=JSON.parse(fs.readFileSync('android/app/google-services.json','utf8'));if(config.project_info?.project_id!==env.FIREBASE_PROJECT_ID||!config.client?.some(client=>client.client_info?.android_client_info?.package_name==='in.allgo.app'))errors.push('Android Firebase registration does not match the selected release project and package.');}catch{errors.push('Android Firebase registration cannot be parsed.');}
for(const key of Object.keys(env))if(key.startsWith('VITE_')&&/(?:SECRET|PASSWORD|DATABASE_URL|PRIVATE_KEY|EMAIL_API_KEY)/.test(key))errors.push(`${key} exposes a server credential to the client build.`);
if(errors.length){console.error(`Release configuration check failed (${environment}). Values are omitted:`);errors.forEach(error=>console.error(`- ${error}`));process.exit(1);}
console.log(`${environment} configuration checks passed. Real provider, signed-device and operational acceptance are still required before deployment.`);
